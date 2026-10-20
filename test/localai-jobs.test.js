const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ticket = { id: 'job-id-123456', token: 'test-token-123456789' };
const response = (status, body, type = 'application/json') => ({ status, ok: status >= 200 && status < 300,
  headers: { get: () => type }, clone: () => response(status,body,type), json: async () => body, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });
const complete = (status, body) => response(200, { status: 'complete', result: { status, body } });

function client(handler, { storage, metadata = null, crypto, apiKey } = {}) {
  let now = 0, next = 0, issued = 0;
  const calls = [], timers = new Map(), timeoutValues = [];
  const context = vm.createContext({ console, AbortController, URL, Date: { now: () => now } });
  context.window = context;
  if (apiKey) context.localStorage = { getItem: key => key === 'anthropic_api_key' ? apiKey : null };
  if (crypto) { context.crypto = crypto; context.TextEncoder = TextEncoder; }
  if (storage) context.sessionStorage = storage;
  context.location = { origin: 'https://portal.test' };
  context.PageHost = { _analysis: {} };
  context.setTimeout = (fn, ms) => {
    const id = ++next; timers.set(id, { fn, ms });
    if (ms <= 1500) queueMicrotask(() => { if (timers.delete(id)) { now += ms; fn(); } });
    else timeoutValues.push(ms);
    return id;
  };
  context.clearTimeout = id => timers.delete(id);
  const expireRequest = () => {
    const [id, timer] = [...timers].find(([, value]) => value.ms > 1500) || [];
    assert.ok(timer); timers.delete(id); now += timer.ms; timer.fn();
  };
  context.fetch = async (url, options) => { if (url.endsWith('/api/capabilities')) return response(metadata ? 200 : 404, metadata || {}); if (url.endsWith('/api/capability')) {issued++;return response(200, {token:issued===1?'capability-for-test-1234567890':'renewed-capability-for-test-1234567890',expiresAt:now+900000});} calls.push({ url, ...options }); return handler(url, options, { expireRequest }); };
  vm.runInContext(fs.readFileSync('js/localai.js', 'utf8'), context);
  return { api: context.LocalAI, calls, timeoutValues, timers, capabilityRequests: () => issued };
}

test('default LLM uses one short submission, authenticated polling and completed-result cleanup', async () => {
  let polls = 0;
  const c = client(async (_url, options) => {
    if (options.method === 'POST') return response(202, ticket);
    if (options.method === 'DELETE') return response(204);
    return ++polls === 1 ? response(200, { status: 'pending' }) : complete(200, { text: 'Complete program', model_used: 'test' });
  });
  const result = await c.api.callDefaultBackend({ prompt: 'Customer brief', system: 'Schema', maxTokens: 8000 });
  assert.equal(result.text, 'Complete program');
  assert.deepEqual(c.calls.map(call => call.method), ['POST', 'GET', 'GET', 'DELETE']);
  assert.equal(JSON.parse(c.calls[0].body).kind, 'llm');
  assert.equal(JSON.parse(c.calls[0].body).prompt, 'Customer brief');
  assert.ok(c.calls.every(call => !call.url.includes(ticket.token)));
  assert.equal(c.calls[1].headers.Authorization, `Bearer ${ticket.token}`);
  assert.equal(c.calls[1].cache, 'no-store');
  assert.ok(c.timeoutValues.every(value => value < 25000));
  assert.equal(c.timers.size, 0);
});

test('image batches use the same background job transport and retain optimized output', async () => {
  let prompt;
  const c = client(async (_url, options) => {
    if (options.method === 'POST') { prompt = JSON.parse(options.body); return response(202, ticket); }
    if (options.method === 'DELETE') return response(204);
    return complete(200, { results: [{ slot: 'benefit-0', imageData: 'data:image/png;base64,small' }] });
  });
  const data = { benefits: [{ name: 'Member learning' }] };
  const result = await c.api.fillMissingImages(data);
  assert.equal(prompt.kind, 'images'); assert.equal(prompt.prompts[0].slot, 'benefit-0');
  assert.equal(result.generated, 1); assert.equal(data.benefits[0].imageData, 'data:image/png;base64,small');
});

