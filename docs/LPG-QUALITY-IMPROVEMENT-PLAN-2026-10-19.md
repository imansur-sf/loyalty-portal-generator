# Loyalty Portal Generator quality audit and improvement plan

Date: October 19, 2026

Baseline: `056e8ef7da959d763e77d46a876656f08b2d34bd`, deployed as Heroku release **v40**

Rollback tag: **`lpg-rollback-2026-10-19-v40`**, verified on GitHub

Scope: backend, scraping, AI generation, program correctness, builder UI, assets, saved projects, templates, preview and export.

Status: pre-implementation audit. The [first quality delivery](LPG-QUALITY-FIRST-DELIVERY-2026-10-19.md) records the initial implemented fixes; findings below describe the v40 baseline.

## Recommendation

Improve LPG incrementally around its existing program model and template system. A framework rewrite or another visual redesign would leave the most consequential issues unresolved. First strengthen security boundaries; then protect the author’s work, make generated program facts traceable, and make editing directly correspond to what appears in the portal.

Cinematic Journey is a useful new presentation model. It also makes existing weaknesses more visible: large image modules increase asset size, long pages make preview resets disruptive, and editorial copy needs more discoverable controls. These are reasons to improve shared authoring infrastructure rather than add more template-specific exceptions.

The strongest product improvement would be a section-oriented editor: choose a section in the preview, edit its words and imagery, see whether its numbers come from program rules or presentation copy, and update that section without losing the current scroll position or regenerating the whole portal.

## Rollback and verification

The annotated rollback tag points to the exact deployed commit. A separate local backup preserves the pending tracked edits to `HANDOFF.md`, `PROGRESS.md`, and `worker/scrape.js`; those edits are not part of v40. The backup patch was checked against clean copies of the tagged files and applies successfully. Tool-state directories were excluded. This checkpoint covers application source, not customer projects, the separate accounts database, secrets, or runtime configuration.

See [rollback instructions](../rollback-stamps/2026-10-19-v40/README.md) and [backup manifest](../rollback-stamps/2026-10-19-v40/manifest.json).

| Check | Result and scope |
| --- | --- |
| Existing automated suite | **190 tests passed**, zero failures. Primarily Node, VM and JSDOM coverage. |
| Portal stylesheet freshness | Passed; compiled portal CSS is current. |
| Standalone build freshness | A fresh temporary build exactly matches the tracked standalone builder. |
| Scraper boundary probes | Offline mocked-fetch probes reproduced active HTML passthrough and an IPv6 loopback hostname bypass. No internal network targets were contacted. |
| Builder and output escaping probes | Inert attribute and element markers reproduced unsafe interpolation in the builder and shared offers output, including a program-enabled portal. No executable payloads were used. |
| Live baseline | Heroku reports v40 succeeded at the tagged commit; remote tag target verified. |

The existing green suite does not cover every issue found here. Findings below distinguish reproduced behavior, source-confirmed behavior, and product limitations. Real-browser layout, actual keyboard and screen-reader behavior, edge access controls, paid model quality, provider cost, and production load were not tested. Browser rendering remains unavailable under the session’s browser restriction. The source review covers LPG; it does not certify the separate accounts service.

Priorities: **P1** before expanding access or usage; **P2** next quality releases; **P3** subsequent polish and maintenance. Effort estimates are relative engineering scope, not calendar commitments.

## Existing strengths to preserve

- One validated program model drives rules, tier progress and demo interactions. Rewards and earning activities have program IDs, with validation for numeric limits, thresholds and roles.
- Generation checks for edits, project changes and audience changes before committing results. Multi-audience generation avoids partially replacing an accepted project when another audience fails.
- Image operations protect against stale uploads and generated results. Generated imagery already has size optimization and bounded batching.
- Pollable generation jobs avoid holding a Heroku router request open for the entire AI operation. Job tickets use strong random tokens; unknown or unauthorized polling returns no job data.
- Save flows handle revisions, account changes and bounded session recovery. Browser draft backup is explicitly distinguished from an online save.
- Exported previews are sandboxed. Cinematic supports reduced motion, multiline copy, sparse content and long-copy fallbacks.

