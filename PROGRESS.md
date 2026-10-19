# LPG sign-in and project persistence

- [x] Route the shared accounts widget and APIs through LPG; preserve standalone use.
- [x] Add named saves, separate copies, safe project identity, retry/session recovery and revision checks.
- [x] Add browser draft recovery and save access on every wizard step.
- [x] Verify regression cases, rebuild standalone, review and deploy.

Validation: 18 regression tests passed; JavaScript syntax and patch checks passed.
Commit 46010b9 deployed successfully (Heroku v25); its web dyno reached `up`.
Read-only checks inside that dyno returned 200 for `/api/health`, 200 with
provider `magic` for `/auth/config`, 200 for the shared OTP widget, and 401
`missing_token` for anonymous `/projects` access.

Interactive local browser testing was blocked by the managed origin policy.
A real emailed OTP and authenticated save/load round trip still needs a user
browser check; no real emails or project changes were made during verification.

Keep the pre-existing worker/scrape.js edit and local tool directories untouched.

## Requirements-driven B2C/B2B design review

- [x] Review the customer PDF and separate prototype needs from operational integrations.
- [x] Compare UPG prompt/role patterns with LPG's generation, preview and save model.
- [x] Write a concrete proposal, example mapping and phased implementation scope.

Scope: analysis and design; implementation is not yet requested for this extension.
Proposal: REQUIREMENTS-AND-B2B-DESIGN.md. Reviewed all 22 source PDF pages in
text and visually checked the detailed rules/transition tables on pages 14 and
16-19. Read-only code review covered LPG and UPG. No application changes,
deployment, real emails, or customer project mutations were made for this review.

## Requirements, B2B and output templates implementation

User approved implementation and parallel template work.

- [x] Add brief/text-PDF input, reviewed structured program and shared AI integration.
- [x] Add validated program rules and deterministic B2C/B2B demo interactions.
- [x] Add optional Modern Brand template; preserve Classic default.
- [x] Integrate saving, migrations, standalone/export and focused regression tests.
- [x] Review, verify and deliver the completed changes with limitations documented.

Parallel ownership: program_model owns program-model.js and its tests;
program_runtime owns program-runtime.js and its tests; portal_templates owns
portal-templates.js and its tests. Main owns editor, AI adapters, integration,
dependencies, project migration, standalone build, and documentation.

Validation: 74 regression tests passed (including DOM editor integration and
exported demo execution); syntax and diff checks passed. PDF.js extracted all
22 pages / 26,756 characters of the supplied PDF, with no empty pages. The
corrected program prompt produced valid B2B rules against the existing Heroku
Gemini backend using synthetic data. The first live attempt exposed an invalid
zero sample-spend amount; the prompt now specifies positive sample amounts and
the editor permits one schema-correction attempt before reporting an error.

Status: local implementation only; no new commit, push or deployment. Existing
Heroku release v26 was used only for read-only status and two synthetic AI
requests. Browser visual verification remains pending because managed browser
origin policy blocks local app access. Sources and notes are saved with editor
projects but excluded from exported portals. Demo transactions reset on reload;
real Salesforce posting, OCR, referrals and business hierarchy are future work.

## Deployment

- [x] Confirm origin/main is synchronized and the tested changes are ready.
- [x] Commit and deploy only this feature; preserve the unrelated worker edit.
- [x] Verify the deployed revision, health, editor modules and PDF assets.

Deployment completed: commit a3f4196, Heroku release v27 succeeded. New dyno
web-994549677-qd66x reached up while the previous release was retired. In-dyno
checks returned 200 for health, the updated editor, program/template scripts
and both PDF.js assets. All six asset SHA-256 hashes match the tested local
files. Auth config remains Magic (200); anonymous projects return401 as expected.
The unrelated worker edit and local tool directories remain untouched.

## Live preview regression

- [x] Identify why generated requirements stay out of the preview (manual apply gate).
- [x] Automatically activate valid generated programs and valid edits; retain invalid drafts.
- [x] Verify editor, export and saved-project behavior (79 tests pass).
- [x] Deploy and verify the live preview fix.

Review also covered invalid-rule/color edits and preservation of newer shared
brand identity changes. Both have regression tests. Standalone rebuilt.

Live preview fix deployed: commit 6db880d, Heroku v28 succeeded. New web
process web-665656bc8f-q7pm2 is up. In-process HTTP checks returned health
200, new editor copy and cache-versioned script; served editor SHA-256 matches
the tested source. No real customer data or emails used in verification.

## Rich portal restoration and variants

User approved mission-aligned implementation: rich branded demos, optional
requirements, B2C/B2B/Both, immediate preview, saved variants and real layouts.

- [x] Restore full content and image enrichment for all generation requests.
- [x] Preserve Classic and connect interactions to the same rich portal.
- [x] Add independent saved B2C/B2B variants and simplify authoring controls.
- [x] Add Dashboard, Rewards Showcase and Brand Experience layouts.
- [x] Verify rich exports, interactions and variant persistence.
- [ ] Browser screenshot review (unavailable: CUA has no browsers/apps).
- [x] Deploy and verify the completed change.

Ownership: main owns authoring/app/projects/variants/migration; generation_quality
owns portal-content + LocalAI image helper; rich_runtime owns generator/runtime;
layout_templates owns template rendering. Preexisting worker edits untouched.

Hosted synthetic checks: B2C ISACA-inspired membership and B2B Northstar Supply
both passed strict rule and full presentation validation, with4rewards each and
contextual benefits/offers. A separate image request returned200+983KB image.
This exposed save-size risk; new generated images now optimize to<=200KiB each.
Full-size preview added so SEs can assess desktop compositions beyond the narrow
side preview.12 comparison HTML specimens include original ISACA assets and
retail/B2B examples; original ISACA retains18images/4vouchers/2offers throughout.

Restoration deployed as commit d3d9482 / Heroku v29. New process
web-6ddf5f447d-sclh8 is up.107tests passed;17standalone inline scripts parse.
Production checks: health200, editorHTML no-cache, Both option, checkbox removed,
all4templates and full-sizepreview present. All9served script hashes match local
source; authconfig200, anonymousprojects401. Realbrowservisualinspection remains
unavailable (no CUA browsers/apps). Unrelated worker/tool state preserved.

## Generation backend timeout repair
- [x] Inspect deployed dyno and long-running generation request flow.
- [x] Replace long HTTP waits with bounded background jobs and short authenticated polls.
- [ ] Verify delayed completion, failure handling and regression suite; deploy and check hosted generation.

Validation:123 regression tests passed; standalone17 scripts parse.32s delayed
AI test completed with20ms submission and <=7ms progress calls. Preflight rejects
invalid/rate-limited work before storing jobs. Deployment pending.