test('only explicit missing submit endpoint falls back to the synchronous custom backend', async () => {
  const c = client(async url => url.endsWith('/api/jobs') ? response(404, {}) : response(200, { text: 'Legacy' }));
  assert.equal((await c.api.callDefaultBackend({ prompt: 'Brief' })).text, 'Legacy');
  assert.deepEqual(c.calls.map(call => call.url), ['/api/jobs', '/api/llm']);
  for (const status of [429, 500, 503]) {
    const failed = client(async () => response(status, { error: status === 429 ? 'generation_busy' : 'unavailable' }));
    await assert.rejects(failed.api.callDefaultBackend({ prompt: 'Brief' }));
    assert.equal(failed.calls.length, 1);
  }
});

test('uncertain POST connection failures never trigger retries or synchronous fallback', async () => {
  const c = client(async () => { throw new TypeError('Network interrupted'); });
  await assert.rejects(c.api.callDefaultBackend({ prompt: 'Brief' }), error => error.code === 'generation_submission_unknown');
  assert.equal(c.calls.length, 1);
});

test('safe GET polling retries transient connection failure while missing jobs require manual retry', async () => {
  let polls = 0;
  const c = client(async (_url, options) => {
    if (options.method === 'POST') return response(202, ticket);
    if (options.method === 'DELETE') return response(204);
    if (++polls === 1) throw new TypeError('Temporary connection failure');
    return complete(200, { text: 'Recovered' });
  });
  assert.equal((await c.api.callDefaultBackend({ prompt: 'Brief' })).text, 'Recovered');
  assert.equal(c.calls.filter(call => call.method === 'POST').length, 1);
  const missing = client(async (_url, options) => response(options.method === 'POST' ? 202 : 404, options.method === 'POST' ? ticket : { error: 'generation_job_missing' }));
  await assert.rejects(missing.api.callDefaultBackend({ prompt: 'Brief' }), error => error.code === 'generation_job_missing');
  assert.equal(missing.calls.filter(call => call.method === 'POST').length, 1);
});

test('job deadline is bounded and never silently starts a replacement generation', async () => {
  const c = client(async (_url, options) => response(options.method === 'POST' ? 202 : 200, options.method === 'POST' ? ticket : { status: 'pending' }));
  await assert.rejects(c.api.callDefaultBackend({ prompt: 'Brief' }), error => error.code === 'generation_deadline');
  assert.equal(c.calls.filter(call => call.method === 'POST').length, 1);
  assert.ok(c.calls.length <= 101);
  assert.equal(c.timers.size, 0);
});

test('provider, configuration, busy and access-session errors are distinguished', async () => {
  for (const [status, body, expected] of [[502, { error: 'timeout' }, 'generation_provider_timeout'],
    [503, { error: 'llm_not_configured' }, 'default_not_configured'], [502, { error: 'gemini_auth_failed' }, 'generation_provider_auth'],
    [502, { error: 'gemini_unavailable' }, 'default_unavailable'], [429, { error: 'gemini_rate_limited' }, 'default_rate_limited']]) {
    const c = client(async (_url, options) => options.method === 'POST' ? response(202, ticket) : options.method === 'DELETE' ? response(204) : complete(status, body));
    await assert.rejects(c.api.callDefaultBackend({ prompt: 'Brief' }), error => error.code === expected);
    assert.equal(c.calls.at(-1).method, 'DELETE');
  }
  for (const [status, body, type, expected] of [[429, { error: 'generation_busy' }, 'application/json', 'generation_busy'],
    [200, null, 'text/html', 'generation_session'], [503, null, 'text/html', 'generation_gateway'], [403, {}, 'application/json', 'generation_session']]) {
    const c = client(async () => response(status, body, type));
    await assert.rejects(c.api.callDefaultBackend({ prompt: 'Brief' }), error => error.code === expected);
  }
});

test('completed result cleanup failure does not discard a successful generation', async () => {
  const c = client(async (_url, options) => {
    if (options.method === 'POST') return response(202, ticket);
    if (options.method === 'DELETE') throw new TypeError('Disconnected after result');
    return complete(200, { text: 'Kept' });
  });
  assert.equal((await c.api.callDefaultBackend({ prompt: 'Brief' })).text, 'Kept');
});