These controls are worth retaining while extracting shared components and improving the contracts around them.

## Backend findings

### B1 P1 Scraped HTML is served as active content on the LPG origin

**Reproduced offline.** The scrape endpoint accepts HTML and returns its original bytes and content type. Navigating to a crafted scrape URL can therefore turn third-party markup into a document on the LPG origin. The current response has no document sandbox policy. Evidence: [server.js](/Users/imansur/claude/loyalty-portal-generator/server.js:108), especially the response at line 129.

Return scraped content in a JSON envelope such as `{html, finalUrl}`, or as explicitly non-executable text with `nosniff`; update both clients to consume that contract. Never publish upstream markup as an active top-level application document. Add a route regression that verifies this boundary.

### B2 P1 Scraper destination checks miss IPv6 and redirect destinations

**IPv6 bypass reproduced offline; DNS and redirect gaps confirmed in source.** The endpoint checks only the initial hostname, follows redirects automatically, and uses a hostname blacklist without resolving destination addresses. URL IPv6 literals retain brackets, defeating the literal comparisons. Evidence: [initial check](/Users/imansur/claude/loyalty-portal-generator/server.js:86), [redirect handling](/Users/imansur/claude/loyalty-portal-generator/server.js:94), [host checks](/Users/imansur/claude/loyalty-portal-generator/server.js:423).

Use a shared outbound-fetch policy that validates IP literals, resolved addresses, ports and every redirect hop. Ensure the connection uses an approved address so a later DNS change cannot bypass validation. Apply the policy to the optional Worker as well. Retain the existing timeout and streamed response-size cap.

### B3 P1 Paid API controls are not tied to the signed-in user

**Confirmed application-level boundary.** Paid endpoints check provider configuration and an IP rate bucket but do not validate the account session. The API allows any CORS origin. Rate limiting reads the first forwarded-address value, whose trust depends on ingress behavior. Direct synchronous routes bypass the active-job concurrency gate. Evidence: [middleware](/Users/imansur/claude/loyalty-portal-generator/server.js:38), [LLM checks](/Users/imansur/claude/loyalty-portal-generator/server.js:145), [direct routes](/Users/imansur/claude/loyalty-portal-generator/server.js:259), [job concurrency limits](/Users/imansur/claude/loyalty-portal-generator/generation-jobs.js:40).

External Heroku or corporate access controls may reduce reachability; this audit did not establish public anonymous access. They do not supply per-user budgets inside LPG. Validate an account session or issue a bounded guest generation capability, use a trusted proxy policy, allowlist required origins, and place every paid route behind one concurrency and usage gate. Account for image counts and token usage, not just request counts. Preserve guest editing and preview if desired without granting unlimited access to a shared paid key.

### B4 P2 Generation jobs disappear on restart and cannot span dynos

**Explicit design limitation.** Jobs and results live in one process-local Map. A restart loses them; multiple instances would not share lookups. The client correctly avoids blindly resubmitting an uncertain paid request. Evidence: [generation-jobs.js](/Users/imansur/claude/loyalty-portal-generator/generation-jobs.js:3), [polling](/Users/imansur/claude/loyalty-portal-generator/generation-jobs.js:82).

Before increasing dyno count, move job ownership, stage state and results into shared durable storage. Use idempotency keys, worker leases and bounded retention. Persist completed stages so recovery does not repeat paid work. Bind jobs to the initiating account or guest capability. Restart and cross-instance tests should precede scale increases.

### B5 P2 The supplied Worker and browser disagree on API paths

**Confirmed compatibility defect.** The Worker supports `/scrape` and `/llm`; the browser’s custom-backend path requests `/api/scrape`, `/api/jobs`, and then `/api/llm` on a job-route 404. The pending local Worker edits do not fix these paths. Scraping can fall through to public proxy services. Evidence: [Worker routes](/Users/imansur/claude/loyalty-portal-generator/worker/scrape.js:67), [browser scrape](/Users/imansur/claude/loyalty-portal-generator/js/localai.js:144), [job fallback](/Users/imansur/claude/loyalty-portal-generator/js/localai.js:255).

