const { randomBytes, createHmac } = require('node:crypto');
const { hash } = require('./durable-store');
// A paid dispatch is claimed exactly once. An expired running lease is uncertain,
// never automatically retried: the provider may have charged before interruption.
function createDurableGenerationJobs({store,handlers,validators={},secret,maxResultBytes=20*1024*1024,now=Date.now}={}) {
  const metrics={submitted:0,reused:0,completed:0,failed:0,cancelled:0};
  const tokenFor=id=>createHmac('sha256',secret).update('lpg-job:'+id).digest('hex');
  const ownerFor=req=>hash(req.generationIdentity || req.ip || 'unknown');
  const supplied=req=>hash(String(req.headers.authorization||'').replace(/^Bearer /,''));
  const fail=res=>res.status(503).json({error:'generation_storage_unavailable',retryAfterMs:5000});
  function statusOf(job) {
    if(job.status==='running' && new Date(job.lease_expires_at).getTime()<=new Date(job.server_now||now()).getTime())return 'interrupted';
    return job.status==='queued'||job.status==='running'?'pending':job.status;
  }
  async function execute(job,req) {
    const lease=randomBytes(18).toString('hex');
    let claimed;
    try{claimed=await store.claimJob(job.id,lease);}catch{return;}
    if(!claimed)return;
    const started=now();let status=200,result,completed=false;
    const output={set(){return output;},status(value){status=value;return output;},json(value){if(!completed){completed=true;result={status,body:value};}return output;}};
    try {
      await handlers[claimed.kind]({body:claimed.input,headers:req.headers,ip:req.ip,generationIdentity:req.generationIdentity},output);
      if(!completed)output.status(502).json({error:'generation_empty_response'});
    }catch{output.status(502).json({error:'generation_failed'});}
    if(Buffer.byteLength(JSON.stringify(result))>maxResultBytes)result={status:503,body:{error:'generation_result_too_large'}};
    try{await store.completeJob(job.id,lease,result);metrics.completed++;if(result.status>=400)metrics.failed++;}
    catch{metrics.failed++;console.error('[Generation] checkpoint_failed');}
    console.info(`[Generation] id=${job.id} kind=${claimed.kind} status=${result.status} duration_ms=${now()-started}`);
  }
  async function submit(req,res) {
    res.set('Cache-Control','no-store');
    const {kind,...body}=req.body||{};
    if(!Object.hasOwn(handlers,kind))return res.status(400).json({error:'invalid_job_kind'});
    if(validators[kind] && validators[kind]({body,headers:req.headers,ip:req.ip},res))return;
    if(kind==='images' && body.prompts?.length>4)return res.status(400).json({error:'invalid_prompts',max:4});
    const idempotencyKey=req.headers['idempotency-key'] || randomBytes(24).toString('hex');
    if(typeof idempotencyKey!=='string'|| !/^[A-Za-z0-9_-]{16,200}$/.test(idempotencyKey))return res.status(400).json({error:'invalid_idempotency_key'});
    const id=randomBytes(18).toString('hex');
    try {
      const created=await store.createJob({id,owner:ownerFor(req),token_hash:hash(tokenFor(id)),idempotency_key:idempotencyKey,request_hash:hash(JSON.stringify({kind,...body})),kind,input:body});
      if(created.conflict)return res.status(409).json({error:'idempotency_conflict'});
      if(created.busy)return res.status(429).json({error:'generation_busy',retryAfterMs:5000});
      metrics[created.created?'submitted':'reused']++;
      res.status(created.created?202:200).json({id:created.job.id,token:tokenFor(created.job.id),durable:true});
      if(created.created)void execute(created.job,req);
    }catch{return fail(res);}
  }
  async function poll(req,res) {
    res.set('Cache-Control','no-store');
    try {
      const job=await store.getJob(req.params.id,supplied(req));
      if(!job)return res.status(404).json({error:'generation_job_missing'});
      const status=statusOf(job);
      if(status==='complete')return res.json({status,result:job.result});
      if(status==='interrupted')return res.json({status,error:'generation_outcome_unknown',resumable:false});
      if(status==='expired')return res.json({status,error:'generation_result_expired',resumable:false});
      if(status==='cancelled')return res.json({status});
      return res.json({status,resumable:job.status==='queued',cancelRequested:job.cancel_requested,phase:job.status==='queued'?'queued':'provider_dispatch'});
    }catch{return fail(res);}
  }
  async function remove(req,res) {
    res.set('Cache-Control','no-store');
    try {
      if(!await store.cancelJob(req.params.id,supplied(req)))return res.status(404).json({error:'generation_job_missing'});
      metrics.cancelled++;return res.sendStatus(204);
    }catch{return fail(res);}
  }
  async function resume(req,res) {
    res.set('Cache-Control','no-store');
    try {
      const job=await store.getJob(req.params.id,supplied(req));
      if(!job || job.owner!==ownerFor(req))return res.status(404).json({error:'generation_job_missing'});
      if(job.status!=='queued')return res.status(409).json({error:'generation_not_resumable',status:statusOf(job)});
      res.status(202).json({id:job.id,token:tokenFor(job.id),durable:true});void execute(job,req);
    }catch{return fail(res);}
  }
  return {submit,poll,remove,resume,metrics:()=>({...metrics}),close(){}};
}
module.exports={createDurableGenerationJobs};