test('request timeout remains active while downloading the JSON body after headers arrive', async () => {
  const c = client(async (_url, options, { expireRequest }) => ({ status: 202, ok: true, headers: { get: () => 'application/json' },
    json: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => { const error = new Error('Body download timed out'); error.name = 'AbortError'; reject(error); });
      queueMicrotask(expireRequest);
    }) }));
  await assert.rejects(c.api.callDefaultBackend({ prompt: 'Brief' }), error => error.code === 'generation_submission_unknown');
  assert.equal(c.calls.length, 1); assert.equal(c.timers.size, 0);
});

test('structured output and finish metadata reach the program parser, including an empty token cutoff', async () => {
  const c = client(async (_url,options) => {
    if(options.method==='POST') { const body=JSON.parse(options.body); assert.equal(body.responseFormat,'json');assert.equal(body.maxTokens,16000);return response(202,ticket); }
    if(options.method==='DELETE') return response(204);
    return complete(200,{text:'',finish_reason:'MAX_TOKENS'});
  });
  const result=await c.api.callLLM({prompt:'Brief',responseFormat:'json',maxTokens:16000});
  assert.equal(result.finish_reason,'MAX_TOKENS');assert.equal(result.text,'');
});

test('cinematic imagery keeps icons, adds photographic covers, and only generates opted-in card assets', async () => {
  const prompts = [];
  let active = [];
  const c = client(async (_url, options) => {
    if (options.method === 'POST') { active = JSON.parse(options.body).prompts; prompts.push(...active); return response(202, ticket); }
    if (options.method === 'DELETE') return response(204);
    return complete(200, { results: active.map(item => ({ slot: item.slot, imageData: 'data:image/png;base64,small' })) });
  });
  const data = { brandName: 'AER', colors: { primary: '#123456', accent: '#abcdef' }, benefits: [{ name: 'Member events' }], cinematic: { card: { mode: 'loyalty', markMode: 'default' } } };
  await c.api.fillMissingImages(data, { outputTemplate: 'cinematic' });
  assert.deepEqual(prompts.map(p => p.slot).sort(), ['benefit-0', 'benefit-cover-0']);
  assert.match(prompts.find(p => p.slot === 'benefit-cover-0').prompt, /photograph or environmental scene/);
  assert.ok(data.benefits[0].imageData); assert.ok(data.benefits[0].coverImageData);
  assert.equal(data.cinematic.card.artworkImageData, undefined);
});

test('selected cinematic slot ignores unrelated missing images and honors author art direction', async () => {
  let submitted;
  const c = client(async (_url, options) => {
    if (options.method === 'POST') { submitted = JSON.parse(options.body).prompts; return response(202, ticket); }
    if (options.method === 'DELETE') return response(204);
    return complete(200, { results: submitted.map(item => ({ slot: item.slot, imageData: 'data:image/png;base64,small' })) });
  });
  const data = { benefits: [{ name: 'Events' }], cinematic: { card: { mode: 'image', markMode: 'custom', artworkPrompt: '  Opalescent waves  ' } } };
  const result = await c.api.fillMissingImages(data, { outputTemplate: 'cinematic', onlySlots: ['card-artwork'] });
  assert.equal(result.total_empty, 1); assert.equal(submitted[0].slot, 'card-artwork');
  assert.match(submitted[0].prompt, /Author visual direction: Opalescent waves/);
  assert.match(submitted[0].prompt, /no text, words or numbers/);
  assert.equal(data.benefits[0].imageData, undefined); assert.equal(data.cinematic.card.markImageData, undefined);
});


test('job submission carries a capability while polling uses only its job ticket', async () => {
  const c = client(async (_url, options) => options.method === 'POST' ? response(202, ticket) : options.method === 'DELETE' ? response(204) : complete(200, { text: 'Ready' }));
  await c.api.callDefaultBackend({ prompt: 'Brief' });
  assert.equal(c.calls[0].headers['X-LPG-Capability'], 'capability-for-test-1234567890');
  assert.equal(c.calls[1].headers['X-LPG-Capability'], undefined);
  assert.equal(c.calls[1].headers.Authorization, `Bearer ${ticket.token}`);
});