Define an explicit backend capability contract and run the same route tests against Heroku, Worker and Page Host adapters. Show which adapter is active and make public-proxy fallback an explicit choice rather than an invisible change in processing destination.

### B6 P2 Release packaging exposes more files than necessary and relies on manual steps

**Confirmed in source.** Express serves the repository root, making non-dot source, test and script files eligible for static delivery. No secret disclosure was established. The release process lacks a single build gate covering tests, compiled CSS, standalone freshness and asset versions. Evidence: [static root](/Users/imansur/claude/loyalty-portal-generator/server.js:398), [build scripts](/Users/imansur/claude/loyalty-portal-generator/package.json:7).

Build a dedicated public directory and serve only its contents. Generate asset hashes automatically, compile the builder stylesheet locally, and run a deterministic release check in CI. Require non-public routes such as `/server.js` and `/test/...` to return 404. Include the release SHA in health output and correlate job IDs, stage duration, provider failures and usage without logging customer prompts or credentials.

## UI and authoring findings

### U1 P1 HTML escaping is inconsistent across builder and output

**Reproduced with inert markers.** The builder’s `esc()` uses `textContent` followed by `innerHTML`, which escapes text but leaves quotes unsafe inside `value="..."`. A quoted voucher title became an extra HTML attribute and truncated the visible value. Shared offers also insert image attributes, titles and descriptions without context-appropriate escaping. Both ordinary and program-enabled output accepted the marker. Evidence: [voucher field](/Users/imansur/claude/loyalty-portal-generator/js/app.js:828), [esc helper](/Users/imansur/claude/loyalty-portal-generator/js/app.js:1342), [shared offers](/Users/imansur/claude/loyalty-portal-generator/js/generator.js:363).

Prefer DOM properties and `textContent` in the builder. For HTML exports, centralize text escaping, attribute escaping, URL validation and safe style tokens, and apply them consistently across every section. Imported and AI-generated content must remain data. Sandbox isolation in the preview does not fix the unsandboxed builder or downloaded output. Add hostile-string fixtures for all templates, not just selected new components.

### U2 P2 Uploads can make a project too large to save

**Confirmed mismatch.** Manual uploads are stored as original base64 files; they do not use generated-image optimization. Cloud save rejects payloads above 19 MiB. Several large cover images can cross that boundary after the author has done substantial work. Evidence: [upload reader](/Users/imansur/claude/loyalty-portal-generator/js/images.js:87), [save limit](/Users/imansur/claude/loyalty-portal-generator/js/projects.js:78).

Validate and decode uploads, resize by asset role, and compress before committing them to state. Show asset usage and an actionable warning before the save limit. Offer cover/contain, focal-point placement and recommended proportions. Longer term, store assets separately and reference them by ID instead of copying base64 into every project snapshot.

### U3 P2 Editing rebuilds the whole preview

**Source-confirmed navigation; visual effect requires browser verification.** After a 300 ms debounce the app assigns new iframe `srcdoc`. That creates a new document, losing its scroll and interaction state. The update also resets presenter role. This is particularly disruptive when editing later cinematic chapters. Evidence: [debounce](/Users/imansur/claude/loyalty-portal-generator/js/app.js:1162), [document replacement](/Users/imansur/claude/loyalty-portal-generator/js/app.js:1204), [preview refresh](/Users/imansur/claude/loyalty-portal-generator/js/app.js:1248).

Preserve section position and supported interaction state through the existing validated frame message bridge. Patch words, styles and images when possible; use full rebuilds for structural changes. Keep an explicit Restart interactions action so editing does not implicitly restart the demo.

### U4 P2 Rendered text is not consistently editable or discoverable

