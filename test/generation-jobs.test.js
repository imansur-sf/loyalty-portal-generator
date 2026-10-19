const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createGenerationJobs } = require('../generation-jobs');
async function setup(t, options) {
  const jobs = createGenerationJobs(options);
  const app = express(); app.use(express.json());
  app.post('/api/jobs', jobs.submit); app.get('/api/jobs/:id', jobs.poll); app.delete('/api/jobs/:id', jobs.remove);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { jobs.close(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api/jobs`;
  return {
    submit: (body = { kind: 'llm', prompt: 'Synthetic test' }) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    poll: (job, token = job.token) => fetch(`${base}/${job.id}`, { headers: { Authorization: `Bearer ${token}` } }),
    remove: job => fetch(`${base}/${job.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${job.token}` } })
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('submission returns before AI completes; polling requires the secret and retains result for retry', async t => {
  let finish;
  const api = await setup(t, { handlers: { llm: async (req, res) => {
    assert.equal(req.body.prompt, 'Synthetic test');
    await new Promise(resolve => { finish = resolve; });
    res.json({ text: 'Generated portal' });
  } } });
  const response = await api.submit(); assert.equal(response.status, 202);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const job = await response.json();
  assert.equal((await api.poll(job, 'wrong')).status, 404);
  assert.deepEqual(await (await api.poll(job)).json(), { status: 'pending' });
  finish(); await tick();
  const expected = { status: 'complete', result: { status: 200, body: { text: 'Generated portal' } } };
  assert.deepEqual(await (await api.poll(job)).json(), expected);
  assert.deepEqual(await (await api.poll(job)).json(), expected);
  assert.equal((await api.remove(job)).status, 204);
  assert.equal((await api.poll(job)).status, 404);
});
test('upstream failures remain specific and exceptions become a completed failed result', async t => {
  const api = await setup(t, { handlers: {
    llm: async (req, res) => res.status(429).json({ error: 'gemini_rate_limited' }),
    images: async () => { throw new Error('private upstream detail'); }
  } });
  for (const [kind, status, error] of [['llm',429,'gemini_rate_limited'],['images',502,'generation_failed']]) {
    const job = await (await api.submit({ kind })).json();
    assert.deepEqual(await (await api.poll(job)).json(), { status: 'complete', result: { status, body: { error } } });
  }
  assert.equal((await api.submit({ kind: 'constructor' })).status, 400);
});
test('concurrency remains bounded even if a pending client removes or expires a job', async t => {
  let finish; let time = 0;
  const api = await setup(t, { now: () => time, ttlMs: 10000, maxActive: 1, handlers: { llm: async (_, res) => {
    await new Promise(resolve => { finish = resolve; }); res.json({ text: 'done' });
  } } });
  const job = await (await api.submit()).json();
  await api.remove(job);
  assert.equal((await api.submit()).status, 429);
  time = 11000;
  assert.equal((await api.poll(job)).status, 404);
  assert.equal((await api.submit()).status, 429);
  finish(); await tick();
  const next = await api.submit(); assert.equal(next.status, 202);
  finish(); await tick();
});
test('large results are bounded and consumed jobs free storage capacity', async t => {
  const api = await setup(t, { maxJobs: 1, maxResultBytes: 200, handlers: { llm: async (_, res) => res.json({ text: 'x'.repeat(500) }) } });
  const job = await (await api.submit()).json();
  assert.equal((await (await api.poll(job)).json()).result.body.error, 'generation_result_too_large');
  assert.equal((await api.submit()).status, 429);
  await api.remove(job);
  assert.equal((await api.submit()).status, 202);
});
test('rejected preflight requests never occupy job capacity', async t => {
  const api = await setup(t, { maxJobs: 1, validators: { llm: (req, res) => {
    if (!req.body.prompt) return res.status(400).json({error:'missing_prompt'});
  } }, handlers: { llm: async (_,res) => res.json({text:'valid'}) } });
  for (let i=0;i<45;i++) assert.equal((await api.submit({kind:'llm'})).status,400);
  const job=await(await api.submit()).json();
  assert.equal((await(await api.poll(job)).json()).result.body.text,'valid');
});
test('image concurrency and batch size are bounded separately from text work', async t => {
  const finishes=[];
  const api = await setup(t, { handlers: {
    images: async (_,res)=>{await new Promise(r=>finishes.push(r));res.json({results:[]});},
    llm: async (_,res)=>res.json({text:'text remains available'})
  } });
  assert.equal((await api.submit({kind:'images',prompts:Array(5).fill({})})).status,400);
  const first=await(await api.submit({kind:'images',prompts:[{}]})).json();
  await api.submit({kind:'images',prompts:[{}]});
  assert.equal((await api.submit({kind:'images',prompts:[{}]})).status,429);
  assert.equal((await api.submit()).status,202);
  finishes.forEach(r=>r());await tick();
  assert.equal((await(await api.poll(first)).json()).status,'complete');
});
