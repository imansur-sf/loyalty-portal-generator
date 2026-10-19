const { randomBytes, timingSafeEqual } = require('node:crypto');

// This app runs one web process. Jobs deliberately expire and are not durable
// across deployments; a client must never silently resubmit a lost paid AI job.
function createGenerationJobs({ handlers, validators = {}, ttlMs = 15 * 60_000, maxJobs = 40,
  maxActive = 6, maxBytes = 64 * 1024 * 1024, maxResultBytes = 20 * 1024 * 1024,
  now = Date.now } = {}) {
  const jobs = new Map();
  let active = 0;
  let activeImages = 0;
  let storedBytes = 0;
  function erase(id) {
    const job = jobs.get(id);
    if (job) storedBytes -= job.bytes || 0;
    jobs.delete(id);
  }
  function prune() {
    for (const [id, job] of jobs) if (job.expiresAt <= now()) erase(id);
  }
  const cleanup = setInterval(prune, Math.min(ttlMs, 60_000));
  cleanup.unref();
  function authorized(req, job) {
    const supplied = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    const expected = Buffer.from(job.token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
  function submit(req, res) {
    res.set('Cache-Control', 'no-store');
    prune();
    const { kind, ...body } = req.body || {};
    const handler = Object.hasOwn(handlers, kind) && handlers[kind];
    if (!handler) return res.status(400).json({ error: 'invalid_job_kind' });
    const input = { body, headers: req.headers, ip: req.ip };
    // Reject malformed/unauthorized/rate-limited work without retaining a job.
    if (validators[kind] && validators[kind](input, res)) return;
    const isImage = kind === 'image' || kind === 'images';
    if (kind === 'images' && body.prompts?.length > 4) {
      return res.status(400).json({ error: 'invalid_prompts', max: 4 });
    }
    if (isImage && activeImages >= 2) {
      return res.status(429).json({ error: 'generation_busy', retryAfterMs: 5000 });
    }
    if (active >= maxActive || jobs.size >= maxJobs || storedBytes >= maxBytes) {
      return res.status(429).json({ error: 'generation_busy', retryAfterMs: 5000 });
    }
    const id = randomBytes(18).toString('hex');
    const job = { token: randomBytes(32).toString('hex'), status: 'pending',
      expiresAt: now() + ttlMs, bytes: 0 };
    jobs.set(id, job);
    active++;
    if (isImage) activeImages++;
    const started = now();
    res.status(202).json({ id, token: job.token });
    // Reuse validation, rate limits and upstream response handling in the
    // synchronous endpoints. Do not retain request or customer input afterward.
    let status = 200;
    let completed = false;
    const output = {
      set() { return output; },
      status(value) { status = value; return output; },
      json(value) {
        if (completed) return;
        completed = true;
        active--;
        if (isImage) activeImages--;
        if (!jobs.has(id)) return;
        let result = { status, body: value };
        let bytes = Buffer.byteLength(JSON.stringify(result));
        if (bytes > maxResultBytes || storedBytes + bytes > maxBytes) {
          result = { status: 503, body: { error: 'generation_result_too_large' } };
          bytes = Buffer.byteLength(JSON.stringify(result));
        }
        job.status = 'complete'; job.result = result; job.bytes = bytes;
        job.expiresAt = now() + ttlMs;
        storedBytes += bytes;
        console.info(`[Generation] kind=${kind} status=${result.status} duration_ms=${now() - started}`);
      }
    };
    Promise.resolve().then(() => handler(input, output)).then(() => {
      if (!completed) output.status(502).json({ error: 'generation_empty_response' });
    }).catch(() => output.status(502).json({ error: 'generation_failed' }));
  }
  function poll(req, res) {
    res.set('Cache-Control', 'no-store');
    prune();
    const job = jobs.get(req.params.id);
    if (!job || !authorized(req, job)) return res.status(404).json({ error: 'generation_job_missing' });
    return res.json(job.status === 'complete' ? { status: job.status, result: job.result } : { status: job.status });
  }
  function remove(req, res) {
    res.set('Cache-Control', 'no-store');
    const job = jobs.get(req.params.id);
    if (!job || !authorized(req, job)) return res.status(404).json({ error: 'generation_job_missing' });
    // Only discard completed results. Pending AI calls still count toward the
    // concurrency limit until they finish, even if a client navigates away.
    if (job.status === 'complete') erase(req.params.id);
    return res.sendStatus(204);
  }
  return { submit, poll, remove, close() { clearInterval(cleanup); } };
}

module.exports = { createGenerationJobs };
