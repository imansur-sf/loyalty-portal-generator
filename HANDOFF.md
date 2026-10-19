# LPG Session Handoff

Last updated: 2026-10-18. **Read this first.** `git log` records shipped changes; PROGRESS.md records the current sign-in/save rollout. `CLAUDE.md` in this repo is stale (still describes a Page Host zip-bundle deployment that was abandoned); its two-build-outputs instructions still apply.

## Customer-facing controls and full-size preview (2026-10-18)

Removed Reset demo, Show welcome screen, View as and sample-data instructions
from the generated portal. Customer account menu supports Sign out / Sign in.
Presenter reset/welcome/roles now live in collapsed builder-only controls,
including modal chrome. Parent-only messages control sandboxed previews;
selected roles carry into newly opened frames and never change saved defaults.

All four portal templates now embed96319bytes of precompiled Tailwind3 utilities
plus ordinary theme CSS. No blocking CDN compiler or Google font stylesheet in
exports. Build-time theme variables support opacity, gradients and numeric
font weights. Run npm run build:portal-css after changing generated classes;
check:portal-css verifies reproducibility. Tailwind/PostCSS are dev dependencies.
Standalone rebuild remains required. Portal font uses system fallbacks.

Expanded dialog uses an explicit viewport-height grid and is opened before
iframe loading. Current-frame/token readiness messages clear loading status;
render failures/timeouts expose a reload action rather than silent blank output.
141tests pass including generated CSS without external resources, all layouts,
preview lifecycle, stale messages, role synchronization and older projects.
17standalone scripts parse. Browser access to production is admin-policy blocked;
no visual browser confirmation. Production verification follows deployment.

## Incomplete AI response repair (2026-10-18, deployed0f9d590 / v31)

The program JSON parser threw an unclassified error for malformed/truncated
output, bypassing the editor's automatic correction branch. Both rules and
presentation now request JSON mode with12000 tokens and retry once with16000
when output is malformed, truncated, missing schema or semantically invalid.
Source pages remain intact; no local truncation repair or silent model defaults.
Network/provider failures remain outside content-repair retries. Current portal
and both-audience atomicity/stale-edit protection remain covered by tests.
Server caps16000, uses Gemini low thinking for JSON mode, excludes thought parts,
and returns finish_reason. MAX_TOKENS is rejected even for parseable JSON.
Logging includes finish/token counts only, never source content.

133 tests passed. Full22-pagePDF extraction succeeded (26756characters).
User explicitly approved replay through existing Gemini backend. Baseline
replay happened to succeed; original malformed response is not available.
Revised JSON/low-thinking config passed with complete valid program in11.3s.
Fullwebsite+PDF production verification passed bothtextstages in19.6s via
deployedLocalAI polling:2AIcalls,4vouchers,2offers,5benefits,5earningcards.
Image enrichment wasstubbed for this text-validationcheck; no browserrender check.

## Generation timeout repair (2026-10-18, deployed5a02418 / v30)

User reported HTTP503 then generic network error during URL/PDF generation.
Production v29 was up/configured; an in-dyno synthetic LLM call succeeded in23.3s.
Historical router logs were unavailable, so the exact failed request is not
confirmed. The synchronous AI route could run60s behind Heroku's30s router limit.

- Hosted LocalAI now submits POST /api/jobs, polls GET /api/jobs/:id with a
  per-job Bearer token, then DELETEs retrieved results. No uncertain POST retry.
  Only explicit404 on submission permits fallback to an older custom backend.
- generation-jobs.js is bounded process memory:6 active jobs,2 image jobs,
  40 stored jobs,64MiB retained results,20MiB/result,15min expiry. This assumes
  the current single web process/dyno; use shared durable storage before scaling.
  Deploy/restart loses in-flight jobs and yields a clear regenerate message.
- Shared input/config/rate validation occurs before job allocation. No customer
  input, job tokens, generated text or images are logged; timing/status only.
- AI text deadline120s; images90s; scraper15s includes response-body reads.
  Client requests24s including body download; polling150s; transient GET retries
  never create duplicate AI jobs. Distinct provider/session/gateway errors.
- Images use4 per background batch (48/run) and no more than2 simultaneous image
  jobs. Legacy synchronous endpoints remain for older/custom clients.
-123 tests passed, standalone17inline scripts parsed. A32s simulated generation
  completed with20ms submission and progress requests <=7ms. Hosted verification
  passed on v30 through the deployed LocalAI client (real text24.1s/image10.6s,
  two202submissions,23polls,two204deletions). Browser verification remains unavailable.

## Rich portal restoration (current implementation)

User reoriented LPG around polished SE demos. v27/v28's requirements path
bypassed rich content and replaced the portal with a sparse simulator. This
implementation removes that split. Deployed as d3d9482 / Heroku v29; new web
process is up,107tests passed, production health/assets/auth checks passed.
Deployment verification is in PROGRESS.md.

- Every Generate request runs validated program analysis, then complete branded
  presentation generation using the original content schema and scraped image
  candidates. Optional notes/PDFs inform both stages via rules/source coverage.
  `portal-content.js` binds vouchers/earning cards by stable program IDs, rejects
  incomplete output, and uses the existing image-generation backend for gaps.
