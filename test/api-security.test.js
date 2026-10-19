const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApiSecurity}=require('../api-security');
function res(){return {statusCode:200,headers:{},set(k,v){if(typeof k==='object')Object.assign(this.headers,k);else this.headers[k]=v;return this;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;},sendStatus(v){this.statusCode=v;return this;}};}
function req(extra={}) {return {protocol:'https',ip:'203.0.113.1',headers:{host:'lpg.example',origin:'https://lpg.example'},...extra};}
function token(s,r=req()){const out=res();s.issue(r,out);assert.equal(out.statusCode,200);return out.body.token;}
test('capabilities require same-origin issuance, cannot be forged, reused from another address, or used after expiry',()=>{
 let time=100;const s=createApiSecurity({now:()=>time,windowMs:1000});
 for(const headers of [{host:'lpg.example'},{host:'lpg.example',origin:'https://evil.example'}]) {const out=res();s.issue(req({headers}),out);assert.equal(out.statusCode,403);}
 const cap=token(s);const r=req();r.headers['x-lpg-capability']=cap;
 assert.equal(s.authorize(r,res()),undefined);
 for(const candidate of [req({ip:'203.0.113.2',headers:r.headers}),req({headers:{...r.headers,'x-lpg-capability':cap+'x'}})]){const out=res();s.authorize(candidate,out);assert.equal(out.statusCode,401);}
 time=1101;const out=res();s.authorize(r,out);assert.equal(out.statusCode,401);
});
test('new capabilities share budget, images count individually and concurrency is shared with direct text work',()=>{
 const s=createApiSecurity({maxImages:3,maxTokens:12,maxActive:1});
 const r=req();r.headers['x-lpg-capability']=token(s);
 const release=s.reserve(r,res(),{images:2});assert.equal(typeof release,'function');
 const busy=res();assert.equal(s.reserve(r,busy,{tokens:2}),undefined);assert.equal(busy.body.error,'generation_busy');
 release();release();
 r.headers['x-lpg-capability']=token(s);const exhausted=res();s.reserve(r,exhausted,{images:2});assert.equal(exhausted.body.error,'generation_budget_exceeded');
 s.reserve(r,res(),{tokens:12})();const text=res();s.reserve(r,text,{tokens:1});assert.equal(text.statusCode,429);
});
test('identity retention and issuance are bounded; CORS rejects foreign origins',()=>{
 const s=createApiSecurity({maxIdentities:1});token(s);
 const full=res();s.issue(req({ip:'203.0.113.2'}),full);assert.equal(full.statusCode,429);
 for(let n=1;n<12;n++)token(s);const limit=res();s.issue(req(),limit);assert.equal(limit.statusCode,429);
 const cors=res();s.cors(req({headers:{host:'lpg.example',origin:'https://foreign.example'}}),cors,()=>assert.fail());assert.equal(cors.statusCode,403);assert.equal(cors.headers['Access-Control-Allow-Origin'],undefined);
});

test('invalid cost types cannot poison budgets or occupy concurrency',()=>{
 const s=createApiSecurity({maxTokens:3,maxImages:1,maxActive:1});const r=req();r.headers['x-lpg-capability']=token(s);
 for (const value of [NaN,Infinity,-1,0.5,'2','2garbage',{},null]) {
   for (const field of ['tokens','images']) {
     const out=res();assert.equal(s.reserve(r,out,{[field]:value}),undefined);assert.equal(out.statusCode,400);assert.equal(out.body.error,'invalid_generation_cost');
   }
 }
 const release=s.reserve(r,res(),{tokens:3,images:1});assert.equal(typeof release,'function');release();
 const exhausted=res();s.reserve(r,exhausted,{tokens:1});assert.equal(exhausted.statusCode,429);
});
