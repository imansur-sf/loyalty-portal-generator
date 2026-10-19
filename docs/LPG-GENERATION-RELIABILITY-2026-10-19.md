# Generation reliability correction — 2026-10-19

Recent production results from the reported guest session showed two failure families: a complete program with a monthly cap on an activity awarding no qualifying points, and incomplete JSON despite a normal provider finish reason. Not every result could be mapped to the exact screenshot attempt. Manual regeneration could succeed because it produced a different candidate.

## Changes

- Program instructions now describe the full version-2 contract and the validator's earning/cap restrictions consistently. New branded demos explicitly allow labeled illustrative rules where policy is unknown; supplied policy and accepted edits retain precedence.
- Both generation stages request repository-owned structured response contracts. Clients cannot supply arbitrary schemas. The Gemini transport omits numeric bounds and collection limits from native schemas for provider compatibility; the full instructions and LPG validation retain those restrictions.
- The existing single correction receives the complete rejected candidate and exact validation errors when it fits the request budget. Source documents are never truncated to make room for a candidate. Malformed JSON remains rejected.
- Explicitly empty optional presentation sections are accepted; missing or mistyped sections remain errors.
- Final errors explain the category of conflict and preserve the existing portal and requirements. No additional automatic paid retries or uncertain-request replays were introduced.

## Verification

Provider checks used small synthetic examples without customer content or images. The provider rejected the full schemas, accepted a minimal control, and then accepted both complete structural schemas after omitting `minimum`, `maximum`, and `maxItems`. Both successful responses ended normally and parsed as complete JSON. These are compatibility checks, not a measured first-attempt success rate.

Regression coverage includes qualifying-only cap semantics, malformed responses, required version-2 fields, bounded correction context, both audiences, native contract transport, arbitrary-schema rejection, optional empty sections, and unchanged BYO-provider behavior. Build and deployment verification are recorded in the task completion report.

Semantic validation remains necessary: structured JSON alone cannot guarantee correct company policy. A genuinely inconsistent or unsupported program may still require author clarification.