- Website/source instructions remain untrusted. Program and content changes
  commit together after stale-result checks. Both-audience generation commits
  atomically. Failures retain the previous portals. Sources/assumptions are never
  embedded in exported HTML. PDF extraction remains text-only, no OCR.
- `variants.js` stores the active audience in the original state fields and only
  inactive audiences in `state.variants`, avoiding duplicated image payloads.
  Source documents stay shared. B2C and B2B keep independent content, edits and
  templates. Save Project includes both; export includes the selected audience.
- No program checkbox or manual apply gate. Program details/assumptions are
  optional. Valid edits update immediately; incomplete drafts retain valid output.
  Shared voucher/earning/member/tier controls synchronize authoritative rules.
- `generator.js` retains the original rich sections. `program-runtime.js` binds
  points/tier progression, earning/redemption, B2B approval and activity to those
  same cards. A simulated welcome/sign-in view is included. No real Salesforce
  transactions occur; demo activity resets on reload or preview regeneration.
- Templates: Classic, Member Dashboard, Rewards Showcase, Brand Experience.
  Alternate layouts rearrange shared nodes and keep their images and controls.
  Saved `modern` selections migrate to Dashboard. Full-size preview is available.
- Generated raster images are batched (12/request,48/run including benefits) and
  optimized to <=200KiB data URIs (960px cards/1280px hero). Existing uploads are
  untouched. Partial image failures surface warnings. The shared19MiB save cap
  still protects unusually large uploads. Image callbacks cannot cross audience,
  project, regeneration or widget-replacement boundaries.
- Editor HTML revalidates; versioned JS assets keep caching. Rebuild standalone
  after frontend changes using `python3 build-standalone.py`.
- Hosted synthetic B2C and B2B tests passed both AI stages with complete specific
  copy (4 rewards each); one actual image-service request returned200+image.
  Comparison artifacts preserve original ISACA18images/4vouchers/2offers in all
  layouts. Also prepared retail and industrial B2B examples. Browser screenshots
  remain unavailable: CUA reports no browsers/apps. Do not claim visual review.
- Preserve pre-existing worker/scrape.js and untracked tool-directory changes.

## October sign-in and saving update (shipped)

- `js/projects.js` owns named cloud saves, Update/Save as New, My Projects, project links, and per-tab IndexedDB draft recovery. `js/app.js` owns wizard editing; Start Over now clears project identity. Save is available in the top bar on every step.
- Hosted auth uses `js/accounts-loader.js` to load `/saasy-auth.js`; `accounts-proxy.js` forwards `/saasy-auth.js`, `/auth`, and `/projects` to the same shared accounts service as UPG. Set `SAASY_ACCOUNTS_URL` only when overriding the default shared backend. Standalone builds retain direct accounts access, including when hosted as a static file.
- Shared accounts currently uses Magic email OTP and the existing SaaSy JWT/project database; no accounts migration is required. The August API descriptions below are historical: accounts now supports Magic, project revisions, idempotency keys, and 20 MB project requests.
- Cloud payloads retain the legacy portal state and add `_lpgEditor` metadata for step/source URL. Older projects still open. Cloud saves use bounded payloads, revision checks, stable retry keys, same-account session recovery, and protection against late responses replacing newer work.
- Browser backups are per tab, contain no tokens, and are explicitly distinct from online saves. Restore checks the original account; save online for cross-device access.
- `npm test` covers project lifecycle/races/recovery and the real HTTP accounts proxy. Rebuild `standalone.html` with `python3 build-standalone.py` after editing any frontend module.
- Interactive browser verification was blocked by the managed browser origin policy. A real emailed-OTP round trip still needs a user browser check after deployment.
- Deployment verified: functional commit `46010b9`, Heroku v25. The web dyno reached `up`; in-dyno HTTP checks confirmed healthy LPG, Magic provider, shared widget, and anonymous project rejection (401). All 18 regression tests passed.

## Where we are

- **Working directory**: `/Users/imansur/claude/loyalty-portal-generator`.
- **Branch**: `main`. In sync with `origin/main` after this HANDOFF.md is pushed. One pre-existing uncommitted change, `worker/scrape.js`, is intentionally left alone this session — not mine to commit or discard without the user weighing in.
- **Role**: wizard tool for Salesforce SEs to spin up branded loyalty portal demos. One of four properties — alongside the SaaSy Solutions catalog, UPG, and ICP — sharing the save/sign-in system backed by the standalone `saasy-accounts` Heroku app.
- **Cross-property save/sign-in initiative is fully complete.** LPG's piece (`cbb904a` "Add SaasyAuth sign-in and project save/load to LPG", `8fe02b0` "Fix invisible white text in My Projects panel"): SaasyAuth sign-in widget, save/load/My-Projects panel, `?projectId=` auto-hydration, and the Cloudy export-assist button — same pattern as UPG/ICP. See `saasy-accounts/HANDOFF.md` (sibling repo) for the shared-backend side.
- **Also since the original plan was written**: LPG's backend model changed. The original plan assumed "no server code at all." That's no longer true — see Architecture below.
- **No open backlog items.** Watch for regressions the user flags after reviewing the My Projects panel, since it shipped without a design check-in.

