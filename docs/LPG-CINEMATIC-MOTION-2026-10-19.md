# Cinematic motion reliability — 2026-10-19

The card morph and featured-voucher expansion were still present in release v51. An older shared `crowded` flag disabled all motion whenever any configured text crossed a character/line threshold, including progress summaries over 220 characters or tier names over 24. That made animation depend on AI wording and affected previews and exports alike. This matches the reported generation-to-generation variability, although the original failed portal was not supplied for exact field attribution.

The presentation response contract added in v51 explicitly exposes optional Cinematic copy, which could trigger the existing guard more frequently. The latest generation changes did not directly remove either animation.

## Correction

- Each pinned scene now checks its own rendered content fit. Ordinary longer names and sentences no longer disable all page motion.
- Content that genuinely exceeds a pinned scene's available space flows normally in that scene, while the other scene and section reveals remain active.
- Fit is checked again after resize, font readiness, page load, and motion-preference changes.
- Reduced-motion and compact viewport fallbacks remain available. Keyboard focus and chapter links still reveal usable content immediately; print uses normal flow.
- The proposal-review preview now uses a scaled 1440 × 900 desktop canvas. Its former small iframe always selected the compact fallback.

Automated regression checks exercise both scroll timelines, independent overflow fallbacks, resizing, long generated copy, reduced motion, keyboard/anchor access, and preview scaling without navigation. Geometry tests use controlled DOM measurements; they are not a substitute for visual browser inspection.
