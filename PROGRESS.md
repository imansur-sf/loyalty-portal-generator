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
