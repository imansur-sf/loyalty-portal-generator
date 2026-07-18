// ============================================================
// scrape.js — Cloudflare Worker: server-side URL scraper
// ------------------------------------------------------------
// The loyalty portal wizard's Quick Start feature needs to fetch a
// customer's homepage HTML to feed the LLM. From a browser it can't:
//   - CORS blocks direct cross-origin fetches
//   - Corporate networks (e.g. Salesforce) block public CORS proxies
//     like corsproxy.io / allorigins.win
//
// This Worker sits between the two and fetches the URL server-side,
// then returns the HTML with permissive CORS headers so the browser
// can read it.
//
// Deploy:
//   npm i -g wrangler
//   wrangler login
//   wrangler deploy
//
// After deploy, wrangler prints a URL like:
//   https://loyalty-scraper.<your-subdomain>.workers.dev
//
// Paste that URL into the wizard's Advanced → Scraper Endpoint field.
// ============================================================

const MAX_BYTES = 3_000_000;      // 3 MB response cap
const TIMEOUT_MS = 15_000;         // 15s upstream timeout
const USER_AGENT = 'Mozilla/5.0 (compatible; LoyaltyPortalScraper/1.0; +https://github.com/imansur-sf/loyalty-portal-generator)';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const reqUrl = new URL(request.url);

    // Health check
    if (reqUrl.pathname === '/' || reqUrl.pathname === '/health') {
      return json({ ok: true, service: 'loyalty-scraper', version: 1 }, 200);
    }

    if (reqUrl.pathname !== '/scrape') {
      return json({ error: 'not_found' }, 404);
    }
    if (request.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, 405);
    }

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

      if (!upstream.ok) {
        return json({ error: 'upstream_status', status: upstream.status }, 502);
      }

      const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
      // Only pass through text/* responses — no binaries
      if (!/^text\//i.test(contentType) && !/(json|xml|xhtml)/i.test(contentType)) {
        return json({ error: 'not_text', contentType }, 415);
      }

      // Read with byte cap
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

      const body = concat(chunks);
      return new Response(body, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type':      contentType,
          'Cache-Control':     'public, max-age=600',
          'X-Scraper-Source':  targetURL.hostname,
          'X-Scraper-Bytes':   String(total)
        }
      });
    } catch (err) {
      const code = err && err.name === 'TimeoutError' ? 'timeout' : 'network_error';
      return json({ error: code, message: (err && err.message) || 'unknown' }, 502);
    }
  }
};

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

// SSRF guard: reject private IP ranges, loopback, cloud metadata endpoints.
function isDangerousHost(host) {
  if (!host) return true;
  const h = host.toLowerCase();
  if (h === 'localhost' || h === 'localhost.localdomain') return true;
  if (h === 'metadata.google.internal') return true;
  if (h.endsWith('.internal') || h.endsWith('.local')) return true;
  // AWS/Azure/GCP instance metadata
  if (h === '169.254.169.254') return true;
  // IPv4 literal in any private range
  if (/^(10|127)\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (h === '0.0.0.0') return true;
  // IPv6 loopback/link-local
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc00:') || h.startsWith('fd00:')) return true;
  return false;
}