test('capabilities are cached by backend and never saved in browser storage', async () => {
  const calls = [];
  const context = vm.createContext({ console, AbortController, URL, Date, setTimeout, clearTimeout });
  context.window = context; context.location = {origin:'https://portal.test'};
  context.PageHost = { _analysis: {} };
  context.fetch = async (url, options) => { calls.push({url,options}); return response(200, {token:'capability-for-'+calls.length+'-123456789012345',expiresAt:Date.now()+900000}); };
  vm.runInContext(fs.readFileSync('js/localai.js','utf8'), context);
  const first = await context.LocalAI.backendAccessHeaders('');
  assert.equal((await context.LocalAI.backendAccessHeaders(''))['X-LPG-Capability'], first['X-LPG-Capability']);
  const other = await context.LocalAI.backendAccessHeaders('https://other.test');
  assert.notEqual(other['X-LPG-Capability'], first['X-LPG-Capability']);
  assert.equal(calls.length,2);
  assert.equal(calls[0].options.credentials,'same-origin');
});

test('capability rejection never submits a paid request', async () => {
  const context = vm.createContext({ console, AbortController, URL, Date, setTimeout, clearTimeout });
  context.window=context; context.PageHost={_analysis:{}};
  const calls=[]; context.fetch=async url=>{calls.push(url); return response(403,{error:'capability_required'});};
  vm.runInContext(fs.readFileSync('js/localai.js','utf8'), context);
  await assert.rejects(context.LocalAI.callDefaultBackend({prompt:'Do not submit'}), error=>error.code==='generation_session');
  assert.deepEqual(calls,['/api/capability']);
});


test('scraper reads non-executable JSON and keeps rejected destinations out of public proxy fallback', async () => {
  const html='<html><body>Customer content long enough for brand analysis.</body></html>';
  const c=client(async()=>response(200,{html,finalUrl:'https://brand.test/'}));
  assert.equal(await c.api.scrapeViaCorsProxy('https://brand.test/'),html);
  assert.equal(c.calls.length,1);
  assert.equal(c.calls[0].headers['X-LPG-Capability'],'capability-for-test-1234567890');
  const redirected=client(async()=>response(200,{html,finalUrl:'https://brand.test/about/'}));
  const metadata=await redirected.api.scrapeViaCorsProxy('https://brand.test/',{withMetadata:true});
  assert.equal(metadata.html,html);assert.equal(metadata.finalUrl,'https://brand.test/about/');
  const blocked=client(async()=>response(403,{error:'blocked_destination'}));
  await assert.rejects(blocked.api.scrapeViaCorsProxy('http://private.test/'),error=>error.code==='own_scraper_status');
  assert.equal(blocked.calls.length,1);
});


test('an explicit pre-acceptance capability rejection renews once and starts one paid job',async()=>{
 let posts=0;
 const c=client(async(_url,options)=>{
   if(options.method==='POST')return ++posts===1?response(401,{error:'generation_capability_expired'}):response(202,ticket);
   return options.method==='DELETE'?response(204):complete(200,{text:'Ready'});
 });
 assert.equal((await c.api.callDefaultBackend({prompt:'Brief'})).text,'Ready');
 assert.equal(c.capabilityRequests(),2);assert.equal(posts,2);
 const submitted=c.calls.filter(r=>r.method==='POST');
 assert.equal(submitted[0].headers['X-LPG-Capability'],'capability-for-test-1234567890');
 assert.equal(submitted[1].headers['X-LPG-Capability'],'renewed-capability-for-test-1234567890');
});

