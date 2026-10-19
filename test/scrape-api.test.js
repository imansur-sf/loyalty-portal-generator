const {test}=require('node:test');const assert=require('node:assert/strict');
const outbound=require('../outbound-fetch');
outbound.scrapeText=async()=>({html:'<script>untrusted()</script><img src=x onerror=untrusted()>',finalUrl:'https://brand.example/final'});
const app=require('../server');
test('scraped upstream markup is returned as inert JSON only with capability',async t=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/api/scrape?url=https://brand.example')).status,401);
 const cap=await(await fetch(base+'/api/capability',{method:'POST',headers:{Origin:base}})).json();
 const response=await fetch(base+'/api/scrape?url=https://brand.example',{headers:{'X-LPG-Capability':cap.token}});
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^application\/json/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-security-policy'),/sandbox/);
 const data=await response.json();assert.equal(data.finalUrl,'https://brand.example/final');assert.match(data.html,/<script>/);
 const foreign=await fetch(base+'/api/capability',{method:'POST',headers:{Origin:'https://foreign.example'}});assert.equal(foreign.status,403);assert.equal(foreign.headers.get('access-control-allow-origin'),null);
});
