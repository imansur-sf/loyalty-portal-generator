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
    await new Promise(resolve => { finish = resolve; });
    return new Response(JSON.stringify({ candidates: [{content:{parts:[{text:'{"program":"demo"}'}]}}] }));
  };
  const server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  t.after(async()=>{global.fetch=nativeFetch;await new Promise(r=>server.close(r));});
  const base = `http://127.0.0.1:${server.address().port}`;
  async function submit(body) {
    const r=await nativeFetch(base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(r.status,202);return r.json();
  }
  async function poll(job) {return (await nativeFetch(base+'/api/jobs/'+job.id,{headers:{Authorization:'Bearer '+job.token}})).json();}
  const llm=await submit({kind:'llm',prompt:'Fictional portal'});
  assert.deepEqual(await poll(llm),{status:'pending'});finish();
  assert.equal((await poll(llm)).result.body.text,'{"program":"demo"}');
  const image=await submit({kind:'images',prompts:[{slot:'benefit0',prompt:'Fictional benefit'}]});
  const result=await poll(image);
  assert.equal(result.result.body.results[0].imageData,'data:image/png;base64,synthetic');
  const invalid=await nativeFetch(base+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'llm'})});
  assert.equal(invalid.status,400); assert.deepEqual(await invalid.json(),{error:'missing_prompt'});
  const cors=await nativeFetch(base+'/api/jobs/'+llm.id,{method:'OPTIONS'});
  assert.match(cors.headers.get('access-control-allow-headers'),/Authorization/);
  assert.match(cors.headers.get('access-control-allow-methods'),/DELETE/);
  assert.equal((await nativeFetch(base+'/api/unknown')).status,404);
});
