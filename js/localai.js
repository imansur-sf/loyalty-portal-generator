// ============================================================
// localai.js — Local BYOK Anthropic client for the Quick Start
// ------------------------------------------------------------
// When the tile is NOT running on Page Host (e.g. downloaded HTML,
// GitHub Pages, `python3 -m http.server`), we can still power the
// URL-analysis feature by having the user paste their own Anthropic
// API key. Scraping the customer site goes through a public CORS
// proxy so any customer domain works — no per-domain allowlisting.
//
// The key stays in the user's browser localStorage and is only ever
// sent to api.anthropic.com. No third party sees it.
// ============================================================

(function () {
  if (!window.PageHost || !window.PageHost._analysis) {
    console.error('[localai] pagehost.js must load before localai.js');
    return;
  }
  const shared = window.PageHost._analysis;

  const KEY_STORAGE = 'anthropic_api_key';
  const MODEL_STORAGE = 'anthropic_model';
  const SCRAPER_URL_STORAGE = 'scraper_endpoint_url';

  // Default backend URL — empty string means same-origin (Heroku server handles
  // both /api/scrape and /api/llm). Users can override via Advanced → Scraper
  // Endpoint to point at an external deployment if needed.
  const DEFAULT_SCRAPER_URL = '';

  // Two supported providers, auto-detected from key prefix.
  const SF_GATEWAY_BASE = 'https://eng-ai-model-gateway.sfproxy.devx-preprod.aws-esvc1-useast2.aws.sfdc.cl';

  // Model IDs — one map per provider. Tier -> concrete model.
  const TIER_MODELS_ANTHROPIC = {
    fast:      'claude-haiku-4-5-20251001',
    balanced:  'claude-sonnet-5',
    powerful:  'claude-opus-4-8'
  };
  const TIER_MODELS_SF_GATEWAY = {
    // Gateway exposes older-suffixed model IDs; the gateway handles fallback
    // if a specific ID is unavailable (see request/fallback pairs in docs).
    fast:      'claude-3-5-sonnet-20241022',
    balanced:  'claude-sonnet-4-5-20250929',
    powerful:  'claude-sonnet-4-5-20250929'
  };
  const DEFAULT_MODEL = TIER_MODELS_ANTHROPIC.balanced;

  // ---- PROVIDER DETECTION ----
  // Three providers:
  //   'anthropic' — BYOK, sk-ant-* key → api.anthropic.com direct
  //   'sfgateway' — BYOK, any other sk- key → SF LLM Gateway direct
  //   'default'   — no BYOK key → Worker's /llm endpoint (server-held key)
  function detectProvider(key) {
    if (!key) return 'default';
    if (/^sk-ant-/i.test(key)) return 'anthropic';
    return 'sfgateway';
  }
  function currentProvider() { return detectProvider(getApiKey()); }

  // Public CORS proxies, tried in order. Corporate networks often block
  // arbitrary third-party proxies as security policy — hence multiple
  // fallbacks + a final URL-only mode if all of them fail.
  const CORS_PROXIES = [
    {
      name: 'corsproxy.io',
      wrap: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      unwrap: async (res) => await res.text()
    },
    {
      name: 'allorigins.win',
      wrap: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
      unwrap: async (res) => {
        const data = await res.json();
        return data && data.contents ? data.contents : '';
      }
    },
    {
      name: 'codetabs',
      wrap: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
      unwrap: async (res) => await res.text()
    },
    {
      name: 'thingproxy',
      wrap: (url) => `https://thingproxy.freeboard.io/fetch/${url}`,
      unwrap: async (res) => await res.text()
    }
  ];

  // ---- KEY MANAGEMENT ----
  function getApiKey() {
    try { return localStorage.getItem(KEY_STORAGE) || ''; }
    catch (_) { return ''; }
  }
  function setApiKey(key) {
    try {
      if (key && key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
      else localStorage.removeItem(KEY_STORAGE);
    } catch (_) { /* ignore */ }
  }
  function hasKey() { return getApiKey().length > 10; }

  function getModel() {
    try { return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL; }
    catch (_) { return DEFAULT_MODEL; }
  }
  function setModel(model) {
    try {
      if (model) localStorage.setItem(MODEL_STORAGE, model);
      else localStorage.removeItem(MODEL_STORAGE);
    } catch (_) { /* ignore */ }
  }

  // ---- SCRAPING ----
  // Preferred path: user-deployed Cloudflare Worker (or any endpoint they
  // control). Falls back to public CORS proxies if the Worker isn't
  // configured or unreachable.
  function getScraperEndpoint() {
    try {
      const override = (localStorage.getItem(SCRAPER_URL_STORAGE) || '').trim();
      return override || DEFAULT_SCRAPER_URL;
    } catch (_) { return DEFAULT_SCRAPER_URL; }
  }
  function getDefaultScraperEndpoint() { return DEFAULT_SCRAPER_URL; }
  function hasCustomScraperEndpoint() {
    try { return Boolean((localStorage.getItem(SCRAPER_URL_STORAGE) || '').trim()); }
    catch (_) { return false; }
  }
  function setScraperEndpoint(url) {
    try {
      const t = (url || '').trim();
      if (t) localStorage.setItem(SCRAPER_URL_STORAGE, t.replace(/\/+$/, ''));
      else localStorage.removeItem(SCRAPER_URL_STORAGE);
    } catch (_) { /* ignore */ }
  }

  // Backend routing is discovered without submitting paid work. A 404 is the
  // only implicit legacy signal; provider or transport failures never change routes.
  const backendAdapters = new Map();
  const safeRoute = (value, fallback) => typeof value === 'string' && /^\/(?!\/)[A-Za-z0-9_/:.-]+$/.test(value) && !value.includes('..') ? value : fallback;
  async function getBackendCapabilities(base = getScraperEndpoint()) {
    if (!backendAdapters.has(base)) backendAdapters.set(base, (async () => {
      const response = await timedFetch(`${base}/api/capabilities`, { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 404) return null;
      const data = await transportJSON(response);
      if (!response.ok) throw backendFailure(response.status, data);
      if (data?.version !== 1 || !['heroku','worker'].includes(data.adapter)) throw localError('generation_protocol');
      return data;
    })());
    try { return await backendAdapters.get(base); }
    catch (error) { backendAdapters.delete(base); throw error; }
  }

  const JOB_STORAGE = 'lpg-generation-tickets-v1';
  const jobMemory = new Map();
  const activeJobs = new Map();
  function readJobs() {
    try {
      const stored = JSON.parse(window.sessionStorage?.getItem(JOB_STORAGE) || '[]');
      if (Array.isArray(stored)) stored.filter(item => item && typeof item.key === 'string' && typeof item.base === 'string' && Number.isFinite(item.createdAt) && Date.now() - item.createdAt < 86400000).slice(-128).forEach(item => { if (!jobMemory.has(item.key)) jobMemory.set(item.key, item); });
    } catch (_) { /* Storage may be disabled in private browsing. */ }
    return [...jobMemory.values()];
  }
  function writeJob(record, remove = false) {
    if (remove) jobMemory.delete(record.key); else jobMemory.set(record.key, record);
    const records = [...jobMemory.values()].filter(item => Date.now() - item.createdAt < 86400000).slice(-128);
    try { window.sessionStorage?.setItem(JOB_STORAGE, JSON.stringify(records)); } catch (_) { /* In-memory recovery remains available. */ }
  }
  function requestKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    if (window.crypto?.getRandomValues) return Array.from(window.crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2,'0')).join('');
    return 'lpg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
  }
  function fingerprintBytes(bytes) {
    // SHA-256 fallback for older/custom HTTP hosts lacking WebCrypto. Persist
    // only the digest, never the customer brief or generation request body.
    const primes = []; for (let n = 2; primes.length < 64; n++) if (!primes.some(p => p * p <= n && n % p === 0)) primes.push(n);
    const h = primes.slice(0, 8).map(p => (Math.sqrt(p) % 1 * 4294967296) | 0);
    const k = primes.map(p => (Math.cbrt(p) % 1 * 4294967296) | 0);
    const padded = Array.from(bytes), bits = padded.length * 8; padded.push(128);
    while (padded.length % 64 !== 56) padded.push(0);
    for (let shift = 7; shift >= 0; shift--) padded.push(Math.floor(bits / (2 ** (shift * 8))) & 255);
    const rotate = (n, amount) => (n >>> amount) | (n << (32 - amount));
    for (let offset = 0; offset < padded.length; offset += 64) {
      const w = [];
      for (let i = 0; i < 64; i++) {
        if (i < 16) w[i] = (padded[offset+i*4]<<24) | (padded[offset+i*4+1]<<16) | (padded[offset+i*4+2]<<8) | padded[offset+i*4+3];
        else { const a = w[i-15], b = w[i-2]; w[i] = (w[i-16] + (rotate(a,7)^rotate(a,18)^(a>>>3)) + w[i-7] + (rotate(b,17)^rotate(b,19)^(b>>>10))) | 0; }
      }
      let [a,b,c,d,e,f,g,z] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (z + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + ((e&f)^(~e&g)) + k[i] + w[i]) | 0;
        const t2 = ((rotate(a,2)^rotate(a,13)^rotate(a,22)) + ((a&b)^(a&c)^(b&c))) | 0;
        z=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
      }
      [a,b,c,d,e,f,g,z].forEach((value, i) => { h[i] = (h[i] + value) | 0; });
    }
    return h.map(value => (value >>> 0).toString(16).padStart(8,'0')).join('');
  }
  async function requestFingerprint(base, kind, body) {
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    const text = JSON.stringify([base, kind, canonical(body)]);
    const bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(text) : Array.from(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex,16))), c => c.charCodeAt(0));
    if (!window.crypto?.subtle) return fingerprintBytes(bytes);
    return Array.from(new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2,'0')).join('');
  }
  function getPendingJobs() { return readJobs().filter(record => record.status !== 'complete').map(record => ({ id: record.ticket?.id || record.key, kind: record.kind, status: record.status, createdAt: record.createdAt, backend: record.base, hasTicket: Boolean(record.ticket) })); }
  function checkCancelled(signal) { if (signal?.aborted) throw localError('generation_cancelled'); }

  // Generation capabilities are short-lived and scoped to one backend. Never
  // persist them in project data, localStorage, URLs, or another backend's request.
  const backendCapabilities = new Map();
  async function backendAccessHeaders(base = '') {
    const key = String(base).replace(/\/+$/, '');
    let cached = backendCapabilities.get(key);
    if (cached?.expiresAt > Date.now() + 30000) return { 'X-LPG-Capability': cached.token };
    if (!cached?.pending) {
      const pending = (async () => {
        const response = await timedFetch(`${key}/api/capability`, { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: '{}' });
        // Explicit absence supports old custom backends. Modern LPG endpoints
        // still enforce their own capability check; this cannot bypass it.
        if (response.status === 404) return null;
        const data = await transportJSON(response);
        if (!response.ok) throw backendFailure(response.status, data);
        if (typeof data.token !== 'string' || data.token.length < 24 || data.token.length > 4096 || !Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now()) throw localError('generation_protocol');
        return { token: data.token, expiresAt: data.expiresAt };
      })();
      cached = { pending }; backendCapabilities.set(key, cached);
    }
    try {
      const result = await cached.pending;
      if (backendCapabilities.get(key) === cached) {
        if (result) backendCapabilities.set(key, result); else backendCapabilities.delete(key);
      }
      return result ? { 'X-LPG-Capability': result.token } : {};
    } catch (error) {
      if (backendCapabilities.get(key) === cached) backendCapabilities.delete(key);
      throw error;
    }
  }

  function forgetRejectedCapability(base, token) {
    const key = String(base).replace(/\/+$/, '');
    // A concurrent request may already be renewing or using a newer token.
    if (backendCapabilities.get(key)?.token === token) backendCapabilities.delete(key);
  }

  async function scrapeViaCorsProxy(url, { withMetadata = false } = {}) {
    let lastError = null;

    // 1) Try the primary scraper endpoint (same-origin /api/scrape or user-configured)
    const own = getScraperEndpoint();
    const scrapeBase = own || '';  // empty = same origin
    {
      try {
        let headers = await backendAccessHeaders(scrapeBase);
        const metadata = await getBackendCapabilities(scrapeBase);
        let endpoint = `${scrapeBase}${safeRoute(metadata?.scrape, '/api/scrape')}?url=${encodeURIComponent(url)}`;
        let res = await fetch(endpoint, { method: 'GET', credentials: 'same-origin', headers });
        if (res.status === 401 && ['generation_capability_required','generation_capability_expired'].includes(await capabilityRejection(res))) {
          forgetRejectedCapability(scrapeBase, headers['X-LPG-Capability']);
          headers = await backendAccessHeaders(scrapeBase);
          res = await fetch(endpoint, { method: 'GET', credentials: 'same-origin', headers });
        }
        if (res.status === 404 && scrapeBase && !metadata) { endpoint = `${scrapeBase}/scrape?url=${encodeURIComponent(url)}`; res = await fetch(endpoint, { method: 'GET', credentials: 'same-origin', headers }); }
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          const raw = await res.text();
          let html = raw;
          let finalUrl = url;
          if (/application\/json/i.test(ct)) {
            try { const envelope = JSON.parse(raw); html = typeof envelope.html === 'string' ? envelope.html : ''; if(/^https?:\/\//i.test(envelope.finalUrl || ''))finalUrl=envelope.finalUrl; } catch (_) { html = ''; }
          }
          if (html && html.length >= 40) {
            // Worker returns text/html or json errors — a json response starting
            // with { and no `<` means it's likely a structured error, not HTML.
            const looksJson = html.trim().startsWith('{');
            if (!looksJson) return withMetadata ? { html, finalUrl } : html;
          }
          lastError = localError('own_scraper_empty', { endpoint: scrapeBase || window.location.origin });
        } else {
          const body = await res.text().catch(() => '');
          lastError = localError('own_scraper_status', { status: res.status, endpoint: scrapeBase || window.location.origin, body: body.slice(0, 160) });
          if ([401,403,429].includes(res.status)) { lastError.noProxy = true; throw lastError; }
        }
      } catch (err) {
        if (err.noProxy || ['generation_session','generation_origin','generation_permission','default_rate_limited','generation_budget'].includes(err.code)) throw err;
        lastError = localError('own_scraper_network', { endpoint: scrapeBase || window.location.origin, cause: err.message });
      }
    }

    // 2) Fallback to public CORS proxies
    for (const proxy of CORS_PROXIES) {
      try {
        const res = await fetch(proxy.wrap(url), { method: 'GET' });
        if (!res.ok) {
          lastError = localError('proxy_fetch_failed', { status: res.status, proxy: proxy.name });
          continue;
        }
        const html = await proxy.unwrap(res);
        if (!html || html.length < 40) {
          lastError = localError('proxy_empty_response', { proxy: proxy.name });
          continue;
        }
        return withMetadata ? { html, finalUrl: url } : html;
      } catch (err) {
        lastError = localError('proxy_network_error', { proxy: proxy.name, cause: err.message });
      }
    }
    throw lastError || localError('proxy_all_failed');
  }

  // ---- ROUTER ----
  // Picks the LLM path based on which key (if any) the user has pasted.
  //   No key           → Worker /llm (SF Gateway key held server-side)  [default]
  //   sk-ant-* key     → api.anthropic.com direct
  //   any other sk-*   → SF LLM Gateway direct
  // Same return shape from every path so callers don't care which was used.
  async function callLLM({ prompt, system, tier = 'balanced', model, maxTokens = 8000, responseFormat, responseContract, responseAudience, signal, resumeUnknown }) {
    const provider = currentProvider();
    if (provider === 'anthropic') {
      return callAnthropicDirect({ prompt, system, tier, model, maxTokens });
    }
    if (provider === 'sfgateway') {
      return callSFGateway({ prompt, system, tier, model, maxTokens });
    }
    return callDefaultBackend({ prompt, system, tier, model, maxTokens, responseFormat, responseContract, responseAudience, signal, resumeUnknown });
  }

  // ---- DEFAULT BACKEND (Worker's /llm endpoint) ----
  // Client doesn't hold a key. Worker holds SF_GATEWAY_KEY as a secret and
  // proxies to the SF Gateway. No BYOK required for the typical user.
  const JOB_DEADLINE_MS = 150000;
  const JOB_POLL_MS = 1500;
  const REQUEST_TIMEOUT_MS = 24000;

  async function timedFetch(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller && typeof window.setTimeout === 'function'
      ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(url, { ...options, ...(controller ? { signal: controller.signal } : {}) });
      let payload, parseError;
      if (options.method !== 'DELETE' && response.status !== 404) {
        try { payload = await response.json(); }
        catch (error) {
          if (controller?.signal.aborted || ['AbortError', 'TypeError'].includes(error.name)) throw error;
          parseError = error;
        }
      }
      // Keep the request deadline active through downloading/parsing the body,
      // including multi-megabyte image results, not just receipt of headers.
      return { status: response.status, ok: response.ok, headers: response.headers,
        json: async () => { if (parseError) throw parseError; return payload; } };
    }
    finally { if (timer !== null) window.clearTimeout(timer); }
  }

  function backendFailure(status, body = {}, transport = false) {
    const code = body?.error;
    if (status === 401 || status === 403) return localError('generation_session');
    if (['generation_budget_exceeded', 'capability_limit'].includes(code)) return localError('generation_budget');
    if (code === 'generation_busy') return localError('generation_busy');
    if (code === 'generation_result_too_large') return localError('generation_result_too_large');
    if (code === 'llm_not_configured') return localError('default_not_configured');
    if (code === 'timeout') return localError('generation_provider_timeout');
    if (code === 'network_error') return localError('generation_provider_network');
    if (code === 'gemini_auth_failed') return localError('generation_provider_auth');
    if (status === 429) return localError('default_rate_limited');
    if ([502, 503, 504].includes(status)) return localError(transport ? 'generation_gateway' : 'default_unavailable', { status, upstream: code });
    return localError('default_failed', { status, upstream: code, upstreamStatus: body?.status });
  }

  async function capabilityRejection(response) {
    if (![401,403].includes(response.status) || typeof response.json !== 'function') return '';
    // timedFetch has already buffered the body and exposes a reusable json().
    try { return (await (typeof response.clone === 'function' ? response.clone() : response).json()).error || ''; } catch (_) { return ''; }
  }
  async function authorizedBackendPost(path, body, base, extraHeaders = {}) {
    const send = async access => timedFetch(`${base}${path}`, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...access, ...extraHeaders }, body: JSON.stringify(body) });
    let access = await backendAccessHeaders(base);
    let response = await send(access);
    const rejection = await capabilityRejection(response);
    // Only these explicit rejections establish that no paid work was accepted.
    // Never retry uncertain transport failures, HTML sign-in pages, or a 202 job.
    if (response.status === 401 && ['generation_capability_required','generation_capability_expired'].includes(rejection)) {
      forgetRejectedCapability(base, access['X-LPG-Capability']);
      access = await backendAccessHeaders(base);
      response = await send(access);
    }
    return response;
  }

  async function transportJSON(response) {
    if ([401, 403].includes(response.status)) {
      const rejection = await capabilityRejection(response);
      if (['origin_not_allowed','same_origin_required'].includes(rejection)) throw localError('generation_origin');
      if (['generation_capability_required','generation_capability_expired'].includes(rejection)) throw localError('generation_permission');
      throw localError('generation_session');
    }
    const type = response.headers?.get('content-type') || '';
    if (/text\/html/i.test(type)) throw localError(response.status >= 500 ? 'generation_gateway' : 'generation_session', { status: response.status });
    try { return await response.json(); }
    catch (_) { throw localError(response.status >= 500 ? 'generation_gateway' : 'generation_protocol', { status: response.status }); }
  }

  // Short submit/poll requests prevent Heroku's router from terminating long AI
  // calls. Job credentials stay in this closure and never enter saved projects.
  async function cancelBackendJob(id) {
    const record = readJobs().find(item => item.ticket?.id === id || item.key === id);
    if (!record) return false;
    record.status = 'cancelled'; writeJob(record);
    if (record.ticket) {
      const route = safeRoute(record.pollRoute, '/api/jobs/:id').replace(':id', encodeURIComponent(record.ticket.id));
      try { await timedFetch(`${record.base}${route}`, { method: 'DELETE', credentials: 'same-origin', headers: { Authorization: `Bearer ${record.ticket.token}` } }, 3000); } catch (_) { /* Cancellation is best effort; provider work may already be underway. */ }
    }
    return true;
  }
  async function pollBackendJob(record, { signal } = {}) {
    const ticket = record.ticket;
    const url = `${record.base}${safeRoute(record.pollRoute, '/api/jobs/:id').replace(':id', encodeURIComponent(ticket.id))}`;
    const headers = { Authorization: `Bearer ${ticket.token}` };
    const deadline = Date.now() + JOB_DEADLINE_MS;
    let transientFailures = 0;
    const abort = () => { void cancelBackendJob(ticket.id); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      while (Date.now() < deadline) {
        checkCancelled(signal);
        await new Promise(resolve => window.setTimeout(resolve, Math.min(JOB_POLL_MS, Math.max(0, deadline - Date.now()))));
        checkCancelled(signal);
        if (record.status === 'cancelled') throw localError('generation_cancelled');
        if (Date.now() >= deadline) break;
        let response;
        try { response = await timedFetch(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers }, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now())); }
        catch (_) { if (++transientFailures < 3 && Date.now() < deadline) continue; throw localError('generation_poll_network'); }
        if (response.status === 404) { record.status = 'missing'; writeJob(record); throw localError('generation_job_missing'); }
        if ([502,503,504].includes(response.status)) { if (++transientFailures < 3 && Date.now() < deadline) continue; throw localError('generation_gateway', { status: response.status }); }
        const job = await transportJSON(response);
        checkCancelled(signal);
        if (record.status === 'cancelled') throw localError('generation_cancelled');
        if (!response.ok) throw backendFailure(response.status, job, true);
        transientFailures = 0;
        if (['interrupted','cancelled','expired','consumed'].includes(job?.status)) { record.status = job.status; writeJob(record); throw localError('generation_' + job.status); }
        if (job?.status === 'pending') {
          record.status = 'pending'; writeJob(record);
          if (job.resumable === true) { record.status = 'queued'; writeJob(record); throw localError('generation_resume_required'); }
          continue;
        }
        if (job?.status !== 'complete' || !Number.isInteger(job.result?.status) || job.result.status < 200 || job.result.status > 599 || !job.result.body || typeof job.result.body !== 'object') throw localError('generation_protocol');
        checkCancelled(signal);
        try { await timedFetch(url, { method: 'DELETE', credentials: 'same-origin', headers }, 3000); } catch (_) { /* expires server-side */ }
        record.status = 'complete'; writeJob(record);
        if (job.result.status >= 400) throw backendFailure(job.result.status, job.result.body);
        return job.result.body;
      }
      throw localError('generation_deadline');
    } finally { signal?.removeEventListener('abort', abort); }
  }
  function discardBackendJob(id) {
    const record = readJobs().find(item => item.ticket?.id === id || item.key === id);
    if (!record || !['cancelled','interrupted','missing','expired','consumed'].includes(record.status)) return false;
    writeJob(record, true); return true;
  }
  async function resumeBackendJob(id, { signal } = {}) {
    const record = readJobs().find(item => item.ticket?.id === id || item.key === id);
    if (!record?.ticket) throw localError('generation_submission_unknown');
    if (['cancelled','interrupted','missing','expired','consumed'].includes(record.status)) throw localError('generation_' + record.status);
    if (record.status === 'queued') {
      const path = safeRoute(record.resumeRoute, '/api/jobs/:id/resume').replace(':id', encodeURIComponent(record.ticket.id));
      const response = await authorizedBackendPost(path, {}, record.base, { Authorization: `Bearer ${record.ticket.token}` });
      const payload = await transportJSON(response);
      if (!response.ok) throw backendFailure(response.status, payload, true);
      record.status = 'pending'; writeJob(record);
    }
    return pollBackendJob(record, { signal });
  }
  const inFlightRequests = new Map();
  function runBackendJob(kind, body, base = getScraperEndpoint(), options = {}) {
    const key = JSON.stringify([base, kind, body]);
    if (inFlightRequests.has(key)) return inFlightRequests.get(key);
    const pending = executeBackendJob(kind, body, base, options);
    inFlightRequests.set(key, pending);
    return pending.finally(() => { if (inFlightRequests.get(key) === pending) inFlightRequests.delete(key); });
  }
  async function executeBackendJob(kind, body, base, { signal, resumeUnknown = false } = {}) {
    const paths = { llm: '/api/llm', images: '/api/generate-images', image: '/api/generate-image' };
    if (!paths[kind]) throw localError('generation_protocol');
    checkCancelled(signal);
    await backendAccessHeaders(base);
    const metadata = await getBackendCapabilities(base);
    const fingerprint = await requestFingerprint(base, kind, body);
    if (fingerprint && activeJobs.has(fingerprint)) return activeJobs.get(fingerprint);
    let record = fingerprint && readJobs().reverse().find(item => item.fingerprint === fingerprint && item.base === base && (resumeUnknown || item.status !== 'complete'));
    if (record && ['cancelled','interrupted','missing','expired','consumed'].includes(record.status)) throw localError('generation_' + record.status);
    if (record?.ticket) return resumeBackendJob(record.ticket.id, { signal });
    if (record && !(resumeUnknown && metadata?.jobs?.idempotency === true)) throw localError('generation_submission_unknown');
    const execute = async () => {
      await backendAccessHeaders(base);
      checkCancelled(signal);
      if (!record) record = { key: requestKey(), fingerprint, base, kind, createdAt: Date.now(), status: 'submitting' };
      writeJob(record);
      let submitted;
      const submitPath = safeRoute(metadata?.jobs?.submit, '/api/jobs');
      const legacyCall = async () => {
        let path = safeRoute(metadata?.[kind], paths[kind]);
        let response = await authorizedBackendPost(path, body, base);
        // An explicit 404 guarantees this route accepted no provider work.
        if (response.status === 404 && base && kind === 'llm' && path === '/api/llm') response = await authorizedBackendPost('/llm', body, base);
        const payload = await transportJSON(response);
        if (!response.ok) throw backendFailure(response.status, payload);
        writeJob(record, true); return payload;
      };
      if (metadata?.jobs === false) {
        try { return await legacyCall(); } catch (error) { if (error.code) throw error; throw localError('generation_legacy_network'); }
      }
      try { submitted = await authorizedBackendPost(submitPath, { ...body, kind }, base, { 'Idempotency-Key': record.key }); }
      catch (_) { record.status = 'unknown'; writeJob(record); throw localError('generation_submission_unknown'); }
      if (submitted.status === 404) {
        try { return await legacyCall(); } catch (error) { if (error.code) throw error; throw localError('generation_legacy_network'); }
      }
      let ticket;
      try { ticket = await transportJSON(submitted); } catch (error) { if ([401,403,429].includes(submitted.status)) writeJob(record, true); else { record.status = 'unknown'; writeJob(record); } throw error; }
      if (![200,202].includes(submitted.status)) { writeJob(record, true); if (!submitted.ok) throw backendFailure(submitted.status, ticket, true); throw localError('generation_protocol'); }
      if (!ticket || !/^[a-zA-Z0-9_-]{8,128}$/.test(ticket.id || '') || !/^[a-zA-Z0-9_-]{8,256}$/.test(ticket.token || '')) { record.status = 'unknown'; writeJob(record); throw localError('generation_protocol'); }
      record.ticket = { id: ticket.id, token: ticket.token }; record.status = 'pending';
      record.pollRoute = safeRoute(metadata?.jobs?.poll, '/api/jobs/:id'); record.resumeRoute = safeRoute(metadata?.jobs?.resume, '/api/jobs/:id/resume'); writeJob(record);
      if (signal?.aborted) { await cancelBackendJob(ticket.id); throw localError('generation_cancelled'); }
      return pollBackendJob(record, { signal });
    };
    const pending = execute();
    if (fingerprint) activeJobs.set(fingerprint, pending);
    try { return await pending; } finally { if (fingerprint) activeJobs.delete(fingerprint); }
  }

  async function callDefaultBackend({ prompt, system, tier = 'balanced', model, maxTokens = 8000, responseFormat, responseContract, responseAudience, signal, resumeUnknown }) {
    const base = getScraperEndpoint(); // empty = same origin; both /api/scrape and /api/llm live here
    const data = await runBackendJob('llm', { prompt, system, tier, model, maxTokens, ...(responseFormat ? { responseFormat } : {}), ...(responseContract !== undefined ? { responseContract } : {}), ...(responseAudience !== undefined ? { responseAudience } : {}) }, base, { signal, resumeUnknown });
    if (!data || (!data.text && data.finish_reason !== 'MAX_TOKENS')) throw localError('default_empty_response');
    return { text: data.text, model_used: data.model_used, usage: data.usage, finish_reason: data.finish_reason };
  }

  // ---- ANTHROPIC DIRECT ----
  // If content is a string → plain text prompt.
  // If content is an array → user provided structured content (e.g. a document URL block).
  async function callAnthropicDirect({ prompt, system, tier = 'balanced', model, maxTokens = 8000, userContent }) {
    const key = getApiKey();
    if (!key) throw localError('missing_api_key');

    const chosenModel = model || getModel() || TIER_MODELS_ANTHROPIC[tier] || DEFAULT_MODEL;

    const messages = [{
      role: 'user',
      content: userContent || prompt
    }];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: maxTokens,
        system,
        messages
      })
    });

    if (res.status === 401) throw localError('anthropic_bad_key');
    if (res.status === 403) throw localError('anthropic_forbidden');
    if (res.status === 429) throw localError('anthropic_rate_limited');
    if (res.status === 529) throw localError('anthropic_overloaded');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw localError('anthropic_failed', { status: res.status, body: body.slice(0, 200) });
    }

    const data = await res.json();
    const text = Array.isArray(data.content)
      ? data.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : '';
    if (!text) throw localError('anthropic_empty_response');

    return { text, model_used: data.model, usage: data.usage, finish_reason: data.stop_reason === 'max_tokens' ? 'MAX_TOKENS' : data.stop_reason };
  }

  // ---- SALESFORCE LLM GATEWAY EXPRESS ----
  // OpenAI-compatible: POST /v1/chat/completions
  // Body:   { model, messages: [{role, content}], max_tokens }
  // Auth:   Authorization: Bearer <key>
  // Reply:  { choices: [{ message: { content, role }, finish_reason }], model, usage }
  async function callSFGateway({ prompt, system, tier = 'balanced', model, maxTokens = 8000 }) {
    const key = getApiKey();
    if (!key) throw localError('missing_api_key');

    const chosenModel = model || getModel() || TIER_MODELS_SF_GATEWAY[tier] || TIER_MODELS_SF_GATEWAY.balanced;

    // Prepend the system prompt as messages[0] per OpenAI convention
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${SF_GATEWAY_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: chosenModel,
        messages,
        max_tokens: maxTokens
      })
    });

    if (res.status === 0)   throw localError('sfgateway_network');
    if (res.status === 401) throw localError('sfgateway_bad_key');
    if (res.status === 403) throw localError('sfgateway_forbidden');
    if (res.status === 404) throw localError('sfgateway_model_not_found', { model: chosenModel });
    if (res.status === 429) throw localError('sfgateway_rate_limited');
    if (res.status === 502 || res.status === 503 || res.status === 504) throw localError('sfgateway_unavailable', { status: res.status });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw localError('sfgateway_failed', { status: res.status, body: body.slice(0, 200) });
    }

    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message
      ? (data.choices[0].message.content || '')
      : '';
    if (!text) throw localError('sfgateway_empty_response');

    return { text, model_used: data.model || chosenModel, usage: data.usage, finish_reason: data.choices?.[0]?.finish_reason === 'length' ? 'MAX_TOKENS' : data.choices?.[0]?.finish_reason };
  }

  // Backward compat: some callers may still reference callAnthropic
  const callAnthropic = callLLM;

  // ---- AI IMAGE GENERATION (fills empty image slots after analysis) ----

  // Cover every visible section before filling additional cards in each section.
  const IMAGE_SLOT_CONFIG = [
    { collection: 'vouchers', field: 'imageUrl', dataField: 'imageData', type: 'voucher',  aspect: '1:1',  priority: 1 },
    { collection: 'offers',   field: 'imageUrl', dataField: 'imageData', type: 'offer',    aspect: '16:9', priority: 1 },
    { collection: 'clubs',    field: 'imageUrl', dataField: 'imageData', type: 'club',     aspect: '1:1',  priority: 1 },
    { collection: 'badges',   field: 'imageUrl', dataField: 'imageData', type: 'badge',    aspect: '1:1',  priority: 1 },
    { collection: 'benefits', field: 'imageUrl', dataField: 'imageData', type: 'benefit',  aspect: '1:1',  priority: 1 },
  ];
  // Also handle upsell.bgImageUrl separately (single object, not array)
  const IMAGE_BATCH_SIZE = 4; // Bound async job concurrency and large result buffers.
  const MAX_IMAGE_GEN = 48; // Bound exceptional programs across all batches.

  function buildImagePrompt(type, item, brand) {
    const brandName = brand.brandName || 'the brand';
    const industry = brand.industry || 'lifestyle';
    const primary = brand.colors?.primary || '#333333';
    const accent  = brand.colors?.accent  || '#666666';
    const colorHint = `Use brand colors ${primary} and ${accent} as accents in the composition.`;

    switch (type) {
      case 'voucher':
        return `High-quality commercial product or service image for a ${industry} loyalty program voucher titled "${item.title || 'Reward'}" by ${brandName}. ${colorHint} Clean, modern style. Professional photography look. No text or words in the image.`;
      case 'offer':
        return `Lifestyle promotional image for a ${industry} special offer: "${item.title || 'Special Offer'}" — ${item.description || ''}. Brand: ${brandName}. ${colorHint} Aspirational, inviting mood. No text or words in the image.`;
      case 'badge':
        return `A single clean achievement badge icon for "${item.name || 'Achievement'}" in a ${industry} loyalty program. ${colorHint} Minimal, modern flat design. Centered on a subtle background. No text.`;
      case 'benefit-cover':
        return `Full-bleed editorial photograph or environmental scene illustrating the member benefit "${item.name || 'Member benefit'}" for ${brandName}, ${industry}. ${colorHint} Rich cinematic lighting, edge-to-edge scene for a large tile, space for readable text overlay. No icons, badges, typography, text or words.`;
      case 'card-mark':
        return `A refined emblem or logo symbol for the ${industry} brand ${brandName}, suitable for a metallic loyalty card. ${colorHint} Simple distinctive graphic, no text or words.`;
      case 'card-artwork':
        return `Full loyalty card artwork for ${brandName}, a ${industry} brand. ${colorHint} Premium cinematic visual, balanced composition, no text, words or numbers; member text is added separately.`;
      case 'benefit':
        return `A polished illustrated benefit icon representing "${item.name || 'Member benefit'}" for ${brandName}. ${colorHint} Clean, modern, consistent flat illustration. Centered on a subtle background. No text or words.`;
      case 'club':
        return `Community/group lifestyle image for a ${industry} loyalty club called "${item.name || 'Club'}" — ${item.description || ''}. Brand: ${brandName}. ${colorHint} Warm, social, inviting. No text.`;
      case 'upsell':
        return `Wide cinematic background image for a premium ${industry} membership upgrade by ${brandName}. ${colorHint} Dark, luxurious, atmospheric mood. Abstract or environmental scene. No text or words.`;
      default:
        return `Professional ${industry} image for ${brandName}. ${colorHint} Clean, modern style. No text.`;
    }
  }

  const MAX_GENERATED_IMAGE_LENGTH = 200 * 1024; // Includes data URI/base64 overhead in saved JSON.

  async function optimizeGeneratedImage(imageData, { hero = false } = {}) {
    const valid = /^data:image\/(?:png|jpeg|webp|gif);base64,/i;
    if (typeof imageData !== 'string' || !valid.test(imageData)) return { imageData: '', optimized: false, warning: 'The image service returned an unsupported image format.' };
    // Small assets already meet the saved-project budget; this also permits
    // previews in environments without a canvas implementation.
    if (imageData.length <= MAX_GENERATED_IMAGE_LENGTH) return { imageData, optimized: false };
    const omitted = reason => ({ imageData: '', optimized: false,
      warning: `A generated image was omitted to keep the project saveable: ${reason}. Add a smaller image or generate again.` });
    if (typeof window.Image !== 'function' || !window.document?.createElement) return omitted('image optimization is unavailable');
    try {
      const source = new window.Image();
      await new Promise((resolve, reject) => {
        let timer;
        const finish = error => {
          if (timer !== undefined) window.clearTimeout(timer);
          source.onload = null; source.onerror = null;
          if (error) reject(error); else resolve();
        };
        source.onload = () => finish();
        source.onerror = () => finish(new Error('the generated image could not be decoded'));
        if (typeof window.setTimeout === 'function') timer = window.setTimeout(() => finish(new Error('image decoding timed out')), 20000);
        source.src = imageData;
      });
      const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
      if (!(width > 0 && height > 0)) return omitted('the generated image has invalid dimensions');
      const canvas = window.document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context || typeof canvas.toDataURL !== 'function') return omitted('canvas encoding is unavailable');
      const longest = hero ? 1280 : 960;
      const baseScale = Math.min(1, longest / Math.max(width, height));
      // Bounded work: progressively lower quality, then dimensions. Never store
      // the original megabyte asset when the encoder cannot meet the budget.
      for (const scale of [1, 0.75, 0.5]) {
        canvas.width = Math.max(1, Math.round(width * baseScale * scale));
        canvas.height = Math.max(1, Math.round(height * baseScale * scale));
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.82, 0.7, 0.58, 0.46]) {
          let encoded = canvas.toDataURL('image/webp', quality);
          if (!/^data:image\/webp;base64,/i.test(encoded)) encoded = canvas.toDataURL('image/jpeg', quality);
          if (/^data:image\/(?:webp|jpeg);base64,/i.test(encoded) && encoded.length <= MAX_GENERATED_IMAGE_LENGTH) return { imageData: encoded, optimized: true };
        }
      }
      return omitted('the image stayed above the 200 KB budget after compression');
    } catch (error) {
      return omitted(error?.message || 'image optimization failed');
    }
  }

  async function fillMissingImages(parsed, { onStatus, outputTemplate = parsed.outputTemplate, onlySlots, prompt, signal, resumeUnknown = false, maxImages = MAX_IMAGE_GEN } = {}) {
    // Only use default backend (server-side Gemini) for image generation
    const base = getScraperEndpoint(); // empty = same origin

    // Collect empty slots
    const slots = [];

    // Check upsell background first (high priority)
    if (parsed.upsell && !parsed.upsell.bgImageUrl && !parsed.upsell.bgImageData) {
      slots.push({
        slot: 'upsell-bg',
        prompt: buildImagePrompt('upsell', parsed.upsell, parsed).slice(0, 2000),
        priority: 0,
        apply: (dataUri) => { parsed.upsell.bgImageData = dataUri; }
      });
    }

    // Check array collections
    for (const cfg of IMAGE_SLOT_CONFIG) {
      const arr = parsed[cfg.collection];
      if (!Array.isArray(arr)) continue;
      arr.forEach((item, i) => {
        if (!item[cfg.field] && !item[cfg.dataField]) {
          slots.push({
            slot: `${cfg.type}-${i}`,
            prompt: buildImagePrompt(cfg.type, item, parsed).slice(0, 2000),
            priority: cfg.priority + i + (outputTemplate === 'cinematic' && cfg.type === 'benefit' ? 20 : 0),
            apply: (dataUri) => { item[cfg.dataField] = dataUri; }
          });
        }
      });
    }

    if (outputTemplate === 'cinematic') {
      (Array.isArray(parsed.benefits) ? parsed.benefits : []).forEach((item, i) => {
        if (!item.coverImageUrl && !item.coverImageData) slots.push({
          slot: `benefit-cover-${i}`, prompt: buildImagePrompt('benefit-cover', item, parsed), priority: 0.5 + i,
          customPrompt: item.coverPrompt,
          apply: dataUri => { item.coverImageData = dataUri; }
        });
      });
      const card = parsed.cinematic?.card;
      if (card?.markMode === 'custom' && !card.markImageUrl && !card.markImageData) slots.push({
        slot: 'card-mark', prompt: buildImagePrompt('card-mark', card, parsed), priority: 1, customPrompt: card.markPrompt,
        apply: dataUri => { card.markImageData = dataUri; }
      });
      if (card?.mode === 'image' && !card.artworkImageUrl && !card.artworkImageData) slots.push({
        slot: 'card-artwork', prompt: buildImagePrompt('card-artwork', card, parsed), priority: 1, customPrompt: card.artworkPrompt,
        apply: dataUri => { card.artworkImageData = dataUri; }
      });
    }
    const allowed = Array.isArray(onlySlots) ? new Set(onlySlots) : null;
    for (let i = slots.length - 1; i >= 0; i--) {
      if (allowed && !allowed.has(slots[i].slot)) { slots.splice(i, 1); continue; }
      const custom = allowed && (typeof prompt === 'string' ? prompt : slots[i].customPrompt || parsed._cinematicImagePrompt);
      slots[i].prompt = (slots[i].prompt + (typeof custom === 'string' && custom.trim() ? ` Author visual direction: ${custom.trim().slice(0, 1200)}` : '')).slice(0, 2000);
    }

    if (slots.length === 0) {
      console.log('[LocalAI] All image slots filled from scrape — no generation needed');
      return { generated: 0, total_empty: 0 };
    }

    // Round-robin priority prevents a large rewards list from starving offers,
    // clubs, badges and benefits. Keep each asynchronous result batch small.
    slots.sort((a, b) => a.priority - b.priority);
    const budget = Number.isInteger(maxImages) ? Math.max(0, Math.min(MAX_IMAGE_GEN, maxImages)) : MAX_IMAGE_GEN;
    const selected = slots.slice(0, budget);
    const skipped = slots.length - selected.length;

    console.log(`[LocalAI] Generating ${selected.length} images (${skipped} additional slots beyond this run's limit)`);
    if (onStatus) onStatus('generating_images', { generated: 0, attempted: 0, total: selected.length, remaining: slots.length });
    let generated = 0, attempted = 0;
    const errors = [];
    for (let offset = 0; offset < selected.length; offset += IMAGE_BATCH_SIZE) {
      if (signal?.aborted) { errors.push(humanErrorMessage(localError('generation_cancelled'))); break; }
      const batch = selected.slice(offset, offset + IMAGE_BATCH_SIZE);
      attempted += batch.length;
      try {
        const data = await runBackendJob('images', { prompts: batch.map(s => ({ slot: s.slot, prompt: s.prompt })) }, base, { signal, resumeUnknown });
        const completed = new Set();
        if (Array.isArray(data.results)) {
          for (const result of data.results) {
            if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(result.imageData || '') && !result.error) {
              const match = batch.find(s => s.slot === result.slot);
              if (match && !completed.has(match.slot)) {
                const optimized = await optimizeGeneratedImage(result.imageData, { hero: match.slot === 'upsell-bg' });
                if (!signal?.aborted && optimized.imageData) { match.apply(optimized.imageData); completed.add(match.slot); generated++; }
                else if (optimized.warning) errors.push(optimized.warning);
              }
            }
          }
        }
        if (onStatus) onStatus('generating_images', { generated, attempted, total: selected.length, remaining: slots.length - generated });
        if (completed.size < batch.length) errors.push(`${batch.length - completed.size} images failed in a batch`);
      } catch (err) {
        errors.push(humanErrorMessage(err));
        break;
      }
    }
    const remaining = slots.length - generated;
    const warning = remaining ? `${generated} of ${slots.length} missing images generated; ${remaining} remain empty.${skipped ? ` ${skipped} exceed the ${budget}-image limit for one run.` : ''}${errors.length ? ' ' + [...new Set(errors)].join('; ') + '.' : ''}` : '';
    console.log(`[LocalAI] Generated ${generated}/${slots.length} images successfully`);
    return { generated, total_empty: slots.length, attempted, remaining, skipped, failed: attempted - generated, cancelled: Boolean(signal?.aborted),
      ...(warning ? { warning } : {}), ...(errors.length ? { error: [...new Set(errors)].join('; ') } : {}) };
  }

  // ---- MAIN ORCHESTRATION ----
  //
  // Path selection (in order of preference):
  //
  //   1. Anthropic URL-document (sk-ant-* keys only). Anthropic's server
  //      fetches the URL — zero CORS, zero infra. Best quality, most
  //      reliable. Falls through if API returns "unsupported" error.
  //   2. Client-side scrape → prompt with candidates. Uses the user's
  //      scraper endpoint if configured, else public CORS proxies.
  //   3. URL-only (Claude training knowledge). Last resort.
  //
  async function analyzeCustomerURL(rawUrl, opts = {}) {
    const url = shared.normalizeURL(rawUrl);
    if (!url) throw localError('invalid_url');
    // BYOK is no longer required — default path uses the Worker /llm endpoint.

    const onStatus = opts.onStatus || (() => {});
    const provider = currentProvider();
    const tier = opts.tier || 'balanced';

    // Path 1: Anthropic URL-document (server-side fetch by Anthropic)
    if (provider === 'anthropic' && !opts.skipScraping && !opts.disableUrlDoc) {
      onStatus('anthropic_url_doc');
      try {
        const parsed = await analyzeViaAnthropicUrlDoc(url, { tier });
        parsed._meta = {
          source_url: url,
          model_used: parsed._meta && parsed._meta.model_used,
          tier,
          provider,
          mode: 'local-anthropic-url-doc',
          fallback_reason: null
        };
        // Fill empty image slots with AI-generated images
        const imgResult = await fillMissingImages(parsed, { onStatus });
        parsed._meta.images_generated = imgResult.generated || 0;
        parsed._meta.images_empty = imgResult.total_empty || 0;
        return parsed;
      } catch (err) {
        // If Anthropic returns "document fetch not supported for URL" or a
        // 400-family error, gracefully fall through to the scrape path.
        console.warn('[LocalAI] Anthropic URL-doc unsupported, falling back to scrape path:', err.code || err.message);
      }
    }

    // Path 2: Client-side scrape → prompt
    let scraped = null;
    let fallbackReason = null;

    if (opts.skipScraping) {
      fallbackReason = 'skipped';
    } else {
      onStatus('fetching');
      try {
        const html = await scrapeViaCorsProxy(url);
        scraped = shared.extractCoreHTML(html, url);
      } catch (scrapeErr) {
        console.warn('[LocalAI] scraping failed, falling back to URL-only:', scrapeErr.code || scrapeErr.message);
        fallbackReason = scrapeErr.code || 'scrape_failed';
        onStatus('fallback_url_only');
      }
    }

    // Path 3 (implicit): if no scrape, hand Claude just the URL
    if (!scraped) scraped = { url, title: '', bodyText: '', headings: '', favicon: '', ogImage: '', navLinkCandidates: [] };

    onStatus('analyzing');
    const { text, model_used } = await callLLM({
      prompt: shared.buildUserPrompt(scraped),
      system: shared.SYSTEM_PROMPT,
      tier,
      maxTokens: 8000
    });

    const parsed = shared.parseAIResponseText(text);
    parsed._meta = {
      source_url: url,
      favicon: scraped.favicon,
      apple_icon: scraped.appleIcon,
      og_image: scraped.ogImage,
      twitter_image: scraped.twitterImage,
      image_count: (scraped.images || []).length,
      model_used,
      tier,
      provider,
      mode: fallbackReason ? 'local-url-only' : 'local',
      fallback_reason: fallbackReason
    };

    // Fill empty image slots with AI-generated images
    const imgResult = await fillMissingImages(parsed, { onStatus });
    parsed._meta.images_generated = imgResult.generated || 0;
    parsed._meta.images_empty = imgResult.total_empty || 0;

    return parsed;
  }

  // ---- ANTHROPIC URL-DOCUMENT PATH ----
  // Wraps callAnthropicDirect but sends the URL as a content-block document.
  // Anthropic fetches the URL server-side and hands the content to Claude —
  // no client-side scraping, no CORS.
  async function analyzeViaAnthropicUrlDoc(url, { tier }) {
    const userContent = [
      {
        type: 'document',
        source: { type: 'url', url }
      },
      {
        type: 'text',
        text: `The document above is the customer's homepage HTML fetched from ${url}. Analyze it per the schema — extract brand identity, colors, and generate loyalty content. For imageUrl fields, use ONLY absolute image URLs you can see referenced in the HTML (typically <img src="..."> or CSS background-image url("...")). Never invent URLs. If unsure, use "".

Return ONLY the JSON per the schema. Return ONLY the JSON.`
      }
    ];

    const { text, model_used } = await callAnthropicDirect({
      system: shared.SYSTEM_PROMPT,
      userContent,
      tier,
      maxTokens: 8000
    });

    const parsed = shared.parseAIResponseText(text);
    parsed._meta = parsed._meta || {};
    parsed._meta.model_used = model_used;
    return parsed;
  }

  function localError(code, extra) {
    const err = new Error(code);
    err.code = code;
    Object.assign(err, extra || {});
    return err;
  }

  function humanErrorMessage(err) {
    if (!err) return 'Unknown error.';
    const code = err.code || err.message;
    switch (code) {
      case 'missing_api_key':
        return 'This tool works without a key by default. If you\'d prefer to route through your own account, paste an Anthropic key (sk-ant-…) or an SF LLM Gateway key (sk-…) in Advanced.';
      // Default backend (Worker /llm)
      case 'generation_expired':
      case 'generation_consumed': return 'The saved generation result has expired. No paid replacement was started. You can explicitly start a new generation.';
      case 'generation_cancelled': return 'Generation was cancelled. Your current portal was kept. Provider work already underway may still be charged.';
      case 'generation_interrupted': return 'Generation was interrupted after provider dispatch. Its outcome is unknown; no paid replacement was started.';
      case 'generation_missing':
      case 'generation_job_missing': return 'This generation ticket expired or is unavailable. No paid replacement was started.';
      case 'generation_resume_required': return 'This generation is safely queued. Use Resume generation to continue the saved job.';
      case 'generation_submission_unknown':
        return 'The connection was interrupted while starting generation. The server may still be working; your current portal was kept. Use Resume generation with the same inputs; do not start another paid request.';
      case 'generation_legacy_network':
        return 'This backend does not support background generation, and its request timed out or lost connection. Your current portal was kept. Update the backend or try again.';
      case 'generation_poll_network':
        return 'Generation started, but the connection was interrupted while checking progress. Your current portal was kept. Check your connection before trying again.';
      case 'generation_deadline':
        return 'Generation did not finish within the waiting limit. Your current portal was kept; the saved generation can be resumed without submitting another paid job.';

      case 'generation_origin':
        return 'Generation access is not configured for this generator address. Your current portal was kept. The administrator needs to enable this exact app address.';
      case 'generation_permission':
        return 'Generation permission could not be renewed. Your current portal was kept. Please try again shortly.';
      case 'generation_session':
        return 'Refresh the generator to renew generation access. Complete app sign-in if prompted, then try again. Your current portal was kept.';
      case 'generation_gateway':
        return 'The hosting gateway is temporarily unavailable while checking generation. Your current portal was kept. Please try again shortly.';
      case 'generation_budget':
        return 'The shared generation usage limit for this connection has been reached. Your current portal was kept. Try again after the usage window resets.';
      case 'generation_busy':
        return 'The generator is handling several requests. Your current portal was kept; wait a few seconds and try again.';
      case 'generation_protocol':
        return 'The backend returned an unexpected generation response. Your current portal was kept. Refresh the app and try again.';
      case 'generation_result_too_large':
        return 'The generated result exceeded the server size limit. Your current portal was kept; try fewer images or a smaller scope.';
      case 'generation_provider_timeout':
        return 'The AI provider took too long to respond. Your current portal was kept; try again or shorten the brief.';
      case 'generation_provider_network':
        return 'The server could not reach the AI provider. Your current portal was kept; please try again shortly.';
      case 'generation_provider_auth':
        return 'The AI provider rejected the server credentials. An administrator needs to check the configured provider key. Your current portal was kept.';
      case 'no_default_backend':
        return 'Default backend not reachable. The server may be starting up — try again in a moment, or paste your own API key in Advanced.';
      case 'default_network':
        return `Can't reach the backend at ${err.endpoint}. Check your network, or paste your own key in Advanced.`;
      case 'default_rate_limited':
        return 'Rate limited (too many requests in a short window). Wait a minute and try again, or paste your own key in Advanced to bypass the shared limit.';
      case 'default_not_configured':
        return 'The server’s AI provider is not configured. An administrator needs to configure the provider key. Your current portal was kept.';
      case 'default_unavailable':
        return `The AI provider is temporarily unavailable (status ${err.status}). Your current portal was kept; please try again shortly.`;
      case 'default_failed':
        return `Default backend call failed (status ${err.status}${err.upstream ? ', upstream: ' + err.upstream : ''}). Try again, or paste your own key in Advanced.`;
      case 'default_empty_response':
        return 'Default backend returned no text. Retry — usually transient.';
      case 'invalid_url':
        return 'That URL doesn\'t look right. Try `https://example.com`.';
      // Anthropic direct
      case 'anthropic_bad_key':
        return 'Anthropic rejected the API key. Check that it starts with `sk-ant-` and is still active.';
      case 'anthropic_forbidden':
        return 'Anthropic returned 403 — your key doesn\'t have access to this model.';
      case 'anthropic_rate_limited':
        return 'Anthropic rate limited. Wait a moment and try again.';
      case 'anthropic_overloaded':
        return 'Anthropic servers are overloaded. Try again shortly.';
      case 'anthropic_empty_response':
        return 'Anthropic returned no text. Retry — usually transient.';
      case 'anthropic_failed':
        return `Anthropic call failed (status ${err.status}).`;
      // Salesforce LLM Gateway Express
      case 'sfgateway_network':
        return 'Can\'t reach the Salesforce LLM Gateway. Confirm you\'re on VPN and the gateway URL is correct.';
      case 'sfgateway_bad_key':
        return 'Salesforce LLM Gateway rejected the key (401). Check that it\'s still active.';
      case 'sfgateway_forbidden':
        return 'Salesforce LLM Gateway returned 403 — key doesn\'t have access to that model.';
      case 'sfgateway_model_not_found':
        return `Model "${err.model}" isn\'t available on the gateway. Try a different model name in Advanced.`;
      case 'sfgateway_rate_limited':
        return 'Salesforce LLM Gateway rate limited. Wait a moment and try again.';
      case 'sfgateway_unavailable':
        return `Salesforce LLM Gateway temporarily unavailable (status ${err.status}). Try again shortly.`;
      case 'sfgateway_empty_response':
        return 'Salesforce LLM Gateway returned no text. Retry — usually transient.';
      case 'sfgateway_failed':
        return `Salesforce LLM Gateway call failed (status ${err.status}).`;
      case 'proxy_fetch_failed':
        return `Couldn't fetch the site through ${err.proxy} (status ${err.status}). Trying another proxy…`;
      case 'proxy_empty_response':
        return `${err.proxy} returned an empty response.`;
      case 'proxy_network_error':
        return `Network error via ${err.proxy}: ${err.cause}.`;
      case 'proxy_all_failed':
        return 'All CORS proxies failed. The customer site may block anonymous fetches — try a different URL or use Page Host mode.';
      case 'own_scraper_status':
        return `Your scraper endpoint returned ${err.status}. Check that ${err.endpoint} is reachable and running the latest worker code.`;
      case 'own_scraper_network':
        return `Can't reach your scraper endpoint at ${err.endpoint}. Check the URL in Advanced → Scraper Endpoint.`;
      case 'own_scraper_empty':
        return `Your scraper at ${err.endpoint} returned an empty response.`;
      case 'ai_bad_json':
        return 'AI returned malformed JSON — likely truncated mid-response or wrapped in prose. Open DevTools → Console to see the raw model output. Try Analyze again; if it repeats, try a shorter customer URL or a different tier.';
      case 'empty_ai_response':
        return 'AI returned nothing. Retry.';
      default:
        return err.message || 'Unknown error.';
    }
  }

  window.LocalAI = {
    hasKey,
    getApiKey,
    setApiKey,
    getModel,
    setModel,
    detectProvider,
    currentProvider,
    getScraperEndpoint,
    setScraperEndpoint,
    getDefaultScraperEndpoint,
    hasCustomScraperEndpoint,
    TIER_MODELS_ANTHROPIC,
    TIER_MODELS_SF_GATEWAY,
    // Public alias — historical name, now routes based on key prefix
    callAnthropic,
    callLLM,
    callAnthropicDirect,
    callSFGateway,
    callDefaultBackend,
    runBackendJob,
    getBackendCapabilities,
    getPendingJobs,
    resumeBackendJob,
    cancelBackendJob,
    discardBackendJob,
    backendAccessHeaders,
    scrapeViaCorsProxy,
    optimizeGeneratedImage,
    fillMissingImages,
    analyzeCustomerURL,
    humanErrorMessage
  };
})();
