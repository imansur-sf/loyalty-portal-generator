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

    doc.querySelectorAll('script, style, noscript, iframe, template').forEach(n => n.remove());

    const title = doc.querySelector('title')?.textContent?.trim() || '';
    const description =
      doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
      '';
    const siteName =
      doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
    const ogImage = absolutize(
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '' ,
      url
    );
    const twitterImage = absolutize(
      doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '',
      url
    );

    const appleIcon = absolutize(
      doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') || '',
      url
    );
    const favicon = absolutize(
      (doc.querySelector('link[rel~="icon"]') || {}).getAttribute?.('href') || '',
      url
    );

    // Extract visible-ish text — headings first, then body content, capped
    const bodyText = (doc.body?.innerText || doc.body?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);

    const headings = Array.from(doc.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent.trim())
      .filter(Boolean)
      .slice(0, 30)
      .join('\n');

    const navLinkCandidates = Array.from(doc.querySelectorAll('nav a, header a'))
      .map(a => a.textContent.trim())
      .filter(t => t && t.length < 30)
      .slice(0, 15);

    // ---- IMAGE HARVEST ----
    // Pull every <img> tag + inline-style background-images, normalize to
    // absolute URLs, filter to plausible content images, dedupe, cap.
    const rawCandidates = [];

    // <img> tags — include src, srcset (first URL), data-src, data-lazy-src
    doc.querySelectorAll('img').forEach(img => {
      const srcAttrs = ['src', 'data-src', 'data-lazy-src', 'data-original'];
      for (const attr of srcAttrs) {
        const v = img.getAttribute(attr);
        if (v) {
          rawCandidates.push({
            src: v,
            alt: img.getAttribute('alt') || '',
            width: parseInt(img.getAttribute('width'), 10) || null,
            height: parseInt(img.getAttribute('height'), 10) || null,
            className: img.getAttribute('class') || '',
            near: nearestTextContext(img)
          });
          break;
        }
      }
      // srcset — pick the highest-res URL
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const parts = srcset.split(',').map(s => s.trim().split(/\s+/));
        const best = parts.reduce((a, b) => {
          const aw = parseInt((a[1] || '0').replace(/\D/g, ''), 10) || 0;
          const bw = parseInt((b[1] || '0').replace(/\D/g, ''), 10) || 0;
          return bw > aw ? b : a;
        }, parts[0] || []);
        if (best && best[0]) {
          rawCandidates.push({
            src: best[0],
            alt: img.getAttribute('alt') || '',
            width: null, height: null,
            className: img.getAttribute('class') || '',
            near: nearestTextContext(img)
          });
        }
      }
    });

    // Inline style background-image
    doc.querySelectorAll('[style*="background"]').forEach(el => {
      const style = el.getAttribute('style') || '';
      const m = style.match(/background(?:-image)?:\s*[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
      if (m && m[1]) {
        rawCandidates.push({
          src: m[1],
          alt: el.getAttribute('aria-label') || '',
          width: null, height: null,
          className: el.getAttribute('class') || '',
          near: (el.textContent || '').trim().slice(0, 120)
        });
      }
    });

    // Prepend og:image and twitter:image as high-priority candidates
    if (ogImage) rawCandidates.unshift({ src: ogImage, alt: 'og:image', width: null, height: null, className: 'og-image', near: description });
    if (twitterImage && twitterImage !== ogImage) rawCandidates.unshift({ src: twitterImage, alt: 'twitter:image', width: null, height: null, className: 'twitter-image', near: description });

    // Normalize + filter + classify
    const seen = new Set();
    const images = [];
    for (const c of rawCandidates) {
      const abs = absolutize(c.src, url);
      if (!abs) continue;
      if (seen.has(abs)) continue;
      if (!isLikelyContentImage(abs, c)) continue;
      seen.add(abs);
      images.push({
        url: abs,
        alt: (c.alt || '').trim().slice(0, 120),
        role: classifyImageRole(abs, c),
        width: c.width,
        height: c.height,
        near: (c.near || '').slice(0, 120)
      });
      if (images.length >= 25) break;
    }

    return {
      url,
      title,
      siteName,
      description,
      ogImage,
      twitterImage,
      appleIcon,
      favicon,
      headings,
      navLinkCandidates,
      bodyText,
      images
    };
  }

  function absolutize(maybeRel, base) {
    if (!maybeRel) return '';
    if (/^data:/i.test(maybeRel)) return maybeRel;
    if (/^https?:\/\//i.test(maybeRel)) return maybeRel;
    if (/^\/\//.test(maybeRel)) return 'https:' + maybeRel;
    try { return new URL(maybeRel, base).toString(); } catch (_) { return ''; }
  }

  function isLikelyContentImage(abs, c) {
    const lower = abs.toLowerCase();
    // Filter obvious junk
    if (/\.(svg|gif)($|\?)/i.test(lower) && !/logo/i.test(c.className || '') && !/logo/i.test(c.alt || '')) {
      // Allow SVG only if it looks logo-ish; skip decorative SVGs
      if (/pixel|spacer|1x1|tracking|beacon|adsystem|analytics/i.test(lower)) return false;
    }
    if (/pixel|spacer|1x1|tracking|beacon|adsystem|analytics|doubleclick|googletag/i.test(lower)) return false;
    // If we know width, skip tiny images (< 40px = icon/pixel/spacer)
    if ((c.width && c.width < 40) || (c.height && c.height < 40)) return false;
    // Skip base64 unless it's clearly a real image
    if (/^data:image\//.test(abs) && abs.length < 200) return false;
    // Must have a plausible image extension OR be a data: URL OR served from a common CDN pattern
    const hasExt = /\.(jpe?g|png|webp|avif|svg|gif)($|\?)/i.test(abs);
    const looksLikeImage = hasExt || /^data:image\//.test(abs) || /\/(images?|img|assets|media|photos?|uploads?|cdn)\//i.test(abs);
    return looksLikeImage;
  }

  function classifyImageRole(abs, c) {
    const hay = (c.className + ' ' + c.alt + ' ' + abs).toLowerCase();
    if (/logo|brand-mark/.test(hay)) return 'logo';
    if (/hero|banner|jumbotron|masthead/.test(hay)) return 'hero';
    if (/og-image|twitter-image/.test(hay)) return 'social';
    if (/product|item|card|feature|service/.test(hay)) return 'product';
    if (/team|staff|avatar|headshot|founder/.test(hay)) return 'person';
    return 'content';
  }

  function nearestTextContext(el) {
    // Walk up a few parents collecting readable text near the image
    let cur = el;
    for (let i = 0; i < 3 && cur; i++) {
      const t = (cur.textContent || '').trim();
      if (t && t.length > 4 && t.length < 200) return t;
      cur = cur.parentElement;
    }
    return '';
  }

  // ---- PROMPT BUILDING ----
  const SYSTEM_PROMPT = `You are a brand analyst helping a Salesforce Solution Engineer build a demo loyalty portal for a specific customer.

You will receive scraped content from a customer's website — including a list of image URLs found on the page. Extract brand identity and generate realistic, on-brand loyalty program content, and assign the most appropriate image to each content slot.

CRITICAL OUTPUT FORMAT: Your entire response must be exactly one valid JSON object matching the schema below. Your first character must be an opening curly brace and your last character must be a closing curly brace. No preamble, no explanation, no markdown code fences, no trailing prose, no comments — nothing but the JSON. If you need to convey uncertainty, do it inside a JSON string field, never outside the JSON.

Schema:
{
  "brandName": string,
  "industry": "carwash" | "restaurant" | "retail" | "fitness" | "healthcare" | "generic",
  "programName": string,
  "colors": {
    "primary": "#RRGGBB",
    "accent":  "#RRGGBB",
    "secondary": "#RRGGBB",
    "dark": "#RRGGBB"
  },
  "brand": {
    "logoUrl": string   // ONE image URL from the candidate list that is the brand's logo. Empty string if none suits.
  },
  "tiers": [
    { "name": string, "points": 0 },
    { "name": string, "points": number },
    { "name": string, "points": number }
  ],
  "vouchers": [
    { "title": string, "vendor": string, "expiry": string, "actionType": "points"|"code"|"qr", "actionValue": string, "emoji": string, "imageUrl": string }
  ],   // 4 items — imageUrl from the candidate list, or empty string
  "offers": [
    { "title": string, "description": string, "cta": string, "playerCount": string, "expiry": string, "emoji": string, "imageUrl": string }
  ],   // 2 items — imageUrl from the candidate list, or empty string
  "badges": [ { "name": string, "emoji": string, "color": "amber"|"emerald"|"blue"|"purple"|"rose"|"teal"|"orange"|"indigo"|"red"|"green", "imageUrl": string } ],  // 3 items
  "clubs":  [ { "name": string, "description": string, "memberCount": number, "emoji": string, "imageUrl": string } ],  // 2 items
  "benefits": [ { "name": string, "emoji": string, "imageUrl": string } ],  // 5-7 items
  "earnMore": [ { "title": string, "description": string, "hasCodeInput": boolean } ],  // 4 items, last should have hasCodeInput: true
  "profileTasks": [ { "description": string, "cta": string } ],  // 3 items
  "upsell": { "title": string, "subtitle": string, "price": "$XX", "period": string, "tagline": string, "cta": string, "bgImageUrl": string },
  "navLinks": [ string ],
  "footerLinks": {
    "col1": { "title": string, "links": [string] },
    "col2": { "title": string, "links": [string] },
    "col3": { "title": string, "links": [string] }
  },
  "member": {
    "name": string,
    "joinDate": string
  }
}

⚠️ Critical rules for imageUrl fields:
- ONLY use URLs from the "Image candidates" list I provide. Never invent URLs. Never use placeholder services (unsplash, pexels, picsum, via.placeholder). Never use example.com/*.jpg.
- If NO candidate fits an item, use "" (empty string). It's better to leave imageUrl blank than to force a bad match.
- Match images to context by their role/alt/near-text hints. Product/service images → vouchers + offers. Person/team images → badges/clubs. Hero images → upsell bgImageUrl.
- Every candidate URL can be reused. But try to give each voucher/offer/club a distinct image so the demo doesn't look repetitive.
- brand.logoUrl: pick the item flagged role:"logo" if present, otherwise "" (empty).

Guidelines for copy:
- Copy should sound like it belongs on THIS brand's site — use their voice, service names, and vertical language.
- Vouchers/offers/badges/clubs should reference real services/products the brand appears to offer.
- Colors must actually reflect the brand's palette — sample from any color signals in the HTML.
- Pick industry from the 6 options based on what fits best. If unsure, use "generic".
- programName default pattern: "<Brand> Perks" or "<Brand> Rewards".
- Keep every string tight — voucher titles under 40 chars, benefit names under 30 chars, badge names 1–3 words.
- Single emoji per item, tasteful, category-appropriate.`;

  function buildUserPrompt(scraped) {
    // URL-only mode: no scraped content, only the URL.
    if (!scraped || (!scraped.title && !scraped.bodyText && !scraped.headings)) {
      const urlOnly = (scraped && scraped.url) || '';
      return `Customer URL: ${urlOnly}

⚠️ Note: I could not scrape the site's HTML directly (network policy blocks third-party CORS proxies in this environment). Please rely on your training knowledge of this brand to generate the loyalty portal content.

- If you recognize the brand from the URL, use everything you know about it: their industry, real service/product names, brand colors (approximate from memory), audience, tone.
- If you don't recognize it, infer industry from the domain name and TLD (e.g., ".org" often nonprofit/association, ".gov" government, keywords like "wash" → carwash, "clinic" → healthcare). Generate reasonable, on-brand-sounding content.
- Do NOT hedge or say "I don't have access" — just do your best.

Now return the JSON per the schema. Return ONLY the JSON.`;
    }

    const nav = scraped.navLinkCandidates && scraped.navLinkCandidates.length
      ? `\nVisible nav links: ${scraped.navLinkCandidates.join(' · ')}`
      : '';

    // Format the image candidate list — the *only* URLs Claude may use for imageUrl fields.
    let imageBlock = '';
    if (Array.isArray(scraped.images) && scraped.images.length) {
      const rows = scraped.images.map((img, i) =>
        `  ${i + 1}. [${img.role}] ${img.url}${img.alt ? '  — alt: "' + img.alt + '"' : ''}${img.near && img.near !== img.alt ? '  (near: "' + img.near.slice(0, 60) + '")' : ''}`
      ).join('\n');
      imageBlock = `\n\nImage candidates (assign these to imageUrl fields — do NOT invent URLs):\n${rows}`;
    } else {
      imageBlock = '\n\nImage candidates: (none extracted — set every imageUrl to "")';
    }

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
${scraped.bodyText}${imageBlock}

Now return the JSON per the schema. Return ONLY the JSON.`;
  }

  // ---- JSON PARSER (tolerant of stray whitespace / fences / truncation) ----
  function parseAIResponseText(text) {
    if (!text) throw pageHostError('empty_ai_response');

    // 1) Strip common wrappers the model adds despite instructions
    let t = text.trim();
    if (t.startsWith('```')) {
      t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    }

    // 2) Grab from the first { to the last } — cuts leading/trailing prose
    const firstBrace = t.indexOf('{');
    const lastBrace = t.lastIndexOf('}');
    if (firstBrace > 0 || (lastBrace >= 0 && lastBrace < t.length - 1)) {
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        t = t.slice(firstBrace, lastBrace + 1);
      }
    }

    // 3) Straight parse first — the happy path
    try { return JSON.parse(t); } catch (_) { /* fall through */ }

    // 4) Truncation-recovery: if the model hit max_tokens mid-object, the
    //    string ends inside an open string / array / object. Walk forward,
    //    track depth, and truncate to the last well-formed prefix, then
    //    close any still-open braces/brackets.
    const recovered = attemptTruncationRecovery(t);
    if (recovered) {
      try { return JSON.parse(recovered); } catch (_) { /* fall through */ }
    }

    // 5) Give up — surface diagnostics so the caller can log/inspect.
    console.error('[PageHost] JSON parse failed. Raw model output:', text);
    const err = pageHostError('ai_bad_json');
    err.raw = text;                       // full raw (not truncated) for retry logic
    err.rawPreview = text.slice(0, 500);
    err.recoveredAttempt = recovered ? recovered.slice(0, 500) : null;
    throw err;
  }

  // Walk `s` character-by-character honoring string/escape state; find the
  // last "safe" position where every open construct is either closed or can
  // be closed by appending matching brackets. Return the recovered string,
  // or null if nothing sensible can be produced.
  function attemptTruncationRecovery(s) {
    let inString = false;
    let escape = false;
    const stack = []; // '{' or '['
    let lastSafe = -1; // index right after the last balanced value

    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (escape) { escape = false; continue; }
      if (inString) {
        if (c === '\\') { escape = true; continue; }
        if (c === '"') { inString = false; }
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === '{' || c === '[') { stack.push(c); continue; }
      if (c === '}' || c === ']') {
        const want = c === '}' ? '{' : '[';
        if (stack.length && stack[stack.length - 1] === want) {
          stack.pop();
          if (stack.length === 0) lastSafe = i + 1;
        }
      }
    }

    // If we ended inside a string, truncate BEFORE that string opened
    // (find the last unescaped `"` at safe depth). Simpler: walk backward
    // to the last comma or open-brace we saw at the top of the stack.
    if (inString) {
      // Cut everything after the last comma we know was at safe nesting
      const cutIdx = s.lastIndexOf(',', s.length - 1);
      if (cutIdx > 0) {
        s = s.slice(0, cutIdx);
        // Rewalk to update the stack
        return attemptTruncationRecovery(s);
      }
      return null;
    }

    // If nothing is open, we shouldn't be here (straight parse would have worked)
    if (stack.length === 0) return null;

    // Cut off trailing incomplete value: from lastSafe onward there's some
    // half-emitted key/value. Trim to last complete comma before end.
    let truncated = s;
    if (lastSafe > 0) {
      // Keep everything up to lastSafe, then trailing partial content only
      // to the last balanced-depth comma.
      truncated = s.slice(0, lastSafe) + trailingBalance(s.slice(lastSafe), stack);
    } else {
      // Never saw a complete top-level value; try to just close what's open
      truncated = trimToLastComma(s);
    }

    // Append the appropriate closers for whatever's still open
    let closer = '';
    for (let i = stack.length - 1; i >= 0; i--) closer += (stack[i] === '{' ? '}' : ']');
    return truncated.replace(/,\s*$/, '') + closer;
  }

  function trimToLastComma(s) {
    const idx = s.lastIndexOf(',');
    return idx > 0 ? s.slice(0, idx) : s;
  }

  function trailingBalance(tail, stack) {
    // For tail content after lastSafe: keep only up to the last comma so
    // we're always ending at a clean key/value boundary.
    return trimToLastComma(tail);
  }

  // ---- MAIN ORCHESTRATION ----
  async function analyzeCustomerURL(rawUrl, opts = {}) {
    const url = normalizeURL(rawUrl);
    if (!url) throw pageHostError('invalid_url');

    const onStatus = opts.onStatus || (() => {});
    let scraped = null;
    let fallbackReason = null;

    if (opts.skipScraping) {
      fallbackReason = 'skipped';
    } else {
      onStatus('fetching');
      try {
        const html = await proxyFetch(url);
        scraped = extractCoreHTML(html, url);
      } catch (scrapeErr) {
        // Domain not allowlisted, timeout, etc — fall back to URL-only so the
        // demo isn't blocked. Claude uses training knowledge.
        console.warn('[PageHost] scraping failed, falling back to URL-only:', scrapeErr.code || scrapeErr.message);
        fallbackReason = scrapeErr.code || 'scrape_failed';
        onStatus('fallback_url_only');
      }
    }

    if (!scraped) scraped = { url, title: '', bodyText: '', headings: '', favicon: '', ogImage: '', navLinkCandidates: [] };

    onStatus('analyzing');
    const llmResp = await callLLM({
      prompt: buildUserPrompt(scraped),
      system: SYSTEM_PROMPT,
      tier: opts.tier || 'balanced',
      brand: opts.brand || 'anthropic',
      maxTokens: 4000
    });

    // Per Page Host skill 11-TILE-AI-SERVICE.md the field is `response`.
    // Keep other candidates as fallbacks in case the shape changes.
    const rawText =
      llmResp.response ||
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
      apple_icon: scraped.appleIcon,
      og_image: scraped.ogImage,
      twitter_image: scraped.twitterImage,
      image_count: (scraped.images || []).length,
      model_used: llmResp.model_used,
      tier: llmResp.tier || opts.tier || 'balanced',
      mode: fallbackReason ? 'pagehost-url-only' : 'pagehost',
      fallback_reason: fallbackReason
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
    humanErrorMessage,
    // Shared building blocks — used by localai.js so we don't duplicate
    // the prompt / HTML extraction / JSON parsing logic in two places.
    _analysis: {
      SYSTEM_PROMPT,
      extractCoreHTML,
      buildUserPrompt,
      parseAIResponseText,
      normalizeURL,
      pageHostError
    }
  };
})();
