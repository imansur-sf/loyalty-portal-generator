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
  function detectProvider(key) {
    if (!key) return null;
    // Anthropic direct keys are `sk-ant-...`
    if (/^sk-ant-/i.test(key)) return 'anthropic';
    // Anything else with sk- prefix (or otherwise) → SF Gateway
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
    try { return (localStorage.getItem(SCRAPER_URL_STORAGE) || '').trim(); }
    catch (_) { return ''; }
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

    // 1) Try the user's own scraper endpoint first if configured
    const own = getScraperEndpoint();
    if (own) {
      try {
        const res = await fetch(`${own}/scrape?url=${encodeURIComponent(url)}`, { method: 'GET' });
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          const html = await res.text();
          if (html && html.length >= 40) {
            // Worker returns text/html or json errors — a json response starting
            // with { and no `<` means it's likely a structured error, not HTML.
            const looksJson = /application\/json/i.test(ct) || (html.trim().startsWith('{') && !html.trim().startsWith('{"contents"'));
            if (!looksJson) return html;
          }
          lastError = localError('own_scraper_empty', { endpoint: own });
        } else {
          const body = await res.text().catch(() => '');
          lastError = localError('own_scraper_status', { status: res.status, endpoint: own, body: body.slice(0, 160) });
        }
      } catch (err) {
        lastError = localError('own_scraper_network', { endpoint: own, cause: err.message });
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
  // Picks Anthropic-direct or SF Gateway based on key prefix. Same signature
  // and same return shape either way so callers don't need to care.
  async function callLLM({ prompt, system, tier = 'balanced', model, maxTokens = 4000 }) {
    const provider = currentProvider();
    if (!provider) throw localError('missing_api_key');
    if (provider === 'anthropic') {
      return callAnthropicDirect({ prompt, system, tier, model, maxTokens });
    }
    return callSFGateway({ prompt, system, tier, model, maxTokens });
  }

  // ---- ANTHROPIC DIRECT ----
  // If content is a string → plain text prompt.
  // If content is an array → user provided structured content (e.g. a document URL block).
  async function callAnthropicDirect({ prompt, system, tier = 'balanced', model, maxTokens = 4000, userContent }) {
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
  async function callSFGateway({ prompt, system, tier = 'balanced', model, maxTokens = 4000 }) {
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
    if (!hasKey()) throw localError('missing_api_key');

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
      maxTokens: 4000
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
      maxTokens: 4000
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
        return 'Paste an Anthropic key (sk-ant-…) or a Salesforce LLM Gateway key (sk-…) below to enable AI analysis. Your key stays in this browser.';
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
        return 'All CORS proxies failed. The customer site may block anonymous fetches — try a different URL, deploy the Cloudflare Worker (see worker/README.md) and paste its URL in Advanced → Scraper Endpoint, or use Page Host mode.';
      case 'own_scraper_status':
        return `Your scraper endpoint returned ${err.status}. Check that ${err.endpoint} is reachable and running the latest worker code.`;
      case 'own_scraper_network':
        return `Can't reach your scraper endpoint at ${err.endpoint}. Check the URL in Advanced → Scraper Endpoint.`;
      case 'own_scraper_empty':
        return `Your scraper at ${err.endpoint} returned an empty response.`;
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
    detectProvider,
    currentProvider,
    getScraperEndpoint,
    setScraperEndpoint,
    TIER_MODELS_ANTHROPIC,
    TIER_MODELS_SF_GATEWAY,
    // Public alias — historical name, now routes based on key prefix
    callAnthropic,
    callLLM,
    callAnthropicDirect,
    callSFGateway,
    scrapeViaCorsProxy,
    analyzeCustomerURL,
    humanErrorMessage
  };
})();
