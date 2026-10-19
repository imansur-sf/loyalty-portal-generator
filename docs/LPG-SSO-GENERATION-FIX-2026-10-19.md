# LPG generation access correction

The v41 generation permission check rejected the internal Heroku SSO address when its browser Origin differed from the public Host forwarded to the application. The original deployment check used matching public Origin and Host, so it did not cover this routing case.

The deployment now explicitly allows both exact HTTPS LPG addresses through `LPG_ALLOWED_ORIGINS`, including the observed `herokuapp-internal.com` origin. Other origins remain denied. No wildcard or arbitrary forwarded hostname is trusted.

Generation capabilities remain signed and expire, but their validity no longer depends on an unchanged network address: corporate SSO proxies may change egress between requests. The signed issuance identity continues to own the usage budget, so changing network hops does not reset a capability's quota. A persistent `LPG_GENERATION_SECRET` is configured to retain unexpired permissions across process replacement. Its value is not stored in this repository or report.

The browser automatically renews once after an explicit `generation_capability_required` or `generation_capability_expired` rejection before a job is accepted. It does not resubmit after uncertain network outcomes, accepted jobs, generic sign-in failures, or HTML responses. Website scraping has the same bounded permission recovery. Address configuration errors now receive a distinct message rather than repeatedly instructing the user to refresh.

Configuration changes: `LPG_ALLOWED_ORIGINS` and `LPG_GENERATION_SECRET` were previously unset; the first now contains the exact internal/public LPG origins and the second contains a generated signing key. Guest quotas and job state remain process-local; this fix does not add durable job storage or account authentication.

Regression coverage includes the internal-Origin/public-Host combination, changing proxy egress without resetting quota, persistent-key verification after process replacement, bounded pre-acceptance renewal, and prevention of paid retries for uncertain or already accepted work.

Verification: all 225 automated tests pass, including concurrent renewal sharing. Portal CSS is current and the standalone builder was rebuilt.
