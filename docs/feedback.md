# Feedback inbox

Implementation checklist:

- [x] Shared accounts persistence, upload limits, idempotency and admin authorization.
- [x] Feedback form with optional screenshots and reliable retries.
- [x] Private inbox, unread counts, filters, status updates and attachment viewing.
- [x] Local proxy and production/standalone asset integration.
- [x] Backend, frontend, browser and build verification.

Release order: deploy the accounts migration first, then the generator. Check
Heroku deployment results for both releases; live internal requests require SSO.

Feedback uses the existing shared accounts PostgreSQL database. No email provider,
new database subscription, or additional Magic OTP flow is needed. The initial
administrator is `imansur@salesforce.com`; accounts verifies the session before
authorizing inbox and attachment requests. Contact emails on guest submissions
are self-reported.

Submissions and screenshots are separate from generated portals and short-lived
generation jobs. Portal exports never include feedback or admin controls.

Screenshots are limited to three PNG, JPEG or WebP files, at most 1 MiB each
after compression. Accounts independently validates bytes and enforces limits.
Feedback must be stored durably before the app reports success. It must never
fall back to temporary disk or process memory when the database is unavailable.

Deployment depends on the shared accounts service release migration. Until that
release is available, the generator shows a recoverable service error rather
than pretending to accept a submission.

## Operations

The generator proxies `/feedback` to `SAASY_ACCOUNTS_URL`, the same service as
saved projects. Accounts includes the additive feedback schema in its existing
release migration. `FEEDBACK_ADMIN_EMAILS` can override the initial admin list;
no new secret or provider account is required.

The inbox supports category/status filters, unread counts, paging, reading,
status changes and permanent deletion with confirmation. Deletion removes the
associated screenshots as well. Limits are 10,000 submissions and 100 MiB of
attachments across this inbox. Submission throttling allows five per email per
hour, plus a coarse 100/hour socket-address limit. Because the generator proxies
requests, the latter can be shared across users; it is not a verified client-IP
limit. Signed-in identity is stored separately from the contact email.

Use `npm test` in both repositories. An optional shared-accounts integration test
uses `FEEDBACK_TEST_DATABASE_URL` pointing to a dedicated test PostgreSQL database
and exercises repeatable migrations, concurrent retries, persistence across
connections/server instances, authorization and private attachment deletion.
Never point this test at a production database.

Verified locally with 344 generator tests, 49 accounts tests (including real
PostgreSQL), and Chrome desktop/mobile flows using both services. Shared accounts
commit: `7ec069e`.
