const { test } = require('node:test');
const assert = require('node:assert/strict');
process.env.GEMINI_API_KEY = 'synthetic-test-key';
const app = require('../server');
const nativeFetch = global.fetch;
test('real routes submit and retrieve LLM/image work without holding the submit request', async t => {
  let finish;
  global.fetch = async (url, options) => {
    assert.match(url, /^https:\/\/generativelanguage.googleapis.com\//);
    const body = JSON.parse(options.body);
    if (body.generationConfig.responseModalities) {
      return new Response(JSON.stringify({ candidates: [{content:{parts:[{inlineData:{mimeType:'image/png',data:'synthetic'}}]}}] }));
    }
    if (body.contents[0].parts[0].text === 'bounded JSON') {
      assert.equal(body.generationConfig.maxOutputTokens,16000);
      assert.equal(body.generationConfig.responseMimeType,'application/json');
      assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'low');
      return new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'hidden reasoning',thought:true},{text:'{"program":{}}'}]}}]}));
    }
    if (body.contents[0].parts[0].text === 'empty cutoff') {
      return new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[]}}]}));
    }
    await new Promise(resolve => { finish = resolve; });
    return new Response(JSON.stringify({ candidates: [{content:{parts:[{text:'{"program":"demo"}'}]}}] }));
  };
  const server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  t.after(async()=>{global.fetch=nativeFetch;await new Promise(r=>server.close(r));});
  const base = `http://127.0.0.1:${server.address().port}`;
  const capabilityResponse = await nativeFetch(base+'/api/capability',{method:'POST',headers:{Origin:base}});
  assert.equal(capabilityResponse.status,200);
  const capability=(await capabilityResponse.json()).token;
  const headers={'Content-Type':'application/json','X-LPG-Capability':capability};
  for (const route of ['/api/llm','/api/generate-image','/api/generate-images','/api/jobs']) {
    const denied=await nativeFetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'must never reach provider'})});
    assert.equal(denied.status,401,route);
  }
  async function submit(body) {
    const r=await nativeFetch(base+'/api/jobs',{method:'POST',headers,body:JSON.stringify(body)});
    assert.equal(r.status,202);return r.json();
  }
  async function poll(job) {return (await nativeFetch(base+'/api/jobs/'+job.id,{headers:{Authorization:'Bearer '+job.token}})).json();}
  const llm=await submit({kind:'llm',prompt:'Fictional portal'});
  assert.deepEqual(await poll(llm),{status:'pending'});finish();
  assert.equal((await poll(llm)).result.body.text,'{"program":"demo"}');
  const bounded=await submit({kind:'llm',prompt:'bounded JSON',maxTokens:99999,responseFormat:'json'});
  const boundedResult=(await poll(bounded)).result.body;
  assert.equal(boundedResult.text,'{"program":{}}'); assert.equal(boundedResult.finish_reason,'MAX_TOKENS');
  const empty=await submit({kind:'llm',prompt:'empty cutoff',responseFormat:'json'});
  assert.equal((await poll(empty)).result.body.finish_reason,'MAX_TOKENS');
  const image=await submit({kind:'images',prompts:[{slot:'benefit0',prompt:'Fictional benefit'}]});
  const result=await poll(image);
  assert.equal(result.result.body.results[0].imageData,'data:image/png;base64,synthetic');
  const invalid=await nativeFetch(base+'/api/jobs',{method:'POST',headers,body:JSON.stringify({kind:'llm'})});
  assert.equal(invalid.status,400); assert.deepEqual(await invalid.json(),{error:'missing_prompt'});
  for (const system of [{length:'-100000'},{length:'not a number'},[],['unexpected'],null]) {
    const invalidSystem=await nativeFetch(base+'/api/llm',{method:'POST',headers,body:JSON.stringify({prompt:'valid',system})});
    assert.equal(invalidSystem.status,400);assert.equal((await invalidSystem.json()).error,'invalid_system');
  }
  const cors=await nativeFetch(base+'/api/jobs/'+llm.id,{method:'OPTIONS'});
  assert.match(cors.headers.get('access-control-allow-headers'),/Authorization/);
  assert.match(cors.headers.get('access-control-allow-methods'),/DELETE/);
  assert.equal((await nativeFetch(base+'/api/unknown')).status,404);
});

test('direct and pollable paid routes share concurrency and rightmost trusted address ignores spoofed first hop',async t=>{
  const releases=[];let providerCalls=0;
  global.fetch=async()=>{providerCalls++;await new Promise(resolve=>releases.push(resolve));return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'ok'}]}}]}));};
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{releases.forEach(r=>r());global.fetch=nativeFetch;await new Promise(r=>server.close(r));app.set('trust proxy',false);});
  app.set('trust proxy',1);
  const base=`http://127.0.0.1:${server.address().port}`;
  const origin={Origin:base,'X-Forwarded-For':'1.1.1.1, 203.0.113.44'};
  const cap=await(await nativeFetch(base+'/api/capability',{method:'POST',headers:origin})).json();
  const headers={...origin,'Content-Type':'application/json','X-LPG-Capability':cap.token};
  const changedFirstHop={...headers,'X-Forwarded-For':'8.8.8.8, 203.0.113.44'};
  const direct=nativeFetch(base+'/api/llm',{method:'POST',headers:changedFirstHop,body:JSON.stringify({prompt:'direct held'})});
  while(providerCalls<1)await new Promise(r=>setTimeout(r,1));
  for(let n=0;n<5;n++)assert.equal((await nativeFetch(base+'/api/jobs',{method:'POST',headers,body:JSON.stringify({kind:'llm',prompt:'held'})})).status,202);
  const blocked=await nativeFetch(base+'/api/llm',{method:'POST',headers,body:JSON.stringify({prompt:'blocked'})});assert.equal(blocked.status,429);assert.equal(providerCalls,6);
  const changedTrustedHop=await nativeFetch(base+'/api/llm',{method:'POST',headers:{...headers,'X-Forwarded-For':'1.1.1.1, 203.0.113.45'},body:JSON.stringify({prompt:'denied'})});assert.equal(changedTrustedHop.status,429);assert.equal(providerCalls,6);
  assert.equal(JSON.parse(Buffer.from(cap.token.split('.')[0],'base64url')).id,'203.0.113.44');
  releases.forEach(r=>r());assert.equal((await direct).status,200);
});
