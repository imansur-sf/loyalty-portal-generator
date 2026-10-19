# LPG remaining quality phases

Date: October 19, 2026. Baseline: live v43, source `3e4026ed186b55871a964a7ad3032795a3e9ae2e`.

A new annotated rollback tag, `lpg-rollback-2026-10-19-v43`, was pushed before implementation. The local patch of unrelated pending changes remains private. See the [rollback instructions](../rollback-stamps/2026-10-19-v43/README.md).

## Delivered scope

| Phase | Changes |
| --- | --- |
| 1: Protect work and program truth | Stable content and asset identities; undo/redo; sample fill/add/replace; scoped AI proposals with accept/discard, a change comparison and sandbox preview; source-quote evidence with explicit illustrative/unresolved status. Unselected and unchanged authored text survives refinement, including long text and uploaded imagery. |
| 2: Direct authoring | Opt-in preview section selection opens its editor; searchable fields; wording and locale controls; contextual keyboard-accessible upload/delete controls and named wizard steps; desktop, tablet and phone viewport presets; per-image fit and focal point controls. Existing scroll preservation remains. |
| 3: Generation and deployment | PostgreSQL-backed guest jobs and shared budgets, idempotency, cancellation, recovery checkpoints, text-first adoption and progressive image filling. Explicit provider adapters, bounded image budgets, readiness and release metadata, privacy-conscious job timing logs, local builder CSS, content-addressed assets, reproducible artifact checks and CI/deployment gates. |
| 4: Program capability | Backward-compatible version 2 model, descriptive programs, optional tiers, qualification basis/period and independent metrics. Unsupported eligibility is presented as authored information; it does not simulate invented qualification. Locale-aware formatting includes French, German and Arabic reward balances. Shared content/asset contracts preserve identities through save, refinement and rendering. |

Cinematic remains the initial template. The other templates remain selectable. Generation, editing, preview and download use guest access; app sign-in is reserved for saving/reopening online projects.

## How the changed workflows behave

AI generation first produces a proposed text draft. The current portal stays intact until **Accept**. The review identifies the scope, changed fields and program evidence; **Discard** retains the current portal. After acceptance, images fill in the background up to the selected budget. Cancellation stops future batches; it cannot undo an already dispatched provider request. Image completion checks stable identity and current slot values so new uploads win. Undo cancels ongoing enrichment before restoring its snapshot.

Recovery is explicit. Browser checkpoints retain job tickets and request fingerprints in session storage, without persisting provider keys or full request bodies. Completed stages can be reused for the same source, inputs and provider configuration. Changed inputs or source content prevent unsafe reconstruction. An interrupted running request has an unknown paid outcome and is never automatically resubmitted. Queued work can resume. Text results last 24 hours, image results one hour, and idempotency tombstones 24 hours; recovery is bounded by those limits.

Evidence status verifies that a quote and fact value occur in supplied source text. It does not prove that the quote establishes the intended company policy. The review explicitly asks the author to assess interpretation. Editing a fact invalidates its previous evidence classification.

Program details allow an author to choose descriptive membership, remove tiers, set the qualification period and add independent metrics. Descriptive reward controls open opportunity details instead of pretending to deduct a fabricated cost. No-tier programs retain their eligibility explanation. The editable Cinematic next-tier sentence remains presentation copy.

## Verification

- Full automated suite: **279 tests, 278 passed, zero failures, one optional database test skipped**. The separate real-database run executed that integration test and the initialization-failure test: **2 passed**.
- Real PostgreSQL checks covered separate connections, exclusive dispatch claims, duplicate keys, conflicting payloads, shared quotas, lease fencing, expiry, queued cancellation and cancellation after dispatch. Synthetic records were cleaned up by exact owner/record identifiers.
- Contract and workflow tests cover scoped AI preservation, provenance, source changes during recovery, undo/project/audience isolation, stale image callbacks, preview message validation, all output templates, no-tier/descriptive programs and localized live redemption.
- Local editor CSS, portal CSS, asset manifest and standalone output reproduce exactly with `npm run check:build`.
- Production dependency audit: **zero advisories**. Seven development dependency advisories remain in the Tailwind 3 build-tool chain; the proposed automatic fix requires a separate Tailwind 4 migration. No framework major upgrade was forced into this delivery.
- No paid AI calls were made. Browser rendering is unavailable under the session restriction, so actual scrolling, visual layout, keyboard/screen-reader behavior and provider semantic quality still require live acceptance testing. JSDOM checks do not establish visual polish or full accessibility compliance.

## Operations and rollback

Durable storage is enabled only when `LPG_DATABASE_URL` is configured; a stable `LPG_GENERATION_SECRET` is also required. LPG uses its own `lpg_generation_*` tables. It does not change account or saved-project tables. Schema initialization is idempotent and serialized. A configured database failure fails generation closed with a recoverable error; `/api/ready` reports availability. `/api/health` reports the storage mode and release/build metadata. Without database configuration, local development explicitly reports process-memory storage.

The existing database is reused through a separate LPG configuration reference; no paid add-on is provisioned. Cutover starts a new usage window because old in-process counters cannot be migrated. Only one LPG release is being deployed; the shared accounts application and optional Worker are not redeployed. Existing unrelated Worker changes remain outside the commit.

The v43 source can be restored without dropping the new LPG tables. Before rolling back, consider in-flight jobs: the old release cannot recover durable tickets or share the new budgets. Do not rotate the generation secret or drop tables as part of an ordinary source rollback. Customer project formats remain backward-compatible, but older code cannot fully author the newly introduced version 2 program capabilities.
