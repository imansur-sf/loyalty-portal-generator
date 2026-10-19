# LPG rollback before remaining quality phases

The annotated tag `lpg-rollback-2026-10-19-v43` marks live release v43 before the remaining quality phases. The manifest records source and configuration scope. Pending tracked edits are backed up locally in a separate patch and have not been included in the live-source tag.

Inspect safely with `git worktree add --detach /tmp/lpg-v43-checkout lpg-rollback-2026-10-19-v43`. If a production rollback is requested while eligible, use `heroku rollback v43 --app sassysolutions-loyaltygen`. These commands have not been executed. Database changes, shared services, and configuration require their own compatibility review before rollback.
