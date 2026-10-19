// Bounded guest generation access, not account authentication. Guest
// quota counters are shared when a durable store is configured; memory mode
// is reserved for deployments without configured shared storage. The deployed server
// supplies a persistent signing key; local use defaults to a process-local key.
// Account sign-in is unrelated to guest generation; quota follows the signed
// issuance identity across changing corporate egress addresses.
const { randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
function createApiSecurity({secret=randomBytes(32),now=Date.now,windowMs=3600000,maxIdentities=5000,
  maxTokens=1200000,maxImages=240,maxCalls=160,maxScrapes=120,maxActive=6,maxImageActive=8,
  store=null,allowedOrigins=(process.env.LPG_ALLOWED_ORIGINS || '').split(',').filter(Boolean)}={}) {
  const buckets=new Map();let active=0,imageActive=0;
  function identity(req) { return req.generationIdentity || req.ip || req.socket?.remoteAddress || 'unknown'; }
  function bucket(req) {
    const time=now();
    for (const [id,b] of buckets) if(b.expiresAt<=time) buckets.delete(id);
    const id=identity(req);let b=buckets.get(id);
    if(!b) {if(buckets.size>=maxIdentities) return null;b={expiresAt:time+windowMs,issued:0,tokens:0,images:0,calls:0,scrapes:0};buckets.set(id,b);}
    return b;
  }
  function originAllowed(req) {
    const origin=req.headers.origin;
    if(!origin) return true;
    try {const u=new URL(origin);return ['http:','https:'].includes(u.protocol) && (origin===`${req.protocol || 'http'}://${req.headers.host}` || allowedOrigins.includes(origin));}catch{return false;}
  }
  function cors(req,res,next) {
    res.set('Vary','Origin');res.set('X-Content-Type-Options','nosniff');
    if(!originAllowed(req)) return res.status(403).json({error:'origin_not_allowed'});
    if(req.headers.origin)res.set('Access-Control-Allow-Origin',req.headers.origin);
    res.set({'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-LPG-Capability, Idempotency-Key','Access-Control-Max-Age':'600'});
    if(req.method==='OPTIONS')return res.sendStatus(204);next();
  }
  function sign(payload) {return createHmac('sha256',secret).update(payload).digest('base64url');}
  function issue(req,res) {
    if(store)return issueShared(req,res);
    res.set('Cache-Control','no-store');
    if(!originAllowed(req) || (!req.headers.origin && req.headers['sec-fetch-site']!=='same-origin')) return res.status(403).json({error:'same_origin_required'});
    const b=bucket(req);if(!b || b.issued>=12)return res.status(429).json({error:'capability_limit',retryAfterMs:b?b.expiresAt-now():windowMs});
    b.issued++;
    const payload=Buffer.from(JSON.stringify({id:identity(req),expiresAt:b.expiresAt,nonce:randomBytes(16).toString('hex')})).toString('base64url');
    res.json({token:payload+'.'+sign(payload),expiresAt:b.expiresAt});
  }
  function authorize(req,res) {
    res.set('Cache-Control','no-store');
    const raw=req.headers['x-lpg-capability'];
    if(typeof raw!=='string' || raw.length>2048)return res.status(401).json({error:'generation_capability_required'});
    try {
      const [payload,signature,...extra]=raw.split('.');const expected=Buffer.from(sign(payload)),supplied=Buffer.from(signature||'');
      if(extra.length || supplied.length!==expected.length || !timingSafeEqual(supplied,expected))throw Error();
      const data=JSON.parse(Buffer.from(payload,'base64url'));
      if(typeof data.id!=='string' || !data.id || !Number.isFinite(data.expiresAt) || data.expiresAt<=now())throw Error();
      // Corporate SSO egress may change between requests. The signed issuance
      // identity owns the quota; a different network hop must not invalidate
      // this bearer permission or give it a fresh budget.
      req.generationIdentity=data.id;
    }catch{return res.status(401).json({error:'generation_capability_expired'});}
  }

  async function issueShared(req,res) {
    res.set('Cache-Control','no-store');
    if(!originAllowed(req) || (!req.headers.origin && req.headers['sec-fetch-site']!=='same-origin'))return res.status(403).json({error:'same_origin_required'});
    try {
      const result=await store.issue(identity(req),{windowMs,maxIdentities});
      if(result.error)return res.status(429).json(result);
      const payload=Buffer.from(JSON.stringify({id:identity(req),expiresAt:result.expiresAt,nonce:randomBytes(16).toString('hex')})).toString('base64url');
      return res.json({token:payload+'.'+sign(payload),expiresAt:result.expiresAt});
    }catch{return res.status(503).json({error:'generation_storage_unavailable',retryAfterMs:5000});}
  }
  async function reserveShared(req,res,cost) {
    try {
      const result=await store.reserve(identity(req),cost,{windowMs,maxIdentities,maxCalls,maxTokens,maxImages,maxScrapes,maxActive,maxImageActive});
      if(result.error){res.status(429).json(result);return;}
      let released=false;
      return async()=>{if(!released){released=true;try{await store.release(result.id);}catch{console.error('[Generation] reservation_release_failed');}}};
    }catch{res.status(503).json({error:'generation_storage_unavailable',retryAfterMs:5000});}
  }
  function reserve(req,res,{images=0,tokens=0,scrape=false}={}) {
    if(authorize(req,res))return;
    if(!Number.isSafeInteger(tokens) || tokens<0 || !Number.isSafeInteger(images) || images<0) {res.status(400).json({error:'invalid_generation_cost'});return;}
    if(store)return reserveShared(req,res,{images,tokens,scrape});
    const b=bucket(req);
    if(!b || b.calls>=maxCalls || b.tokens+tokens>maxTokens || b.images+images>maxImages || (scrape && b.scrapes>=maxScrapes)) {
      res.status(429).json({error:'generation_budget_exceeded',retryAfterMs:b?b.expiresAt-now():windowMs});return;
    }
    if(active>=maxActive || imageActive+images>maxImageActive){res.status(429).json({error:'generation_busy',retryAfterMs:5000});return;}
    b.calls++;b.tokens+=tokens;b.images+=images;if(scrape)b.scrapes++;
    active++;imageActive+=images;let released=false;
    return ()=>{if(!released){released=true;active--;imageActive-=images;}};
  }
  return {cors,issue,authorize,reserve};
}
module.exports={createApiSecurity};
