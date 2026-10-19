const dns = require('node:dns').promises;
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
function blocked(message = 'blocked_destination', status = 403) { return Object.assign(new Error(message), { status, code: message }); }
function publicAddress(address) {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (net.isIP(ip) === 4) {
    const [a,b,c] = ip.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) ||
      (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0 || (b===88 && c===99))) ||
      (a===198 && (b===18 || b===19 || (b===51 && c===100))) || (a===203 && b===0 && c===113));
  }
  // Global unicast only. This also excludes mapped IPv4, local, multicast,
  // link-local, unspecified and well-known translation prefixes.
  if (net.isIP(ip) === 6) {
    const [first,second] = ip.split(':').map(x=>parseInt(x||'0',16));
    return first>=0x2000 && first<=0x3fff && first!==0x2002 && first!==0x3ffe && first!==0x3fff &&
      !(first===0x2001 && (second<0x200 || second===0xdb8));
  }
  return false;
}
async function destination(value, lookup = dns.lookup) {
  let url; try { url = new URL(value); } catch { throw blocked('invalid_url',400); }
  if (!['http:','https:'].includes(url.protocol)) throw blocked('bad_protocol',400);
  if (url.username || url.password || (url.port && url.port !== (url.protocol==='https:'?'443':'80'))) throw blocked();
  const hostname = url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
  if (!hostname || hostname==='localhost' || hostname.endsWith('.localhost') || /\.(local|internal|localdomain)$/.test(hostname)) throw blocked();
  const records = net.isIP(hostname) ? [{address:hostname,family:net.isIP(hostname)}] : await lookup(hostname,{all:true,verbatim:true});
  if (!records.length || records.some(r=>!publicAddress(r.address))) throw blocked();
  return {url, address:records[0].address, family:records[0].family};
}
async function scrapeText(value, {lookup=dns.lookup, request, maxBytes=3000000, timeoutMs=15000, maxRedirects=5}={}) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeoutMs);
  try {
    for (let hop=0;;hop++) {
      let abortLookup;
      const aborted=new Promise((_,reject)=>{abortLookup=()=>reject(blocked('timeout',502));controller.signal.addEventListener('abort',abortLookup,{once:true});});
      let target;
      try {target=await Promise.race([destination(value,lookup),aborted]);}
      finally {controller.signal.removeEventListener('abort',abortLookup);}
      if (controller.signal.aborted) throw blocked('timeout',502);
      const result=await new Promise((resolve,reject)=>{
        const transport=request || (target.url.protocol==='https:'?https.request:http.request);
        const req=transport(target.url, {method:'GET',signal:controller.signal,agent:false,
          // Pin the validated DNS address while preserving Host and TLS SNI.
          lookup:(_host,options,cb)=> options.all ? cb(null,[{address:target.address,family:target.family}]) : cb(null,target.address,target.family),
          headers:{'User-Agent':'Mozilla/5.0 (compatible; LoyaltyPortalScraper/1.0)','Accept':'text/html,application/xhtml+xml,text/plain;q=0.9','Accept-Language':'en-US,en;q=0.9','Accept-Encoding':'identity'}},res=>{
          if ([301,302,303,307,308].includes(res.statusCode)) {res.destroy();return resolve({location:res.headers.location});}
          if (res.statusCode<200 || res.statusCode>=300) {res.destroy();return reject(blocked('upstream_status',502));}
          const type=res.headers['content-type'] || 'text/html';
          if (!/^text\//i.test(type) && !/(json|xml|xhtml)/i.test(type)) {res.destroy();return reject(blocked('not_text',415));}
          const chunks=[];let size=0;
          res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){reject(blocked('too_large',413));res.destroy();}else chunks.push(chunk);});
          res.on('error',reject);res.on('end',()=>resolve({html:Buffer.concat(chunks).toString('utf8'),finalUrl:target.url.href}));
        });
        req.on('error',reject);req.end();
      });
      if (!Object.hasOwn(result,'location')) return result;
      if (!result.location || hop>=maxRedirects) throw blocked('too_many_redirects',502);
      value=new URL(result.location,target.url).href;
    }
  } catch(error) {if(controller.signal.aborted) throw blocked('timeout',502);throw error;}
  finally {clearTimeout(timer);}
}
module.exports={publicAddress,destination,scrapeText};
