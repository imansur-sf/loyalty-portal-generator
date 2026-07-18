# Cloudflare Worker — Loyalty Portal Backend

Two-endpoint Worker that powers the loyalty portal wizard:

- `GET /scrape?url=<url>` — server-side URL fetcher (bypasses browser CORS + corporate proxy blocking)
- `POST /llm` — LLM proxy that holds your Salesforce LLM Gateway key as a Worker secret, so users of the wizard don't need to bring their own key

Plus a `GET /health` probe.

## Why this exists

The wizard's Quick Start feature needs to (1) fetch a customer's homepage HTML and (2) send it to an LLM. Doing either directly from the browser is blocked by CORS or requires the end user to have their own API key. This Worker moves both server-side so end users just visit the wizard and click Analyze — no configuration, no keys.

## One-time deploy

Requires a free [Cloudflare](https://dash.cloudflare.com/sign-up) account and `wrangler` (Cloudflare's CLI).

```bash
npm install -g wrangler

cd worker
wrangler login                          # opens browser, sign in (once)
wrangler secret put SF_GATEWAY_KEY      # paste your SF LLM Gateway key
wrangler deploy                          # publishes the worker
```

Wrangler prints something like:

```
Published loyalty-scraper (0.85s)
  https://loyalty-scraper.<your-subdomain>.workers.dev
```

The wizard client already defaults to that URL for the account `imansur`. If you deploy under a different name, paste the URL into the wizard's Advanced → Scraper / Backend Endpoint field.

## Verify

```bash
BASE=https://loyalty-scraper.<your-subdomain>.workers.dev

# Health — llm_configured should be true after `wrangler secret put`
curl -s "$BASE/health"
# → {"ok":true,"service":"loyalty-scraper","version":2,"endpoints":[...],"llm_configured":true}

# Scrape
curl -s "$BASE/scrape?url=https://example.com" | head -c 200

# LLM (uses the server-held key)
curl -s -X POST "$BASE/llm" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Say hi in exactly 3 words","tier":"fast","maxTokens":50}'
# → {"text":"Hi to you.","model_used":"claude-3-5-sonnet-20241022","tier":"fast","usage":{...}}
```

## Endpoint reference

### `POST /llm`

Request body (JSON):
```json
{
  "prompt":    "user message (required, ≤200_000 chars)",
  "system":    "system prompt (optional, ≤20_000 chars)",
  "tier":      "fast | balanced | powerful (default balanced)",
  "model":     "explicit model id (optional; must be in allowlist)",
  "maxTokens": 4000
}
```

Response:
```json
{ "text": "...", "model_used": "...", "tier": "...", "usage": {...} }
```

Allowlisted models (others rejected to prevent abuse):
- `claude-sonnet-4-5-20250929` (balanced/powerful default)
- `claude-sonnet-4-20250514`
- `claude-3-7-sonnet-20250219`
- `claude-3-5-sonnet-20241022` (fast default)
- `claude-3-5-sonnet-20240620-v1`

Error codes: `llm_not_configured` (503), `invalid_json`, `missing_prompt`, `prompt_too_long`, `system_too_long`, `rate_limited` (429), `gateway_bad_key`, `gateway_forbidden`, `gateway_model_not_found`, `gateway_rate_limited`, `gateway_unavailable`, `gateway_empty_response`, `gateway_failed`, `timeout`, `network_error`.

### `GET /scrape?url=<encoded-url>`

Returns the fetched HTML as `text/html` with permissive CORS.

Guardrails:
- 15s timeout, 3 MB body cap
- SSRF blocklist (private IPs, loopback, link-local, cloud metadata, `.internal`/`.local`)
- Only `http:`/`https:` protocols

## Rate limiting

**In-Worker per-IP:** 30 `/llm` requests per minute per IP. Casual abuse deterrent; strict enforcement needs Cloudflare Access or a paid rate-limiting rule.

## Authentication options (in ascending order of robustness)

Right now, anyone with the Worker URL can call `/llm` up to the rate limit. If that becomes an issue:

1. **Add a shared secret header** — client sends `X-App-Token: <value>`, Worker rejects requests without it. Token is discoverable in the frontend JS but deters random scrapers. Add to Worker in ~5 lines.

2. **Cloudflare Access + Salesforce SSO** — free feature. Sits in front of the Worker and requires `@salesforce.com` SSO before requests reach it. **Recommended for an SF-internal tool.** Configuration is entirely in the Cloudflare dashboard, no code changes.

## Rotating / rolling back

- **Rotate key:** `wrangler secret put SF_GATEWAY_KEY` — enter new value.
- **Re-deploy code:** `wrangler deploy`.
- **Roll back to previous version:** `wrangler rollback`.
- **Disable:** `wrangler delete` — removes the Worker entirely.

## Cost & limits

Cloudflare Workers free tier: 100k requests/day, 10 ms CPU per request. The scraper uses <5 ms CPU (waiting on upstream doesn't count). The `/llm` endpoint uses <2 ms CPU (waiting on the Gateway doesn't count). Realistic cost for demo-tool volume: **$0/month**.
