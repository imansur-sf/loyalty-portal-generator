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

  // Model IDs current as of the assistant knowledge cutoff (Jan 2026).
  // Tier -> model mapping mirrors Page Host's fast/balanced/powerful triad.
  const TIER_MODELS = {
    fast:      'claude-haiku-4-5-20251001',
    balanced:  'claude-sonnet-5',
    powerful:  'claude-opus-4-8'
  };
  const DEFAULT_MODEL = TIER_MODELS.balanced;

  // Corsproxy.io returns the raw body; allorigins.win returns JSON with .contents.
  // Try corsproxy first (simpler), fall back to allorigins.
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

  // ---- SCRAPING VIA CORS PROXY ----
  async function scrapeViaCorsProxy(url) {
    let lastError = null;
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

  // ---- ANTHROPIC API ----
  async function callAnthropic({ prompt, system, tier = 'balanced', model, maxTokens = 4000 }) {
    const key = getApiKey();
    if (!key) throw localError('missing_api_key');

    const chosenModel = model || getModel() || TIER_MODELS[tier] || DEFAULT_MODEL;

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
        messages: [{ role: 'user', content: prompt }]
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
    // Response shape: { content: [{ type: 'text', text: '...' }], model, usage, ... }
    const text = Array.isArray(data.content)
      ? data.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : '';
    if (!text) throw localError('anthropic_empty_response');

    return { text, model_used: data.model, usage: data.usage };
  }

  // ---- MAIN ORCHESTRATION ----
  async function analyzeCustomerURL(rawUrl, opts = {}) {
    const url = shared.normalizeURL(rawUrl);
    if (!url) throw localError('invalid_url');
    if (!hasKey()) throw localError('missing_api_key');

    const onStatus = opts.onStatus || (() => {});

    onStatus('fetching');
    const html = await scrapeViaCorsProxy(url);
    const scraped = shared.extractCoreHTML(html, url);

    onStatus('analyzing');
    const { text, model_used } = await callAnthropic({
      prompt: shared.buildUserPrompt(scraped),
      system: shared.SYSTEM_PROMPT,
      tier: opts.tier || 'balanced',
      maxTokens: 4000
    });

    const parsed = shared.parseAIResponseText(text);
    parsed._meta = {
      source_url: url,
      favicon: scraped.favicon,
      og_image: scraped.ogImage,
      model_used,
      tier: opts.tier || 'balanced',
      mode: 'local'
    };
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
        return 'Paste your Anthropic API key below to enable AI analysis. Your key stays in this browser.';
      case 'invalid_url':
        return 'That URL doesn\'t look right. Try `https://example.com`.';
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
      case 'proxy_fetch_failed':
        return `Couldn't fetch the site through ${err.proxy} (status ${err.status}). Trying another proxy…`;
      case 'proxy_empty_response':
        return `${err.proxy} returned an empty response.`;
      case 'proxy_network_error':
        return `Network error via ${err.proxy}: ${err.cause}.`;
      case 'proxy_all_failed':
        return 'All CORS proxies failed. The customer site may block anonymous fetches — try a different URL or use Page Host mode.';
      case 'ai_bad_json':
        return 'AI returned malformed JSON. Try again — usually transient.';
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
    TIER_MODELS,
    scrapeViaCorsProxy,
    callAnthropic,
    analyzeCustomerURL,
    humanErrorMessage
  };
})();