## Architecture (current — supersedes `CLAUDE.md`'s Page Host section)

LPG now runs as a real Heroku app, mirroring UPG's pattern:

```
Browser
  ├─ LLM + scrape calls  ──►  same-origin Heroku server (server.js) ──►  Gemini API
  │                            /api/llm, /api/scrape, /api/generate-image(s)
  │                            GEMINI_API_KEY lives in Heroku env
  └─ Save/Load/Auth ──►  saasy-auth.js widget ──►  saasy-accounts (shared Heroku backend + Postgres)
```

- **`server.js`/`Procfile`/`project.toml`/`package.json`** — added via `8735566` ("Migrate LLM backend from CloudFlare Worker to Heroku server-side Gemini API") and `82f838b` ("Fix: bind to IPv6 dual-stack address (::) for Fir Private Space networking" — `app.listen(PORT, '::', ...)`). Same Heroku Fir CNB buildpack convention as UPG. Routes: `GET /api/health`, `GET /api/scrape` (SSRF-guarded proxy), `POST /api/llm`, `POST /api/generate-image`, `POST /api/generate-images`, plus a `GET *` static/SPA fallback.
- **`worker/` (Cloudflare Worker, `scrape.js`) is NOT dead code** — it's now an optional, user-overridable fallback endpoint rather than the primary backend. `index.html`'s Advanced → Scraper Endpoint field defaults to same-origin (`js/localai.js`'s `getScraperEndpoint()` — empty means same-origin, hitting the Heroku server's own `/api/scrape`/`/api/llm`) but can be pointed at a Cloudflare Worker URL (default shown in the UI: `https://loyalty-scraper.imansur.workers.dev`) for people running `standalone.html` locally via `file://` with no Heroku backend behind them, or who want to self-host their own worker. Don't remove `worker/` — it's still load-bearing for that use case.
- **Two build outputs** (from `CLAUDE.md`, still accurate, not restated in full): `index.html` + `js/` + `assets/` is the primary multi-file source; `standalone.html` is auto-generated by `build-standalone.py` (everything base64-inlined) for offline/`file://` use. **Re-run `python3 build-standalone.py` after touching `index.html`/`js/*`/fonts, before committing** — `95f40be` ("Rebuild standalone.html after merging remote changes") is a reminder this step is easy to forget after a merge.
- **`CLAUDE.md`'s "Page Host" section is obsolete.** Page Host deployment was abandoned in favor of this Heroku-server model (and, per `project_lpg_hosting.md`, GitHub Pages + Cloudflare Worker before that). Left as-is rather than edited/removed this session — out of scope for a docs-only pass — but do not follow its Page Host instructions as current guidance.

## Standing directives

1. **Auto-push**: for this repo, run `git add`/`commit`/`push` directly rather than handing the user terminal commands (established convention, mirrors the sibling generator repos).
2. **No secrets in committed source.** `GEMINI_API_KEY` lives in Heroku env only.
3. **Do not touch `worker/scrape.js`'s pending uncommitted change** without explicit instruction — it predates this documentation pass and isn't mine to resolve.
4. Do not commit `.claude/`, `.wrangler/`, or `worker/.wrangler/` — hook-managed/build-tool local state, intentionally left untracked.

## Key files

- **`server.js`** — Heroku Express backend: LLM proxy, scrape proxy, image generation, static serving. New since the original plan (`8735566`).
- **`js/app.js`** — wizard state, SaasyAuth save/load/My-Projects wiring (`cbb904a`), `onScraperEndpointChange()`.
- **`js/localai.js`** — `getScraperEndpoint()` (same-origin vs. user-configured Worker), scrape/LLM call logic, AI image generation for empty portal slots (`bcdbbc7`, `cfc6e85` raised the generation cap 5→12).
- **`build-standalone.py`** — regenerates `standalone.html` from `index.html`/`js/`/fonts. Run after any of those change.
- **`worker/`** — Cloudflare Worker (`scrape.js`, `wrangler.toml`), now an optional fallback/self-host scraper endpoint, not the primary backend. `worker/scrape.js` currently has an uncommitted change — leave it.
- **`Procfile`/`project.toml`** — Heroku Fir CNB buildpack config, same pattern as UPG.
- **`CLAUDE.md`** — pre-existing project instructions; Page Host section is stale (see Architecture above), "Two build outputs" section is still accurate.

## What to do next session

1. No known open backlog items. If the user raises new findings after reviewing the My Projects panel or Cloudy button, triage those first.
2. `worker/scrape.js` has a standing uncommitted change — ask the user before committing, discarding, or building on top of it.
3. For the shared-backend side of any My-Projects/SaasyAuth issue, see `saasy-accounts/HANDOFF.md` (sibling repo) — it owns the OTP/JWT/Postgres logic LPG's panel calls into.
4. Consider whether `CLAUDE.md`'s Page Host section should eventually be removed/rewritten — left untouched this session as out of scope for a docs-only pass.
