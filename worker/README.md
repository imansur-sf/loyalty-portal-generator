# Cloudflare Worker — Loyalty Portal Scraper

Server-side URL fetcher for the loyalty portal wizard's Quick Start feature. Fixes the CORS wall that blocks browser-side scraping on corporate networks.

## Why this exists

The wizard's Quick Start needs to fetch a customer's homepage HTML so the LLM can extract images, colors, and content. From a browser this can't be done directly — CORS blocks cross-origin fetches, and Salesforce's corporate firewall blocks public CORS proxies. This Worker sits in front and fetches the URL from Cloudflare's edge instead, then returns the HTML with permissive CORS headers so the browser can read it.

## One-time deploy

Requires: a free [Cloudflare](https://dash.cloudflare.com/sign-up) account and `wrangler` (Cloudflare's CLI).

```bash
npm install -g wrangler

cd worker
wrangler login       # opens browser, sign in to your Cloudflare account (once)
wrangler deploy      # publishes the worker
```

On success `wrangler` prints something like:

```
Published loyalty-scraper (0.85 sec)
  https://loyalty-scraper.<your-subdomain>.workers.dev
```

Copy that URL — you'll paste it into the wizard's **Advanced → Scraper Endpoint** field.

## Verify it works

```bash
curl 'https://loyalty-scraper.<your-subdomain>.workers.dev/health'
# {"ok":true,"service":"loyalty-scraper","version":1}

curl -s 'https://loyalty-scraper.<your-subdomain>.workers.dev/scrape?url=https://example.com' | head -c 200
# Should print the first bytes of example.com's HTML
```

## Endpoint

`GET /scrape?url=<encoded-url>` — returns the target URL's HTML as `text/html` with `Access-Control-Allow-Origin: *`.

Also exposes `GET /health` → `{ok: true, ...}` for load-balancer probes.

### Guardrails

- **Timeout:** 15 seconds
- **Body cap:** 3 MB (larger responses → 413)
- **Content type:** text/* only (binaries → 415)
- **SSRF blocklist:** private ranges (10/8, 172.16/12, 192.168/16), loopback (127/8, ::1), link-local (169.254/16, fe80::), cloud metadata (169.254.169.254, metadata.google.internal, `.internal`, `.local`)
- **HTTP methods:** GET, OPTIONS only

### Error shape

Non-2xx responses are JSON with:

```json
{ "error": "code", ...detail }
```

Codes: `missing_url`, `invalid_url`, `bad_protocol`, `blocked_host`, `upstream_status`, `not_text`, `too_large`, `timeout`, `network_error`.

## Cost & limits

Cloudflare Workers free tier: 100,000 requests/day, 10 ms CPU per request. This Worker uses <5 ms of CPU per request (the rest is waiting on the upstream fetch, which doesn't count against the CPU budget). Realistic monthly cost: **$0**.

## Rotating / rolling back

- **Update:** re-run `wrangler deploy`. New version is live in seconds.
- **Roll back:** `wrangler rollback` — reverts to the previous version.
- **Disable:** `wrangler delete` — removes the worker entirely.

## What if this endpoint gets abused?

Since anyone with the URL can hit it, in principle it can be used as an open proxy. In practice:
- 100k req/day cap is generous but bounded — you can't rack up bills
- SSRF guard blocks internal-network probing
- 3 MB / 15s caps prevent egregious usage
- If needed later, you can add a shared-secret header the client always sends and the Worker checks (`request.headers.get('x-scraper-secret')`), or restrict `Access-Control-Allow-Origin` to your specific GitHub Pages / Page Host origins.
