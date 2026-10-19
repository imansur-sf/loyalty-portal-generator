const {test}=require('node:test');const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');const {Readable}=require('node:stream');
const {destination,publicAddress,scrapeText}=require('../outbound-fetch');
test('outbound policy blocks IPv4, IPv6, mapped IPv4, reserved and nonstandard ports',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','172.31.2.1','192.168.1.1','169.254.169.254','100.64.0.1','198.19.0.1','192.0.2.1','0.0.0.0','224.0.0.1','::1','[::1]','::ffff:127.0.0.1','fd00::1','fe80::1','2001:db8::1','2002:7f00:1::','3fff::1','200::1','2001:2::1','2001:20::1'])assert.equal(publicAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(publicAddress(ip),true,ip);
 for(const url of ['http://[::1]','http://2130706433','http://0x7f000001','http://public.example:8080','https://user:pass@public.example','file:///etc/passwd'])await assert.rejects(destination(url),e=>e.status===400||e.status===403);
 await assert.rejects(destination('https://public.example',async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]),/blocked_destination/);
});
function transport(sequence,seen=[]) {return (url,options,done)=>{const request=new EventEmitter();request.end=()=>{
 seen.push({url,options});const next=sequence.shift();const response=Readable.from((next.chunks||['<script>untrusted()</script>']).map(x=>Buffer.from(x)));response.statusCode=next.status||200;response.headers=next.headers||{'content-type':'text/html'};done(response);
 };return request;};}
const lookup=async()=>[{address:'8.8.8.8',family:4}];
test('scraper pins validated DNS, returns inert data and validates every redirect',async()=>{
 const seen=[];const result=await scrapeText('https://public.example',{lookup,request:transport([{status:302,headers:{location:'/next'}},{}],seen)});
 assert.deepEqual(result,{html:'<script>untrusted()</script>',finalUrl:'https://public.example/next'});
 seen[0].options.lookup('public.example',{},(err,address)=>{assert.equal(err,null);assert.equal(address,'8.8.8.8');});assert.equal(seen[0].options.agent,false);
 await assert.rejects(scrapeText('https://public.example',{lookup,request:transport([{status:302,headers:{location:'http://[::1]/secret'}}])}),/blocked_destination/);
 await assert.rejects(scrapeText('https://public.example',{lookup,request:transport([{status:302,headers:{location:'https://private.example'}}]),maxRedirects:1,lookup:async hostname=>[{address:hostname==='private.example'?'10.0.0.1':'8.8.8.8',family:4}]}),/blocked_destination/);
});
test('scraper limits streamed bytes, redirect count, and stalled DNS lookup',async()=>{
 await assert.rejects(scrapeText('https://public.example',{lookup,maxBytes:2,request:transport([{}])}),/too_large/);
 await assert.rejects(scrapeText('https://public.example',{lookup,maxRedirects:0,request:transport([{status:302,headers:{location:'/loop'}}])}),/too_many_redirects/);
 await assert.rejects(scrapeText('https://public.example',{timeoutMs:10,lookup:()=>new Promise(()=>{})}),/timeout/);
});
