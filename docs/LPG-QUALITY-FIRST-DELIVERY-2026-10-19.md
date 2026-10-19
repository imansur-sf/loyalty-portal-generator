# LPG first quality delivery

Date: October 19, 2026

Baseline rollback: `lpg-rollback-2026-10-19-v40` at `056e8ef7da959d763e77d46a876656f08b2d34bd`

Delivery checkpoint: `lpg-quality-first-delivery-2026-10-19`

This delivery implements the first batch recommended in the [quality audit](LPG-QUALITY-IMPROVEMENT-PLAN-2026-10-19.md). It preserves the template and program contracts while strengthening the deployed backend and improving frequent editing actions.

## Changes

- Scraped pages return an inert JSON envelope. Public destination addresses are validated before connection and after every redirect, and DNS results are pinned for the connection. Existing timeout and size caps remain.
- Scraping and paid generation require a signed, expiring guest capability. Guest editing remains available. All direct and background generation routes share request and image concurrency limits and per-connection hourly usage budgets. The current browser obtains capabilities automatically and keeps them out of saved projects.
- Origin checks replace wildcard API CORS. Heroku uses its appended proxy hop for connection identity; other deployments can explicitly configure trusted proxy hops and allowed origins.
- Browser delivery is restricted to entry documents and the browser asset directories. Backend source, tests, reports, scripts and rollback files return 404.
- Text, HTML attributes, image URLs and dynamic styles receive consistent contextual handling throughout the renderer and the builder escape helper.
- PNG, JPEG and WebP uploads are decoded, dimension-checked and optimized before entering state. Compact assets are bounded to 512 pixels and 120 KiB encoded; covers are bounded to 1600 pixels and 400 KiB encoded. Source uploads are limited to 12 MiB and 32 megapixels. Unsupported formats and failures retain the previous image.
- Uploads also check the projected whole-project save budget, reserving space for metadata. URL input rejects unsafe schemes, and raster data URLs go through the same image checks. Upload feedback is available to assistive technology.
- Voucher descriptions have a multiline editor, with line breaks retained in portal output.
- Builder preview refreshes retain the current chapter and scroll offset through a frame-and-token-validated message bridge. Presenter roles survive edits within a project and reset appropriately for a different project. This bridge is not included in downloaded portals.

## Verification

**217 automated tests passed**, with zero failures. Coverage includes scraper destination and response boundaries, guest capabilities, malformed budget inputs, shared generation limits, hostile text across all templates, optimized uploads and aggregate limits, voucher description save/reload, and preview state isolation by frame and project. Compiled portal CSS is current. The standalone builder was rebuilt from the updated source.

The integration review found and corrected an accounting bypass caused by non-string system input. Validation now rejects those inputs; budget reservation also rejects nonfinite, negative, fractional and nonnumeric costs before mutation.

No paid generation or internal-network probing was used for verification. Actual browser scrolling, visual layout, screen-reader behavior and provider output quality still need live checks; browser rendering was unavailable in this session.

## Operational scope

Guest capabilities are a bounded guest-access mechanism, not verified account identity. Budgets and job state remain local to one process and reset on restart; durable shared accounting and restart-safe jobs remain prerequisites for scaling to multiple dynos. Default hourly connection budgets are 240 images, 1.2 million conservative token units, 160 operations and 120 scrapes. Work already accepted by an AI provider is not silently retried.

The optional Cloudflare Worker was not changed or redeployed; its existing pending local edits remain outside this delivery. The shared accounts service and saved customer projects were not rewritten. Section selection, provenance review, stable content IDs, undo, progressive image filling and the broader accessibility/device-preview work remain later deliveries.

The pre-delivery source is recoverable from the v40 rollback tag. See the [rollback instructions](../rollback-stamps/2026-10-19-v40/README.md). The separate patch of pending tracked edits is a local backup, not part of the deployed release.