test('permission renewal is bounded and never retries generic login failures or accepted jobs',async()=>{
 const rejected=client(async()=>response(401,{error:'generation_capability_expired'}));
 await assert.rejects(rejected.api.callDefaultBackend({prompt:'Brief'}),error=>error.code==='generation_permission');
 assert.equal(rejected.calls.length,2);assert.equal(rejected.capabilityRequests(),2);
 const signin=client(async()=>response(401,{error:'invalid_token'}));
 await assert.rejects(signin.api.callDefaultBackend({prompt:'Brief'}),error=>error.code==='generation_session');assert.equal(signin.calls.length,1);
 const accepted=client(async(_url,options)=>options.method==='POST'?response(202,ticket):response(401,{error:'generation_capability_expired'}));
 await assert.rejects(accepted.api.callDefaultBackend({prompt:'Brief'}));assert.equal(accepted.calls.filter(r=>r.method==='POST').length,1);
});

test('origin configuration errors explain the address issue without prompting repeated refreshes',async()=>{
 const context=vm.createContext({console,AbortController,URL,Date,setTimeout,clearTimeout});context.window=context;context.PageHost={_analysis:{}};
 context.fetch=async()=>response(403,{error:'origin_not_allowed'});
 vm.runInContext(fs.readFileSync('js/localai.js','utf8'),context);
 await assert.rejects(context.LocalAI.callDefaultBackend({prompt:'Brief'}),error=>error.code==='generation_origin');
 assert.match(context.LocalAI.humanErrorMessage({code:'generation_origin'}),/generator address/);
});


test('scraping renews a rejected capability once without silently discarding website context',async()=>{
 let scrapes=0;
 const html='<html><body>Verified customer website context for the next generation.</body></html>';
 const c=client(async()=>++scrapes===1?response(401,{error:'generation_capability_expired'}):response(200,{html,finalUrl:'https://brand.test/'}));
 assert.equal(await c.api.scrapeViaCorsProxy('https://brand.test/'),html);
 assert.equal(scrapes,2);assert.equal(c.capabilityRequests(),2);
 assert.equal(c.calls[1].headers['X-LPG-Capability'],'renewed-capability-for-test-1234567890');
});


test('simultaneous expired-token responses share one permission renewal',async()=>{
 let accepted=0;
 const c=client(async(_url,options)=>{
   if(options.method==='POST') {
     if(options.headers['X-LPG-Capability']==='capability-for-test-1234567890')return response(401,{error:'generation_capability_expired'});
     accepted++;return response(202,ticket);
   }
   return options.method==='DELETE'?response(204):complete(200,{text:'Ready'});
 });
 await Promise.all([c.api.callDefaultBackend({prompt:'First request'}),c.api.callDefaultBackend({prompt:'Second request'})]);
 assert.equal(c.capabilityRequests(),2);assert.equal(accepted,2);
 assert.equal(c.calls.filter(r=>r.method==='POST').length,4);
});

const modernMetadata = { version: 1, adapter: 'heroku', jobs: { submit: '/api/jobs', poll: '/api/jobs/:id', resume: '/api/jobs/:id/resume', idempotency: true } };
function browserStorage() { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), values }; }
const browserCrypto = require('node:crypto').webcrypto;

test('durable ticket survives refresh and identical inputs resume polling without paid submission', async () => {
  const storage = browserStorage();
  const first = client(async (_url, options) => options.method === 'POST' ? response(202, ticket) : response(200, { status: 'pending' }), { storage, metadata: modernMetadata, crypto: browserCrypto });
  await assert.rejects(first.api.callDefaultBackend({ prompt: 'Persist this exact program' }), error => error.code === 'generation_deadline');
  assert.match(first.calls[0].headers['Idempotency-Key'], /^[A-Za-z0-9_-]{16,200}$/);
  const raw = [...storage.values.values()].join(); assert.ok(raw.includes(ticket.token)); assert.ok(!raw.includes('Persist this exact program'));
  const next = client(async (_url, options) => options.method === 'DELETE' ? response(204) : complete(200, { text: 'Recovered after refresh' }), { storage, metadata: modernMetadata, crypto: browserCrypto });
  assert.equal((await next.api.callDefaultBackend({ prompt: 'Persist this exact program' })).text, 'Recovered after refresh');
  assert.equal(next.calls.filter(call => call.method === 'POST').length, 0);
  assert.equal(next.api.getPendingJobs().length, 0);
});

