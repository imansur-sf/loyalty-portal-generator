const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ticket = { id: 'job-id-123456', token: 'test-token-123456789' };
const response = (status, body, type = 'application/json') => ({ status, ok: status >= 200 && status < 300,
  headers: { get: () => type }, json: async () => body });
const complete = (status, body) => response(200, { status: 'complete', result: { status, body } });

function client(handler) {
  let now = 0, next = 0;
  const calls = [], timers = new Map(), timeoutValues = [];
  const context = vm.createContext({ console, AbortController, URL, Date: { now: () => now } });
  context.window = context;
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
  context.fetch = async (url, options) => { calls.push({ url, ...options }); return handler(url, options, { expireRequest }); };
  vm.runInContext(fs.readFileSync('js/localai.js', 'utf8'), context);
  return { api: context.LocalAI, calls, timeoutValues, timers };
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
