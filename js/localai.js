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

  async function scrapeViaCorsProxy(url) {
    let lastError = null;

    // 1) Try the primary scraper endpoint (same-origin /api/scrape or user-configured)
    const own = getScraperEndpoint();
    const scrapeBase = own || '';  // empty = same origin
    {
      try {
        const res = await fetch(`${scrapeBase}/api/scrape?url=${encodeURIComponent(url)}`, { method: 'GET' });
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          const html = await res.text();
          if (html && html.length >= 40) {
            // Worker returns text/html or json errors — a json response starting
            // with { and no `<` means it's likely a structured error, not HTML.
            const looksJson = /application\/json/i.test(ct) || (html.trim().startsWith('{') && !html.trim().startsWith('{"contents"'));
            if (!looksJson) return html;
          }
          lastError = localError('own_scraper_empty', { endpoint: scrapeBase || window.location.origin });
        } else {
          const body = await res.text().catch(() => '');
          lastError = localError('own_scraper_status', { status: res.status, endpoint: scrapeBase || window.location.origin, body: body.slice(0, 160) });
        }
      } catch (err) {
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
        return html;
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
  async function callLLM({ prompt, system, tier = 'balanced', model, maxTokens = 8000 }) {
    const provider = currentProvider();
    if (provider === 'anthropic') {
      return callAnthropicDirect({ prompt, system, tier, model, maxTokens });
    }
    if (provider === 'sfgateway') {
      return callSFGateway({ prompt, system, tier, model, maxTokens });
    }
    return callDefaultBackend({ prompt, system, tier, model, maxTokens });
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

  async function transportJSON(response) {
    if ([401, 403].includes(response.status)) throw localError('generation_session');
    const type = response.headers?.get('content-type') || '';
    if (/text\/html/i.test(type)) throw localError(response.status >= 500 ? 'generation_gateway' : 'generation_session', { status: response.status });
    try { return await response.json(); }
    catch (_) { throw localError(response.status >= 500 ? 'generation_gateway' : 'generation_protocol', { status: response.status }); }
  }

  // Short submit/poll requests prevent Heroku's router from terminating long AI
  // calls. Job credentials stay in this closure and never enter saved projects.
  async function runBackendJob(kind, body, base = getScraperEndpoint()) {
    const paths = { llm: '/api/llm', images: '/api/generate-images', image: '/api/generate-image' };
    if (!paths[kind]) throw localError('generation_protocol');
    const deadline = Date.now() + JOB_DEADLINE_MS;
    let submitted;
    try {
      submitted = await timedFetch(`${base}/api/jobs`, { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, kind }) });
    } catch (_) {
      // The server may already have accepted the paid job. Never resubmit it or
      // fall back to another POST when the submission outcome is uncertain.
      throw localError('generation_submission_unknown');
    }
    if (submitted.status === 404) {
      // Older custom backends explicitly lack this endpoint. This is the only
      // permitted synchronous fallback, not a recovery for a failed AI call.
      try {
        const legacy = await timedFetch(`${base}${paths[kind]}`, { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const payload = await transportJSON(legacy);
        if (!legacy.ok) throw backendFailure(legacy.status, payload);
        return payload;
      } catch (error) {
        if (error.code) throw error;
        throw localError('generation_legacy_network');
      }
    }
    const ticket = await transportJSON(submitted);
    if (submitted.status !== 202) {
      if (!submitted.ok) throw backendFailure(submitted.status, ticket, true);
      throw localError('generation_protocol');
    }
    if (!ticket || !/^[a-zA-Z0-9_-]{8,128}$/.test(ticket.id || '') || !/^[a-zA-Z0-9_-]{8,256}$/.test(ticket.token || '')) throw localError('generation_protocol');
    const url = `${base}/api/jobs/${encodeURIComponent(ticket.id)}`;
    const headers = { Authorization: `Bearer ${ticket.token}` };
    let transientFailures = 0;
    while (Date.now() < deadline) {
      await new Promise(resolve => window.setTimeout(resolve, Math.min(JOB_POLL_MS, Math.max(0, deadline - Date.now()))));
      if (Date.now() >= deadline) break;
      let response;
      try {
        response = await timedFetch(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers }, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()));
      } catch (_) {
        if (Date.now() >= deadline) break;
        if (++transientFailures < 3 && Date.now() < deadline) continue;
        throw localError('generation_poll_network');
      }
      if (response.status === 404) throw localError('generation_job_missing');
      if ([502, 503, 504].includes(response.status)) {
        if (++transientFailures < 3 && Date.now() < deadline) continue;
        throw localError('generation_gateway', { status: response.status });
      }
      const job = await transportJSON(response);
      if (!response.ok) throw backendFailure(response.status, job, true);
      transientFailures = 0;
      if (job?.status === 'pending') continue;
      if (job?.status !== 'complete' || !Number.isInteger(job.result?.status) || job.result.status < 200 || job.result.status > 599 || !job.result.body || typeof job.result.body !== 'object') throw localError('generation_protocol');
      // Free large image responses promptly. Cleanup failure must never turn a
      // successfully retrieved result into a failed generation.
      try { await timedFetch(url, { method: 'DELETE', credentials: 'same-origin', headers }, 3000); } catch (_) { /* expires server-side */ }
      if (job.result.status >= 400) throw backendFailure(job.result.status, job.result.body);
      return job.result.body;
    }
    throw localError('generation_deadline');
  }

  async function callDefaultBackend({ prompt, system, tier = 'balanced', model, maxTokens = 8000 }) {
    const base = getScraperEndpoint(); // empty = same origin; both /api/scrape and /api/llm live here
    const data = await runBackendJob('llm', { prompt, system, tier, model, maxTokens }, base);
    if (!data || !data.text) throw localError('default_empty_response');
    return { text: data.text, model_used: data.model_used, usage: data.usage };
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

    return { text, model_used: data.model, usage: data.usage };
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

    return { text, model_used: data.model || chosenModel, usage: data.usage };
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

  async function fillMissingImages(parsed, { onStatus } = {}) {
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
            priority: cfg.priority + i,
            apply: (dataUri) => { item[cfg.dataField] = dataUri; }
          });
        }
      });
    }

    if (slots.length === 0) {
      console.log('[LocalAI] All image slots filled from scrape — no generation needed');
      return { generated: 0, total_empty: 0 };
    }

    // Round-robin priority prevents a large rewards list from starving offers,
    // clubs, badges and benefits. Keep each asynchronous result batch small.
    slots.sort((a, b) => a.priority - b.priority);
    const selected = slots.slice(0, MAX_IMAGE_GEN);
    const skipped = slots.length - selected.length;

    console.log(`[LocalAI] Generating ${selected.length} images (${skipped} additional slots beyond this run's limit)`);
    if (onStatus) onStatus('generating_images');
    let generated = 0, attempted = 0;
    const errors = [];
    for (let offset = 0; offset < selected.length; offset += IMAGE_BATCH_SIZE) {
      const batch = selected.slice(offset, offset + IMAGE_BATCH_SIZE);
      attempted += batch.length;
      try {
        const data = await runBackendJob('images', { prompts: batch.map(s => ({ slot: s.slot, prompt: s.prompt })) }, base);
        const completed = new Set();
        if (Array.isArray(data.results)) {
          for (const result of data.results) {
            if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(result.imageData || '') && !result.error) {
              const match = batch.find(s => s.slot === result.slot);
              if (match && !completed.has(match.slot)) {
                const optimized = await optimizeGeneratedImage(result.imageData, { hero: match.slot === 'upsell-bg' });
                if (optimized.imageData) { match.apply(optimized.imageData); completed.add(match.slot); generated++; }
                else if (optimized.warning) errors.push(optimized.warning);
              }
            }
          }
        }
        if (completed.size < batch.length) errors.push(`${batch.length - completed.size} images failed in a batch`);
      } catch (err) {
        errors.push(humanErrorMessage(err));
        break;
      }
    }
    const remaining = slots.length - generated;
    const warning = remaining ? `${generated} of ${slots.length} missing images generated; ${remaining} remain empty.${skipped ? ` ${skipped} exceed the ${MAX_IMAGE_GEN}-image limit for one run.` : ''}${errors.length ? ' ' + [...new Set(errors)].join('; ') + '.' : ''}` : '';
    console.log(`[LocalAI] Generated ${generated}/${slots.length} images successfully`);
    return { generated, total_empty: slots.length, attempted, remaining, skipped, failed: attempted - generated,
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
      case 'generation_submission_unknown':
        return 'The connection was interrupted while starting generation. The server may still be working; your current portal was kept. Wait briefly before trying again.';
      case 'generation_legacy_network':
        return 'This backend does not support background generation, and its request timed out or lost connection. Your current portal was kept. Update the backend or try again.';
      case 'generation_poll_network':
        return 'Generation started, but the connection was interrupted while checking progress. Your current portal was kept. Check your connection before trying again.';
      case 'generation_deadline':
        return 'Generation did not finish within the waiting limit. Your current portal was kept; try again with a shorter brief.';
      case 'generation_job_missing':
        return 'This generation result expired or the server restarted. Your current portal was kept. Please generate again.';
      case 'generation_session':
        return 'The app access session needs attention. Sign in to the app again, then retry generation. Your current portal was kept.';
      case 'generation_gateway':
        return 'The hosting gateway is temporarily unavailable while checking generation. Your current portal was kept. Please try again shortly.';
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
    scrapeViaCorsProxy,
    optimizeGeneratedImage,
    fillMissingImages,
    analyzeCustomerURL,
    humanErrorMessage
  };
})();