test('uncertain submission stays blocked until explicit same-key idempotent recovery', async () => {
  const storage = browserStorage();
  const failed = client(async () => { throw new TypeError('Connection lost after accept'); }, { storage, metadata: modernMetadata, crypto: browserCrypto });
  await assert.rejects(failed.api.callDefaultBackend({ prompt: 'Unknown outcome' }), error => error.code === 'generation_submission_unknown');
  const key = failed.calls[0].headers['Idempotency-Key'];
  const next = client(async (_url, options) => options.method === 'POST' ? response(200, ticket) : options.method === 'DELETE' ? response(204) : complete(200, { text: 'Recovered original result' }), { storage, metadata: modernMetadata, crypto: browserCrypto });
  await assert.rejects(next.api.callDefaultBackend({ prompt: 'Unknown outcome' }), error => error.code === 'generation_submission_unknown');
  assert.equal(next.calls.length, 0);
  assert.equal((await next.api.callDefaultBackend({ prompt: 'Unknown outcome', resumeUnknown: true })).text, 'Recovered original result');
  assert.equal(next.calls[0].headers['Idempotency-Key'], key);
});

test('interrupted and expired durable tickets never trigger a replacement paid call', async () => {
  for (const status of ['interrupted', 'cancelled', 'expired']) {
    const storage = browserStorage();
    const c = client(async (_url, options) => options.method === 'POST' ? response(202, ticket) : response(200, { status }), { storage, metadata: modernMetadata, crypto: browserCrypto });
    await assert.rejects(c.api.callDefaultBackend({ prompt: 'Terminal ' + status }), error => error.code === 'generation_' + status);
    await assert.rejects(c.api.callDefaultBackend({ prompt: 'Terminal ' + status }), error => error.code === 'generation_' + status);
    assert.equal(c.calls.filter(call => call.method === 'POST').length, 1);
    assert.equal(c.api.discardBackendJob(ticket.id), true);
  }
});

test('queued durable job requires explicit resume and reuses its ticket', async () => {
  let started = false;
  const c = client(async (url, options) => {
    if (url.endsWith('/resume')) { started = true; return response(200, { status: 'pending' }); }
    if (options.method === 'POST') return response(202, ticket);
    if (options.method === 'DELETE') return response(204);
    return started ? complete(200, { text: 'Safely resumed' }) : response(200, { status: 'pending', resumable: true });
  }, { storage: browserStorage(), metadata: modernMetadata, crypto: browserCrypto });
  await assert.rejects(c.api.callDefaultBackend({ prompt: 'Queued work' }), error => error.code === 'generation_resume_required');
  assert.equal((await c.api.resumeBackendJob(ticket.id)).text, 'Safely resumed');
  assert.equal(c.calls.filter(call => call.url.endsWith('/api/jobs') && call.method === 'POST').length, 1);
  assert.equal(c.calls.filter(call => call.url.endsWith('/resume')).length, 1);
});

test('Worker metadata uses declared synchronous routes and explicit404 is the only legacy reroute', async () => {
  const c = client(async (url, options) => {
    assert.equal(url, 'https://worker.test/llm'); assert.equal(options.method, 'POST'); return response(200, { text: 'Worker adapted' });
  }, { metadata: { version: 1, adapter: 'worker', jobs: false, llm: '/llm' } });
  assert.equal((await c.api.runBackendJob('llm', { prompt: 'Worker' }, 'https://worker.test')).text, 'Worker adapted');
  const old = client(async url => url.endsWith('/llm') && !url.endsWith('/api/llm') ? response(200, { text: 'Legacy Worker' }) : response(404, {}));
  assert.equal((await old.api.runBackendJob('llm', { prompt: 'Old Worker' }, 'https://worker.test')).text, 'Legacy Worker');
  assert.deepEqual(old.calls.map(call => call.url), ['https://worker.test/api/jobs','https://worker.test/api/llm','https://worker.test/llm']);
  const unsafe = client(async () => response(503, { error: 'network_error' }));
  await assert.rejects(unsafe.api.runBackendJob('llm', { prompt: 'No fallback' }, 'https://worker.test'));
  assert.equal(unsafe.calls.length, 1);
});

