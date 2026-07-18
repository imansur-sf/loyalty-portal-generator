// ============================================================
// scrape.js — Cloudflare Worker for the loyalty portal generator
// ------------------------------------------------------------
// Two endpoints:
//   GET  /scrape?url=<encoded-url>    → fetches URL server-side, returns HTML
//   POST /llm  { prompt, system, ... } → proxies to SF LLM Gateway with a
//                                         server-held API key
//   GET  /health                       → { ok: true } probe
//
// SF Gateway key is stored as a Worker secret so the client never sees it:
//   wrangler secret put SF_GATEWAY_KEY
// ============================================================

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 15_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; LoyaltyPortalScraper/1.0)';

const SF_GATEWAY_BASE = 'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl';

// Model IDs the /llm endpoint accepts. Others are rejected so the endpoint
// can't be turned into a general-purpose LLM proxy.
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620-v1'
]);
const TIER_MODELS = {
  fast:     'claude-3-5-sonnet-20241022',
  balanced: 'claude-sonnet-4-5-20250929',
  powerful: 'claude-sonnet-4-5-20250929'
};
const DEFAULT_MODEL = TIER_MODELS.balanced;

// Basic per-IP rate limit — an in-memory map inside a single isolate. Not
// perfect (fleet of isolates each has its own counter) but plenty to
// deter casual abuse. For strict limits, layer Cloudflare Access on top.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;         // 30 LLM req/min/IP
const rateBuckets = new Map();      // ip -> { count, resetAt }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400'
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const reqUrl = new URL(request.url);

    if (reqUrl.pathname === '/' || reqUrl.pathname === '/health') {
      return json({
        ok: true,
        service: 'loyalty-scraper',
        version: 2,
        endpoints: ['GET /scrape', 'POST /llm', 'GET /health'],
        llm_configured: Boolean(env.SF_GATEWAY_KEY)
      }, 200);
    }

    if (reqUrl.pathname === '/scrape' && request.method === 'GET') {
      return handleScrape(reqUrl);
    }
    if (reqUrl.pathname === '/llm' && request.method === 'POST') {
      return handleLLM(request, env);
    }
    return json({ error: 'not_found' }, 404);
  }
};

// ============================================================
// /scrape — unchanged from v2.0
// ============================================================
async function handleScrape(reqUrl) {
  const target = reqUrl.searchParams.get('url');
  if (!target) return json({ error: 'missing_url' }, 400);

  let targetURL;
  try { targetURL = new URL(target); }
  catch { return json({ error: 'invalid_url' }, 400); }

  if (targetURL.protocol !== 'https:' && targetURL.protocol !== 'http:') {
    return json({ error: 'bad_protocol', got: targetURL.protocol }, 400);
  }
  if (isDangerousHost(targetURL.hostname)) {
    return json({ error: 'blocked_host', hostname: targetURL.hostname }, 403);
  }

  try {
    const upstream = await fetch(targetURL.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':      USER_AGENT,
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      cf: { cacheTtl: 300, cacheEverything: true },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!upstream.ok) return json({ error: 'upstream_status', status: upstream.status }, 502);

    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    if (!/^text\//i.test(contentType) && !/(json|xml|xhtml)/i.test(contentType)) {
      return json({ error: 'not_text', contentType }, 415);
    }

    const reader = upstream.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        try { reader.cancel(); } catch (_) {}
        return json({ error: 'too_large', limitBytes: MAX_BYTES }, 413);
      }
      chunks.push(value);
    }

    return new Response(concat(chunks), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type':     contentType,
        'Cache-Control':    'public, max-age=600',
        'X-Scraper-Source': targetURL.hostname,
        'X-Scraper-Bytes':  String(total)
      }
    });
  } catch (err) {
    const code = err && err.name === 'TimeoutError' ? 'timeout' : 'network_error';
    return json({ error: code, message: (err && err.message) || 'unknown' }, 502);
  }
}

// ============================================================
// /llm — proxies to SF Gateway with server-held key
// ============================================================
async function handleLLM(request, env) {
  if (!env.SF_GATEWAY_KEY) {
    return json({ error: 'llm_not_configured', hint: 'Run: wrangler secret put SF_GATEWAY_KEY' }, 503);
  }

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return json({ error: 'rate_limited', retryAfterMs: rl.retryAfterMs }, 429);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  const prompt   = typeof body.prompt === 'string' ? body.prompt : '';
  const system   = typeof body.system === 'string' ? body.system : '';
  const tier     = ['fast','balanced','powerful'].includes(body.tier) ? body.tier : 'balanced';
  const requestedModel = typeof body.model === 'string' ? body.model : '';
  const model    = ALLOWED_MODELS.has(requestedModel) ? requestedModel : (TIER_MODELS[tier] || DEFAULT_MODEL);
  const maxTokens = Math.min(Math.max(parseInt(body.maxTokens, 10) || 4000, 100), 8000);

  if (!prompt) return json({ error: 'missing_prompt' }, 400);
  if (prompt.length > 200_000) return json({ error: 'prompt_too_long' }, 413);
  if (system.length > 20_000) return json({ error: 'system_too_long' }, 413);

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  try {
    const upstream = await fetch(`${SF_GATEWAY_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SF_GATEWAY_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(60_000)
    });

    if (upstream.status === 401) return json({ error: 'gateway_bad_key' }, 502);
    if (upstream.status === 403) return json({ error: 'gateway_forbidden' }, 502);
    if (upstream.status === 404) return json({ error: 'gateway_model_not_found', model }, 502);
    if (upstream.status === 429) return json({ error: 'gateway_rate_limited' }, 429);
    if (upstream.status >= 500)  return json({ error: 'gateway_unavailable', status: upstream.status }, 502);
    if (!upstream.ok) {
      const t = await upstream.text().catch(() => '');
      return json({ error: 'gateway_failed', status: upstream.status, body: t.slice(0, 300) }, 502);
    }

    const data = await upstream.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message
      ? (data.choices[0].message.content || '')
      : '';
    if (!text) return json({ error: 'gateway_empty_response' }, 502);

    return json({
      text,
      model_used: data.model || model,
      tier,
      usage: data.usage
    }, 200);
  } catch (err) {
    const code = err && err.name === 'TimeoutError' ? 'timeout' : 'network_error';
    return json({ error: code, message: (err && err.message) || 'unknown' }, 502);
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  // Garbage-collect the map occasionally so isolate memory doesn't grow
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
  }
  if (bucket.count > RATE_LIMIT_MAX) {
    return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - now) };
  }
  return { ok: true };
}

// ============================================================
// Utilities
// ============================================================
function concat(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

function isDangerousHost(host) {
  if (!host) return true;
  const h = host.toLowerCase();
  if (h === 'localhost' || h === 'localhost.localdomain') return true;
  if (h === 'metadata.google.internal') return true;
  if (h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (h === '169.254.169.254') return true;
  if (/^(10|127)\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (h === '0.0.0.0') return true;
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc00:') || h.startsWith('fd00:')) return true;
  return false;
}
