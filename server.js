const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Configuration
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MAX_SCRAPE_BYTES = 3_000_000;
const SCRAPE_TIMEOUT_MS = 15_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; LoyaltyPortalScraper/1.0)';

// Gemini model mapping by tier
const TIER_MODELS = {
  fast: 'gemini-2.0-flash',
  balanced: 'gemini-2.5-flash',
  powerful: 'gemini-2.5-pro'
};
const DEFAULT_MODEL = TIER_MODELS.balanced;

// Rate limiting — in-memory per-IP (same approach as the CloudFlare Worker)
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30; // 30 LLM req/min/IP
const rateBuckets = new Map();

// ============================================================
// Middleware
// ============================================================
app.use(express.json({ limit: '1mb' }));

// CORS for API routes (same-origin won't need it, but useful for dev)
app.use('/api', (req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ============================================================
// API Routes
// ============================================================

// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'loyalty-portal',
    version: 3,
    endpoints: ['GET /api/scrape', 'POST /api/llm', 'GET /api/health'],
    llm_configured: Boolean(GEMINI_API_KEY)
  });
});

// --- Scrape Endpoint ---
app.get('/api/scrape', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'missing_url' });

  let targetURL;
  try { targetURL = new URL(target); }
  catch { return res.status(400).json({ error: 'invalid_url' }); }

  if (targetURL.protocol !== 'https:' && targetURL.protocol !== 'http:') {
    return res.status(400).json({ error: 'bad_protocol', got: targetURL.protocol });
  }
  if (isDangerousHost(targetURL.hostname)) {
    return res.status(403).json({ error: 'blocked_host', hostname: targetURL.hostname });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

    const upstream = await fetch(targetURL.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(502).json({ error: 'upstream_status', status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
    if (!/^text\//i.test(contentType) && !/(json|xml|xhtml)/i.test(contentType)) {
      return res.status(415).json({ error: 'not_text', contentType });
    }

    // Stream and cap at MAX_SCRAPE_BYTES
    const reader = upstream.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_SCRAPE_BYTES) {
        try { reader.cancel(); } catch (_) {}
        return res.status(413).json({ error: 'too_large', limitBytes: MAX_SCRAPE_BYTES });
      }
      chunks.push(value);
    }

    const body = Buffer.concat(chunks);
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=600',
      'X-Scraper-Source': targetURL.hostname,
      'X-Scraper-Bytes': String(total)
    });
    res.send(body);
  } catch (err) {
    const code = err && err.name === 'AbortError' ? 'timeout' : 'network_error';
    res.status(502).json({ error: code, message: (err && err.message) || 'unknown' });
  }
});

// --- LLM Endpoint (Gemini API) ---
app.post('/api/llm', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({
      error: 'llm_not_configured',
      hint: 'Set GEMINI_API_KEY config var on this Heroku app'
    });
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return res.status(429).json({ error: 'rate_limited', retryAfterMs: rl.retryAfterMs });
  }

  const { prompt, system, tier, maxTokens } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'missing_prompt' });
  }
  if (prompt.length > 200_000) {
    return res.status(413).json({ error: 'prompt_too_long' });
  }
  if (system && typeof system === 'string' && system.length > 20_000) {
    return res.status(413).json({ error: 'system_too_long' });
  }

  const chosenTier = ['fast', 'balanced', 'powerful'].includes(tier) ? tier : 'balanced';
  const model = TIER_MODELS[chosenTier] || DEFAULT_MODEL;
  const tokens = Math.min(Math.max(parseInt(maxTokens, 10) || 8000, 100), 8000);

  // Build Gemini API request
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const geminiBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: tokens }
  };

  // Add system instruction if provided
  if (system && typeof system === 'string' && system.trim()) {
    geminiBody.systemInstruction = { parts: [{ text: system }] };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    const upstream = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (upstream.status === 400) {
      const body = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'gemini_bad_request', body: body.slice(0, 300) });
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return res.status(502).json({ error: 'gemini_auth_failed' });
    }
    if (upstream.status === 429) {
      return res.status(429).json({ error: 'gemini_rate_limited' });
    }
    if (upstream.status >= 500) {
      return res.status(502).json({ error: 'gemini_unavailable', status: upstream.status });
    }
    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'gemini_failed', status: upstream.status, body: body.slice(0, 300) });
    }

    const data = await upstream.json();

    // Extract text from Gemini response
    const text = data?.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      .map(p => p.text)
      .join('') || '';

    if (!text) {
      return res.status(502).json({ error: 'gemini_empty_response' });
    }

    res.json({
      text,
      model_used: model,
      tier: chosenTier,
      usage: data.usageMetadata || null
    });
  } catch (err) {
    const code = err && err.name === 'AbortError' ? 'timeout' : 'network_error';
    res.status(502).json({ error: code, message: (err && err.message) || 'unknown' });
  }
});

// ============================================================
// Static file serving (AFTER API routes)
// ============================================================
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  maxAge: '1h'
}));

// Fallback to index.html for SPA-style routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// Start server
// ============================================================
app.listen(PORT, '::', () => {
  console.log(`Loyalty Portal Generator running on port ${PORT} (IPv6 dual-stack)`);
  console.log(`LLM backend: ${GEMINI_API_KEY ? 'Gemini API configured' : 'NOT configured (set GEMINI_API_KEY)'}`);
});

// ============================================================
// Utilities
// ============================================================
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

function checkRateLimit(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  // GC occasionally
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
  }
  if (bucket.count > RATE_LIMIT_MAX) {
    return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - now) };
  }
  return { ok: true };
}
