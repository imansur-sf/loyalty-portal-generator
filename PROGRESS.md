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
- [ ] Commit and deploy only this feature; preserve the unrelated worker edit.
- [ ] Verify the deployed revision, health, editor modules and PDF assets.
