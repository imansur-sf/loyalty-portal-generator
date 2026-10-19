const {test}=require('node:test');
const assert=require('node:assert/strict');
const app=require('../server');
test('backend advertises guest adapter paths, honest storage and readiness without leaking private modules',async t=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const metadata=await(await fetch(base+'/api/capabilities')).json();
 assert.equal(metadata.requiresAccount,false);assert.equal(metadata.guestGeneration,true);assert.equal(metadata.jobs.automaticPaidReplay,false);assert.equal(metadata.jobs.durable,Boolean(process.env.LPG_DATABASE_URL));assert.equal(metadata.llm,'/api/llm');assert.equal(metadata.limits.imageBatch,4);
 const health=await(await fetch(base+'/api/health')).json();assert.equal(health.storage,process.env.LPG_DATABASE_URL?'postgres':'memory');assert.equal(health.durable_generation,Boolean(process.env.LPG_DATABASE_URL));
 try{const meta=JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'../assets/build-meta.json'),'utf8'));assert.equal(health.buildId,meta.buildId);}catch(error){if(error.code!=='ENOENT')throw error;}
 const ready=await fetch(base+'/api/ready');assert.equal(ready.status,200);
 for(const route of ['/durable-store.js','/durable-generation-jobs.js','/test/durable-store.test.js'])assert.equal((await fetch(base+route)).status,404);
 assert.equal((await fetch(base+'/api/jobs/unknown/resume',{method:'POST'})).status,401);
});
