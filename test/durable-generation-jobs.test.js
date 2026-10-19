const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDurableGenerationJobs}=require('../durable-generation-jobs');
const {hash}=require('../durable-store');
function response(){return {statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},sendStatus(n){this.statusCode=n;return this;}};}
function request(body={kind:'llm',prompt:'Synthetic'},extra={}){return {body,ip:'guest',generationIdentity:'guest',headers:{'idempotency-key':'synthetic_idempotency_12345'},params:{},...extra};}
function sharedStore(){
 const rows=new Map();
 return {rows,
  async createJob(job){const old=[...rows.values()].find(x=>x.owner===job.owner&&x.idempotency_key===job.idempotency_key);if(old)return {job:structuredClone(old),created:false,conflict:old.request_hash!==job.request_hash};const row={...structuredClone(job),status:'queued',expires_at:new Date(Date.now()+86400000),cancel_requested:false};rows.set(job.id,row);return {job:structuredClone(row),created:true};},
  async getJob(id,token){const row=rows.get(id);return row&&row.token_hash===token?structuredClone(row):undefined;},
  async claimJob(id,lease){const row=rows.get(id);if(!row||row.status!=='queued'||row.cancel_requested)return;Object.assign(row,{status:'running',lease_id:lease,lease_expires_at:new Date(Date.now()+180000)});return structuredClone(row);},
  async completeJob(id,lease,result){const row=rows.get(id);if(row?.lease_id===lease){row.status=row.cancel_requested?'cancelled':'complete';row.result=row.cancel_requested?null:result;row.input=null;}},
  async cancelJob(id,token){const row=rows.get(id);if(!row||row.token_hash!==token)return false;row.cancel_requested=true;if(row.status==='queued'){row.status='cancelled';row.input=null;}return true;}
 };
}
const tick=()=>new Promise(r=>setImmediate(r));
function api(store,handlers,other={}){return createDurableGenerationJobs({store,handlers,secret:'persistent-synthetic-job-secret',...other});}
async function submit(jobs,req=request()){const out=response();await jobs.submit(req,out);await tick();return out;}
function ticketRequest(ticket,extra={}){return request({}, {params:{id:ticket.id},headers:{authorization:'Bearer '+ticket.token},...extra});}
test('durable completed stage survives instance replacement and same key never repeats paid work',async()=>{
 const store=sharedStore();let calls=0;const handlers={llm:async(_,res)=>{calls++;res.json({text:'saved'});}};
 const first=api(store,handlers);const ticket=(await submit(first)).body;
 const second=api(store,handlers);const out=response();await second.poll(ticketRequest(ticket),out);
 assert.deepEqual(out.body,{status:'complete',result:{status:200,body:{text:'saved'}}});
 const retry=await submit(second);assert.equal(retry.statusCode,200);assert.deepEqual(retry.body,ticket);assert.equal(calls,1);
 const conflict=await submit(second,request({kind:'llm',prompt:'Changed'}));assert.equal(conflict.statusCode,409);assert.equal(calls,1);
 const serialized=JSON.stringify([...store.rows.values()]);assert.equal(serialized.includes(ticket.token),false);assert.equal(serialized.includes('Synthetic'),false);
});
test('cross-instance idempotent requests and claims dispatch at most once',async()=>{
 const store=sharedStore();let calls=0,finish;const handlers={llm:async(_,res)=>{calls++;await new Promise(r=>finish=r);res.json({text:'saved'});}};
 const a=api(store,handlers),b=api(store,handlers);
 const [one,two]=await Promise.all([submit(a),submit(b)]);assert.equal(one.body.id,two.body.id);assert.equal(calls,1);
 finish();await tick();
});
test('ticket isolation and anonymous owner separation apply without account sign in',async()=>{
 const store=sharedStore(),jobs=api(store,{llm:async(_,res)=>res.json({text:'private'})});
 const ticket=(await submit(jobs)).body;
 const wrong=response();await jobs.poll(ticketRequest({...ticket,token:'wrong'}),wrong);assert.equal(wrong.statusCode,404);
 const stranger=await submit(jobs,request(undefined,{generationIdentity:'another guest'}));assert.notEqual(stranger.body.id,ticket.id);
});
test('interrupted paid dispatch is visible and is never resumed or replayed',async()=>{
 const store=sharedStore();let calls=0;const jobs=api(store,{llm:async()=>{calls++;await new Promise(()=>{});}});
 const ticket=(await submit(jobs)).body;store.rows.get(ticket.id).lease_expires_at=new Date(0);
 const out=response();await jobs.poll(ticketRequest(ticket),out);assert.deepEqual(out.body,{status:'interrupted',error:'generation_outcome_unknown',resumable:false});
 const retry=await submit(api(store,{llm:()=>calls++}));assert.equal(retry.body.id,ticket.id);assert.equal(calls,1);
 const resume=response();await jobs.resume(ticketRequest(ticket),resume);assert.equal(resume.statusCode,409);assert.equal(calls,1);
});
test('queued stages resume explicitly and cancellation blocks future dispatch',async()=>{
 const store=sharedStore();let calls=0;const jobs=api(store,{llm:async(_,res)=>{calls++;res.json({text:'done'});}});
 // Simulate a process loss after durable insert but before claim.
 const originalClaim=store.claimJob;store.claimJob=async()=>undefined;
 const ticket=(await submit(jobs)).body;store.claimJob=originalClaim;
 const poll=response();await jobs.poll(ticketRequest(ticket),poll);assert.equal(poll.body.resumable,true);assert.equal(calls,0);
 const foreign=response();await jobs.resume(ticketRequest(ticket,{generationIdentity:'stranger'}),foreign);assert.equal(foreign.statusCode,404);
 const resumed=response();await jobs.resume(ticketRequest(ticket),resumed);await tick();assert.equal(resumed.statusCode,202);assert.equal(calls,1);
 store.claimJob=async()=>undefined;const next=(await submit(jobs,request(undefined,{headers:{'idempotency-key':'second_synthetic_key_12345'}}))).body;store.claimJob=originalClaim;
 const cancelled=response();await jobs.remove(ticketRequest(next),cancelled);assert.equal(cancelled.statusCode,204);
 const denied=response();await jobs.resume(ticketRequest(next),denied);assert.equal(denied.statusCode,409);assert.equal(calls,1);
});
test('cancelling in-flight work discards output without granting a second paid dispatch',async()=>{
 const store=sharedStore();let finish;const jobs=api(store,{llm:async(_,res)=>{await new Promise(r=>finish=r);res.json({text:'discard'});}});
 const ticket=(await submit(jobs)).body;await jobs.remove(ticketRequest(ticket),response());finish();await tick();
 const out=response();await jobs.poll(ticketRequest(ticket),out);assert.equal(out.body.status,'cancelled');assert.equal(store.rows.get(ticket.id).result,null);
});
test('storage failures fail closed, input validation does not consume durable capacity',async()=>{
 const store=sharedStore();let calls=0;store.createJob=async()=>{throw Error('secret sql url');};
 const jobs=api(store,{llm:()=>calls++});const out=await submit(jobs);assert.equal(out.statusCode,503);assert.equal(out.body.error,'generation_storage_unavailable');assert.equal(calls,0);
 const invalid=await submit(jobs,request(undefined,{headers:{'idempotency-key':'short'}}));assert.equal(invalid.statusCode,400);
});

test('expired image checkpoints are terminal and retain idempotency without repeating generation',async()=>{
 const store=sharedStore();let calls=0;const jobs=api(store,{image:async(_,res)=>{calls++;res.json({imageData:'synthetic'});}});
 const ticket=(await submit(jobs,request({kind:'image',prompt:'Synthetic image'}))).body;
 Object.assign(store.rows.get(ticket.id),{status:'expired',result:null});
 const out=response();await jobs.poll(ticketRequest(ticket),out);assert.deepEqual(out.body,{status:'expired',error:'generation_result_expired',resumable:false});
 const replay=await submit(jobs,request({kind:'image',prompt:'Synthetic image'}));assert.equal(replay.body.id,ticket.id);assert.equal(calls,1);
});