**Confirmed.** Voucher descriptions render but have no corresponding textarea in the voucher editor. Cinematic navigation and some shared labels are hardcoded. The older tier block still includes fixed retention claims such as an expiry in three days. Evidence: [voucher editor](/Users/imansur/claude/loyalty-portal-generator/js/app.js:824), [voucher description](/Users/imansur/claude/loyalty-portal-generator/js/generator.js:334), [legacy retention copy](/Users/imansur/claude/loyalty-portal-generator/js/generator.js:248), [cinematic navigation](/Users/imansur/claude/loyalty-portal-generator/js/portal-templates.js:182).

Create an inventory mapping each rendered string to an editable field, a program-derived value or an intentional system label. Add missing description and label controls. Let selecting a preview section open its editor. Make the distinction visible between **display wording** and **program rules**. Keep the newly editable next-tier message, while avoiding invented numeric claims in other components.

### U5 P2 Bulk sample actions replace authored sections

**Confirmed.** Section Auto-generate actions replace arrays with industry defaults. This can discard custom words and uploaded assets; these buttons are different from the full AI generation flow. Evidence: [section auto-generation](/Users/imansur/claude/loyalty-portal-generator/js/app.js:1087).

Rename deterministic actions to Use sample content. Offer Fill empty fields, Add suggestions and Replace section as distinct choices. Add undo for bulk replacements and deletions. For AI refinement, request scoped changes and show a comparison rather than relying solely on a prompt to preserve unrelated text.

### U6 P2 Builder accessibility and device previews need a shared standard

**Source-confirmed gaps.** Several labels lack field associations; repeated delete buttons are unnamed multiplication signs; wizard steps are numbers without semantic current-step state; step changes do not move focus to their heading. The embedded preview is a fixed 1440 by 900 desktop canvas and is hidden on narrow builder screens. Evidence: [wizard steps](/Users/imansur/claude/loyalty-portal-generator/index.html:287), [form labels](/Users/imansur/claude/loyalty-portal-generator/index.html:415), [delete controls](/Users/imansur/claude/loyalty-portal-generator/js/app.js:826), [preview canvas](/Users/imansur/claude/loyalty-portal-generator/js/app.js:1169).

Use shared field and collection components with explicit labels, contextual button names and stable IDs. Name the wizard steps, expose `aria-current="step"`, and manage focus and status announcements. Add desktop, tablet and phone canvas presets plus a persistent Preview control on narrow screens. Verify keyboard, zoom and reduced-motion behavior in a real browser when available.

## AI and program design findings

### A1 P2 Valid structure does not guarantee customer policy is correct

**Confirmed validation limit.** The model checks supported numbers, currencies and tier structure. Customer policy evidence is primarily prompt-driven and stored as free-text requirements references. A structurally valid invented tier name can therefore pass validation. The ISACA terminology concern illustrates why this distinction matters. Evidence: [program validation](/Users/imansur/claude/loyalty-portal-generator/js/program-model.js:64), [requirements evidence](/Users/imansur/claude/loyalty-portal-generator/js/program-model.js:95), [response validation](/Users/imansur/claude/loyalty-portal-generator/js/requirements.js:81).

Record source document, page, supporting excerpt and status for critical facts: tier names, qualification basis, currencies, thresholds and reward costs. Classify each as source-backed, author-specified, illustrative or unresolved. Verify that quoted evidence exists in the extracted source. Present a short rule review before adopting new inferred policy, with an explicit illustrative-demo option rather than silently presenting assumptions as facts.

### A2 P2 The model forces different industries into one qualification ladder

**Design limitation.** The runtime supports one qualifying currency, one redeemable currency and ascending numeric tier thresholds. That is useful for many demos, but cannot faithfully represent every professional association, airline, hotel or financial membership program. Evidence: [currency and tiers](/Users/imansur/claude/loyalty-portal-generator/js/program-model.js:64), [runtime projection](/Users/imansur/claude/loyalty-portal-generator/js/program-runtime.js:75).