test('fast image budget prefers cinematic covers, reports batch counts and cancellation prevents later paid batches', async () => {
  let active;
  const c = client(async (_url, options) => {
    if (options.method === 'POST') { active = JSON.parse(options.body).prompts; return response(202, ticket); }
    if (options.method === 'DELETE') return response(204);
    return complete(200, { results: active.map(item => ({ slot: item.slot, imageData: 'data:image/png;base64,small' })) });
  });
  const data = { benefits: Array.from({ length: 5 }, (_, i) => ({ name: 'Benefit ' + i })) };
  const statuses = [];
  const result = await c.api.fillMissingImages(data, { outputTemplate: 'cinematic', maxImages: 2, onStatus: (_stage, counts) => statuses.push(counts) });
  assert.equal(result.attempted, 2); assert.equal(result.generated, 2); assert.equal(result.skipped, 8);
  assert.deepEqual(active.map(item => item.slot), ['benefit-cover-0', 'benefit-cover-1']);
  assert.equal(statuses.at(-1).generated, 2); assert.equal(statuses.at(-1).total, 2);
  const controller = new AbortController();
  const cancelled = await c.api.fillMissingImages({ benefits: Array.from({ length: 10 }, () => ({ name: 'Member opportunity' })) }, { signal: controller.signal, onStatus: (_stage, counts) => { if (counts.generated) controller.abort(); } });
  assert.equal(cancelled.generated, 4); assert.equal(cancelled.attempted, 4); assert.equal(cancelled.cancelled, true);
});

