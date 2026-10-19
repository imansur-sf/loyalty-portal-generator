const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDurableStore,hash}=require('../durable-store');
const {randomBytes}=require('node:crypto');
const connectionString=process.env.LPG_TEST_DATABASE_URL;
test('Postgres restart/cross-connection claims, shared quotas, fencing and retention', {skip:!connectionString},async t=>{
 const {Pool}=require('pg');
 const local=/(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/)/.test(connectionString);
 const options={connectionString,max:2,connectionTimeoutMillis:8000,...(local?{}:{ssl:{rejectUnauthorized:false}})};
 const firstPool=new Pool(options),secondPool=new Pool(options);
 const first=createDurableStore({pool:firstPool}),second=createDurableStore({pool:secondPool});
 const owner='test_'+randomBytes(20).toString('hex'),ownerHash=hash(owner),id=randomBytes(18).toString('hex'),tokenHash=hash('synthetic_'+id);
 const reservations=[];
 t.after(async()=>{
   try {
     // Every deletion is scoped to this test's cryptographically unique owner
     // or the exact active reservation IDs returned to this test.
     await firstPool.query('DELETE FROM lpg_generation_jobs WHERE owner=$1',[ownerHash]);
     await firstPool.query('DELETE FROM lpg_generation_usage WHERE owner=$1',[ownerHash]);
     if(reservations.length)await firstPool.query('DELETE FROM lpg_generation_active WHERE id=ANY($1::text[])',[reservations]);
   }finally{await Promise.all([first.close(),second.close()]);}
 });
 await Promise.all([first.ready,second.ready]);
 const job={id,owner:hash(owner),token_hash:tokenHash,idempotency_key:'test_'+randomBytes(16).toString('hex'),request_hash:hash('synthetic input'),kind:'llm',input:{prompt:'Offline synthetic storage test'}};
 const limits={windowMs:3600000,maxIdentities:5000,maxCalls:1,maxTokens:100,maxImages:10,maxScrapes:1,maxActive:6,maxImageActive:8};
 const created=await first.createJob(job);assert.equal(created.created,true);
 const replay=await second.createJob({...job,id:randomBytes(18).toString('hex')});assert.equal(replay.created,false);assert.equal(replay.job.id,id);
 assert.equal((await second.createJob({...job,request_hash:hash('different')})).conflict,true);
 const claims=await Promise.all([first.claimJob(id,'lease-one'),second.claimJob(id,'lease-two')]);assert.equal(claims.filter(Boolean).length,1);
 const winner=claims.find(Boolean).lease_id;
 await first.completeJob(id,'not-the-lease',{status:200,body:{text:'wrong'}});assert.equal((await second.getJob(id,tokenHash)).status,'running');
 await second.completeJob(id,winner,{status:200,body:{text:'durable'}});const saved=await first.getJob(id,tokenHash);assert.equal(saved.result.body.text,'durable');assert.equal(saved.input,null);
 assert.equal(await second.getJob(id,hash('wrong')),undefined);
 await firstPool.query(`UPDATE lpg_generation_jobs SET result_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1 AND owner=$2`,[id,ownerHash]);
 assert.equal((await second.getJob(id,tokenHash)).status,'expired');
 const cap=await first.issue(owner,limits);assert.ok(cap.expiresAt>Date.now());
 const reserved=await first.reserve(owner,{tokens:10,images:0,scrape:false},limits);assert.ok(reserved.id);reservations.push(reserved.id);
 await second.release(reserved.id);assert.equal((await second.reserve(owner,{tokens:1,images:0,scrape:false},limits)).error,'generation_budget_exceeded');
 // Explicit cancellation prevents queued claims on another database connection.
 const next={...job,id:randomBytes(18).toString('hex'),idempotency_key:'test_'+randomBytes(16).toString('hex')};await first.createJob(next);assert.equal(await second.cancelJob(next.id,tokenHash),true);assert.equal(await first.claimJob(next.id,'lease'),undefined);
 const active={...job,id:randomBytes(18).toString('hex'),idempotency_key:'test_'+randomBytes(16).toString('hex')};
 await first.createJob(active);await first.claimJob(active.id,'active-lease');await second.cancelJob(active.id,tokenHash);
 await first.completeJob(active.id,'active-lease',{status:200,body:{text:'must discard'}});
 const cancelled=await second.getJob(active.id,tokenHash);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.result,null);assert.equal(cancelled.input,null);
});

test('failed durable initialization is reported rather than silently using process memory',async()=>{
 const store=createDurableStore({pool:{query:async()=>{throw Error('private connection string');},end:async()=>{}}});
 await assert.rejects(store.ready,/generation_storage_unavailable/);assert.equal(store.healthy,false);await assert.rejects(store.createJob({}),/generation_storage_unavailable/);
});