Add versioned capabilities for presentation-only status, optional tiers, qualification periods and additional metrics. A program should be allowed to show a membership experience without pretending to simulate unsupported eligibility. The editable progress sentence improves author control; it does not change the underlying qualification model.

### A3 P2 Image generation delays the first useful preview

**Confirmed orchestration.** Each audience waits for presentation generation and image enrichment before the generated portal is committed. The image pass allows up to 48 assets in sequential batches of four; Both audiences executes each full sequence in turn. Evidence: [audience orchestration](/Users/imansur/claude/loyalty-portal-generator/js/requirements-editor.js:88), [image wait](/Users/imansur/claude/loyalty-portal-generator/js/portal-content.js:316), [batch execution](/Users/imansur/claude/loyalty-portal-generator/js/localai.js:597).

Show a validated draft as soon as text is ready, then fill high-priority images in the background. Preserve the current accepted project until the author adopts the draft. Offer Fast draft and Full imagery, show per-asset status, and retry missing images without regenerating rules or text. Add run cancellation checks between batches, checkpoints and measured token/image usage. Cancellation should stop future work without implying it can reverse a provider request already accepted.

### A4 P2 Positional image preservation can attach an old image to new content

**Source-confirmed risk.** Refinement matches previous imagery by label, then falls back to list position when collection lengths match. Equally sized replacement lists can inherit unrelated old images. Benefit covers already avoid this positional fallback. Evidence: [image association](/Users/imansur/claude/loyalty-portal-generator/js/portal-content.js:183).

Give every content item and asset a stable ID. Preserve, replace, reorder and remove by identity rather than array index. Use the same IDs for uploads, generation, preview selection, undo and scoped AI changes. Regression tests should cover equal-length replacement, reordering, renaming and switching audiences while assets are pending.

## Implementation phases and acceptance criteria

| Phase | Scope | Relative effort | Done when |
| --- | --- | --- | --- |
| 0 Security boundaries | B1–B3 and U1; safe scraper responses, outbound URL policy, paid-route identity/budgets, consistent escaping | Medium | Scraped markup cannot become an active LPG document; private destinations and redirect bypasses are denied; all paid paths share access/concurrency controls; inert markup stays data in every template. |
| 1 Protect work and program truth | U2, U5, A1, A4; upload budget, stable IDs, undo, scoped refinement, provenance review | Medium to large | Large uploads are handled before save failure; replacement and reorder keep correct assets; source-backed facts and assumptions are distinguishable; AI changes can be accepted or undone by scope. |
| 2 Make authoring direct | U3, U4, U6; preview continuity, complete copy controls, section selection, accessible forms, device presets | Medium | Editing a late chapter stays there; visible author copy has discoverable controls; keyboard users can complete the builder; phone and desktop layouts can be inspected without changing project data. |
| 3 Improve generation and deployment | B4–B6 and A3; durable staged jobs, text-first drafts, adapter contract, public-only build, CI and telemetry | Large | Restart and multi-instance tests pass; completed stages resume without duplicate paid work; all adapters pass contract tests; every release builds and verifies artifacts automatically. Move public-only packaging and release checks earlier when practical. |
| 4 Broaden program capability | A2, localization, declarative template/content contracts | Large | Programs without a simple points ladder render honestly; locale-aware formatting works; a new template field has one declared save/render/asset contract. |

Use a small cross-industry fixture set throughout: a professional association, retail, hospitality, airlines and financial services. Include sparse and extensive rewards, long names, missing assets, no-tier programs and different currencies. AI semantic quality needs a human-reviewed fixture set alongside deterministic tests; JSDOM cannot establish scroll polish or visual readability.

## Suggested first delivery

Start with the security boundaries, upload optimization, missing voucher-description control, and preview scroll preservation. These changes address concrete risks and frequent author friction while preserving the investment in Cinematic Journey. Follow with stable IDs, provenance and scoped AI updates before adding more template-specific fields or substantially increasing generation volume.

No application fixes or production redeployment were performed as part of this audit. Only the rollback marker, local backup and report were created. The baseline application remains v40.
