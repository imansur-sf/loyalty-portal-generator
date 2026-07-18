// ============================================================
// pagehost.js — Page Host API client + AI-driven URL analysis
// ------------------------------------------------------------
// Page Host injects window.__PROXY_TOKEN__ into every rendered tile.
// The uploadId isn't documented as a global, so we recover it from
// the URL path (Page Host serves tiles under paths that contain the
// upload id) with localStorage as a manual-override fallback.
// ============================================================

(function () {
  const DEFAULT_API_BASE = 'https://single-html-page-app-host-07cda8a7041b.herokuapp.com';

  // ---- CONTEXT DETECTION ----
  function getContext() {
    const proxyToken =
      window.__PROXY_TOKEN__ ||
      window.__PAGE_HOST__ && window.__PAGE_HOST__.proxyToken;

    // Try globals first, then URL, then localStorage override
    let uploadId =
      window.__UPLOAD_ID__ ||
      (window.__PAGE_HOST__ && window.__PAGE_HOST__.uploadId) ||
      null;

    if (!uploadId) {
      const pathMatch = window.location.pathname.match(
        /\/uploads?\/([a-zA-Z0-9_-]{6,})/i
      );
      if (pathMatch) uploadId = pathMatch[1];
    }

    if (!uploadId) {
      uploadId = localStorage.getItem('pagehost_upload_id') || null;
    }

    const apiBase =
      window.__PAGE_HOST_API__ ||
      localStorage.getItem('pagehost_api_base') ||
      DEFAULT_API_BASE;

    return { proxyToken, uploadId, apiBase };
  }

  function isAvailable() {
    const ctx = getContext();
    return Boolean(ctx.proxyToken && ctx.uploadId);
  }

  function setManualUploadId(id) {
    if (id) localStorage.setItem('pagehost_upload_id', id);
    else localStorage.removeItem('pagehost_upload_id');
  }

  // ---- HTTP HELPERS ----
  async function proxyFetch(targetUrl) {
    const ctx = getContext();
    if (!ctx.proxyToken) throw pageHostError('missing_proxy_token');
    if (!ctx.uploadId) throw pageHostError('missing_upload_id');

    const url = `${ctx.apiBase}/api/proxy/fetch/${ctx.uploadId}/${encodeURIComponent(targetUrl)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-Proxy-Token': ctx.proxyToken }
    });
    if (res.status === 401) throw pageHostError('proxy_token_expired');
    if (res.status === 403) throw pageHostError('domain_not_allowlisted', { targetUrl });
    if (res.status === 429) throw pageHostError('rate_limited');
    if (res.status === 504) throw pageHostError('proxy_timeout');
    if (!res.ok) throw pageHostError('proxy_fetch_failed', { status: res.status });
    return await res.text();
  }

  async function callLLM({ prompt, system, tier = 'balanced', brand = 'anthropic', maxTokens = 4000 }) {
    const ctx = getContext();
    if (!ctx.proxyToken) throw pageHostError('missing_proxy_token');
    if (!ctx.uploadId) throw pageHostError('missing_upload_id');

    const url = `${ctx.apiBase}/api/proxy/llm/${ctx.uploadId}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Proxy-Token': ctx.proxyToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, system, tier, brand, maxTokens })
    });
    if (res.status === 401) throw pageHostError('proxy_token_expired');
    if (res.status === 404) throw pageHostError('no_einstein_connection');
    if (res.status === 429) throw pageHostError('rate_limited');
    if (res.status === 503) throw pageHostError('all_ai_providers_failed');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw pageHostError('llm_failed', { status: res.status, body });
    }
    return await res.json();
  }

  function pageHostError(code, extra) {
    const err = new Error(code);
    err.code = code;
    Object.assign(err, extra || {});
    return err;
  }

  // ---- HTML TRIMMING ----
  // Cap the HTML we send to the LLM to keep prompt size sane and to
  // strip payload the model doesn't need (scripts, styles, tracking).
  function extractCoreHTML(html, url) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    doc.querySelectorAll('script, style, noscript, svg, iframe, template').forEach(n => n.remove());

    const title = doc.querySelector('title')?.textContent?.trim() || '';
    const description =
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      '';
    const siteName =
      doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
    const ogImage =
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

    const faviconEl =
      doc.querySelector('link[rel~="icon"]') ||
      doc.querySelector('link[rel="apple-touch-icon"]');
    let favicon = faviconEl?.getAttribute('href') || '';
    if (favicon && !favicon.startsWith('http')) {
      try {
        favicon = new URL(favicon, url).toString();
      } catch (_) { /* leave as-is */ }
    }

    // Extract visible-ish text — headings first, then body content, capped
    const bodyText = (doc.body?.innerText || doc.body?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000);

    const headings = Array.from(doc.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent.trim())
      .filter(Boolean)
      .slice(0, 30)
      .join('\n');

    const navLinkCandidates = Array.from(doc.querySelectorAll('nav a, header a'))
      .map(a => a.textContent.trim())
      .filter(t => t && t.length < 30)
      .slice(0, 15);

    return {
      url,
      title,
      siteName,
      description,
      ogImage,
      favicon,
      headings,
      navLinkCandidates,
      bodyText
    };
  }

  // ---- PROMPT BUILDING ----
  const SYSTEM_PROMPT = `You are a brand analyst helping a Salesforce Solution Engineer build a demo loyalty portal for a specific customer.

You will receive scraped content from a customer's website. Extract brand identity and generate realistic, on-brand loyalty program content.

Return ONLY a single JSON object matching the schema below. No preamble, no markdown fences, no trailing prose — just the JSON.

Schema:
{
  "brandName": string,
  "industry": "carwash" | "restaurant" | "retail" | "fitness" | "healthcare" | "generic",
  "programName": string,
  "colors": {
    "primary": "#RRGGBB",   // dominant/darker brand color, used for headers + text
    "accent":  "#RRGGBB",   // secondary color for highlights/CTAs
    "secondary": "#RRGGBB", // near-white background wash
    "dark": "#RRGGBB"       // near-black body text color
  },
  "tiers": [
    { "name": string, "points": 0 },
    { "name": string, "points": number },
    { "name": string, "points": number }
  ],
  "vouchers": [
    { "title": string, "vendor": string, "expiry": string, "actionType": "points"|"code"|"qr", "actionValue": string, "emoji": string }
  ],   // 4 items
  "offers": [
    { "title": string, "description": string, "cta": string, "playerCount": string, "expiry": string, "emoji": string }
  ],   // 2 items
  "badges": [ { "name": string, "emoji": string, "color": "amber"|"emerald"|"blue"|"purple"|"rose"|"teal"|"orange"|"indigo"|"red"|"green" } ],  // 3 items
  "clubs":  [ { "name": string, "description": string, "memberCount": number, "emoji": string } ],  // 2 items
  "benefits": [ { "name": string, "emoji": string } ],  // 5-7 items
  "earnMore": [ { "title": string, "description": string, "hasCodeInput": boolean } ],  // 4 items, last should have hasCodeInput: true
  "profileTasks": [ { "description": string, "cta": string } ],  // 3 items
  "upsell": { "title": string, "subtitle": string, "price": "$XX", "period": string, "tagline": string, "cta": string },
  "navLinks": [ string ],  // 5-6 items, real nav sections from the site if visible, else appropriate defaults
  "footerLinks": {
    "col1": { "title": string, "links": [string] },
    "col2": { "title": string, "links": [string] },
    "col3": { "title": string, "links": [string] }
  },
  "member": {
    "name": string,      // realistic customer of this brand
    "joinDate": string   // e.g. "21st Nov, 2019"
  }
}

Guidelines:
- Copy should sound like it belongs on THIS brand's site — use their voice, service names, and vertical language.
- Vouchers/offers/badges/clubs should reference real services/products the brand appears to offer.
- Colors must actually reflect the brand's palette — sample from any color signals in the HTML (logos, hero backgrounds, CTA colors).
- Pick industry from the 6 options based on what fits best. If unsure, use "generic".
- programName default pattern: "<Brand> Perks" or "<Brand> Rewards" — whatever fits.
- Keep every string tight — voucher titles under 40 chars, benefit names under 30 chars, badge names 1–3 words.
- Emoji use: single emoji per item, tasteful, category-appropriate.`;

  function buildUserPrompt(scraped) {
    const nav = scraped.navLinkCandidates.length
      ? `\nVisible nav links: ${scraped.navLinkCandidates.join(' · ')}`
      : '';
    return `Customer URL: ${scraped.url}
Page title: ${scraped.title}
Site name (og): ${scraped.siteName || '—'}
Description: ${scraped.description || '—'}
Favicon: ${scraped.favicon || '—'}
OG image: ${scraped.ogImage || '—'}
${nav}

Top headings on the page:
${scraped.headings || '—'}

Body text excerpt:
${scraped.bodyText}

Now return the JSON per the schema. Return ONLY the JSON.`;
  }

  // ---- JSON PARSER (tolerant of stray whitespace / fences) ----
  function parseAIResponseText(text) {
    if (!text) throw pageHostError('empty_ai_response');
    let t = text.trim();
    // Strip ```json fences if the model added them despite instructions
    if (t.startsWith('```')) {
      t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/,'').trim();
    }
    // If the model added leading prose, grab from first { to matching } via best-effort
    const firstBrace = t.indexOf('{');
    const lastBrace = t.lastIndexOf('}');
    if (firstBrace > 0 || lastBrace < t.length - 1) {
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        t = t.slice(firstBrace, lastBrace + 1);
      }
    }
    try {
      return JSON.parse(t);
    } catch (e) {
      const err = pageHostError('ai_bad_json');
      err.raw = text.slice(0, 500);
      throw err;
    }
  }

  // ---- MAIN ORCHESTRATION ----
  async function analyzeCustomerURL(rawUrl, opts = {}) {
    const url = normalizeURL(rawUrl);
    if (!url) throw pageHostError('invalid_url');

    const onStatus = opts.onStatus || (() => {});
    onStatus('fetching');

    const html = await proxyFetch(url);
    const scraped = extractCoreHTML(html, url);

    onStatus('analyzing');
    const llmResp = await callLLM({
      prompt: buildUserPrompt(scraped),
      system: SYSTEM_PROMPT,
      tier: opts.tier || 'balanced',
      brand: opts.brand || 'anthropic',
      maxTokens: 4000
    });

    // Response shape from spec: "AI output plus model_used and tier"
    // Model output text is likely under one of: text, output, message, content, completion
    const rawText =
      llmResp.text ||
      llmResp.output ||
      llmResp.message ||
      llmResp.content ||
      llmResp.completion ||
      (typeof llmResp === 'string' ? llmResp : JSON.stringify(llmResp));

    const parsed = parseAIResponseText(rawText);

    // Attach useful metadata for the caller
    parsed._meta = {
      source_url: url,
      favicon: scraped.favicon,
      og_image: scraped.ogImage,
      model_used: llmResp.model_used,
      tier: llmResp.tier || opts.tier || 'balanced'
    };

    return parsed;
  }

  function normalizeURL(input) {
    if (!input) return null;
    let s = String(input).trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try {
      const u = new URL(s);
      return u.toString();
    } catch (_) {
      return null;
    }
  }

  function humanErrorMessage(err) {
    if (!err) return 'Unknown error.';
    const code = err.code || err.message;
    switch (code) {
      case 'missing_proxy_token':
        return 'This feature only works when this tile is running on Page Host.';
      case 'missing_upload_id':
        return 'Upload ID not detected. Set it via Page Host Settings below.';
      case 'proxy_token_expired':
        return 'Your Page Host session has expired. Reload the tile.';
      case 'domain_not_allowlisted':
        return `Domain isn't allowlisted for this tile. Add a Page Host proxy connection for ${new URL(err.targetUrl).hostname}, then try again.`;
      case 'rate_limited':
        return 'Rate limited by Page Host (10 req/min). Wait a moment and try again.';
      case 'proxy_timeout':
        return 'The customer site took too long to respond (>15s).';
      case 'proxy_fetch_failed':
        return `Couldn't fetch the site (status ${err.status}).`;
      case 'no_einstein_connection':
        return 'This tile has no "einstein" AI connection configured on Page Host.';
      case 'all_ai_providers_failed':
        return 'All AI providers failed. Try again shortly.';
      case 'ai_bad_json':
        return 'AI returned malformed JSON. Try again — usually transient.';
      case 'invalid_url':
        return 'That URL doesn\'t look right. Try `https://example.com`.';
      case 'llm_failed':
        return `AI call failed (status ${err.status}).`;
      default:
        return err.message || 'Unknown error.';
    }
  }

  window.PageHost = {
    getContext,
    isAvailable,
    setManualUploadId,
    proxyFetch,
    callLLM,
    analyzeCustomerURL,
    humanErrorMessage
  };
})();