test('abort during pending job sends cancellation and never retries provider work', async () => {
  const controller = new AbortController();
  const c = client(async (_url, options) => {
    if (options.method === 'POST') return response(202, ticket);
    if (options.method === 'DELETE') return response(204);
    controller.abort(); return response(200, { status: 'pending' });
  }, { storage: browserStorage(), metadata: modernMetadata, crypto: browserCrypto });
  await assert.rejects(c.api.callDefaultBackend({ prompt: 'Cancel this job', signal: controller.signal }), error => error.code === 'generation_cancelled');
  assert.equal(c.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(c.calls.filter(call => call.method === 'DELETE').length, 1);
});

test('recovering a pipeline reuses completed checkpoints but ordinary generate starts a fresh request', async () => {
  let counter = 0;
  const storage = browserStorage();
  const c = client(async (_url, options) => {
    if (options.method === 'POST') { counter++; return response(202, { id: 'checkpoint-job-' + counter, token: ticket.token }); }
    if (options.method === 'DELETE') return response(204);
    return complete(200, { text: 'Rules checkpoint ' + counter });
  }, { storage, metadata: modernMetadata, crypto: browserCrypto });
  await c.api.callDefaultBackend({ prompt: 'Rules stage' });
  assert.equal((await c.api.callDefaultBackend({ prompt: 'Rules stage', resumeUnknown: true })).text, 'Rules checkpoint 1');
  assert.equal(counter, 1); assert.equal(c.api.getPendingJobs().length, 0);
  await c.api.callDefaultBackend({ prompt: 'Rules stage' }); assert.equal(counter, 2);
});

test('SHA256 fallback matches WebCrypto and blocks uncertain replay on older hosts', async () => {
  const storage = browserStorage();
  const failed = client(async () => { throw new TypeError('Interrupted'); }, { storage });
  await assert.rejects(failed.api.callDefaultBackend({ prompt: 'Résumé 🌍' }));
  const raw = JSON.parse([...storage.values.values()][0])[0];
  const body = { prompt: 'Résumé 🌍', tier: 'balanced', maxTokens: 8000 };
  const expected = require('node:crypto').createHash('sha256').update(JSON.stringify(['', 'llm', Object.fromEntries(Object.keys(body).sort().map(key => [key, body[key]]))])).digest('hex');
  assert.equal(raw.fingerprint, expected);
  await assert.rejects(failed.api.callDefaultBackend({ prompt: 'Résumé 🌍' }), error => error.code === 'generation_submission_unknown');
  assert.equal(failed.calls.length, 1);
});

test('identical in-flight requests share one paid submission', async () => {
  const c = client(async (_url, options) => options.method === 'POST' ? response(202, ticket) : options.method === 'DELETE' ? response(204) : complete(200, { text: 'Shared paid request' }), { metadata: modernMetadata, crypto: browserCrypto });
  const results = await Promise.all([c.api.callDefaultBackend({ prompt: 'Same' }), c.api.callDefaultBackend({ prompt: 'Same' })]);
  assert.equal(results[0].text, results[1].text);
  assert.equal(c.calls.filter(call => call.method === 'POST').length, 1);
});

test('program contract and audience reach jobs and remain distinct in durable request identity',async()=>{
 const storage=browserStorage();let submits=0;
 const c=client(async(_url,options)=>{
  if(options.method==='POST'){
   submits++;const body=JSON.parse(options.body);assert.equal(body.kind,'llm');
   if(submits===1){assert.equal(body.responseAudience,'b2c');assert.equal(body.responseContract,'loyalty-program-v2');throw new TypeError('Unknown accepted outcome');}
   if(submits===2){assert.equal(body.responseAudience,'b2b');assert.equal(body.responseContract,'loyalty-program-v2');}
   if(submits===3){assert.equal(Object.hasOwn(body,'responseContract'),false);assert.equal(Object.hasOwn(body,'responseAudience'),false);}
   return response(202,ticket);
  }
  if(options.method==='DELETE')return response(204);
  return complete(200,{text:'Structured result'});
 },{storage,metadata:modernMetadata,crypto:browserCrypto});
 const common={prompt:'Same prompt',responseFormat:'json'};
 await assert.rejects(c.api.callLLM({...common,responseContract:'loyalty-program-v2',responseAudience:'b2c'}),error=>error.code==='generation_submission_unknown');
 assert.equal((await c.api.callLLM({...common,responseContract:'loyalty-program-v2',responseAudience:'b2b'})).text,'Structured result');
 assert.equal((await c.api.callLLM(common)).text,'Structured result');
 assert.equal(submits,3);
 const bodies=c.calls.filter(x=>x.method==='POST').map(x=>JSON.parse(x.body));
 assert.equal(new Set(c.calls.filter(x=>x.method==='POST').map(x=>x.headers['Idempotency-Key'])).size,3);
 assert.equal(bodies[0].responseContract,'loyalty-program-v2');
});

test('BYO providers keep prompt validation without unsupported native contract fields',async()=>{
 for(const apiKey of ['sk-ant-synthetic-test','sk-synthetic-gateway']){
  const c=client(async(_url,options)=>{
   const body=JSON.parse(options.body);assert.equal(Object.hasOwn(body,'responseContract'),false);assert.equal(Object.hasOwn(body,'responseAudience'),false);assert.equal(Object.hasOwn(body,'responseJsonSchema'),false);
   return response(200,apiKey.startsWith('sk-ant-')?{content:[{type:'text',text:'{"program":{}}'}],model:'test'}:{choices:[{message:{content:'{"program":{}}'}}],model:'test'});
  },{apiKey});
  assert.equal((await c.api.callLLM({prompt:'Validated by caller',responseFormat:'json',responseContract:'loyalty-program-v2',responseAudience:'b2c'})).text,'{"program":{}}');assert.equal(c.calls.length,1);assert.equal(c.capabilityRequests(),0);
 }
});

test('presentation response contract is forwarded without a program audience',async()=>{
 const c=client(async(_url,options)=>{
  if(options.method==='POST'){
   const body=JSON.parse(options.body);assert.equal(body.responseFormat,'json');assert.equal(body.responseContract,'loyalty-presentation-v1');assert.equal(Object.hasOwn(body,'responseAudience'),false);return response(202,ticket);
  }
  if(options.method==='DELETE')return response(204);
  return complete(200,{text:'{"presentation":{}}'});
 });
 assert.equal((await c.api.callLLM({prompt:'Decorate program',responseFormat:'json',responseContract:'loyalty-presentation-v1'})).text,'{"presentation":{}}');
});
