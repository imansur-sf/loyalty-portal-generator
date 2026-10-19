# LPG rollback stamp

Created October 19, 2026 before the backend and UI audit.

- Remote annotated tag: `lpg-rollback-2026-10-19-v40`
- Commit: `056e8ef7da959d763e77d46a876656f08b2d34bd`
- Heroku application: `sassysolutions-loyaltygen`
- Deployed baseline: release `v40`
- Pending tracked edits are separately preserved in `pending-tracked-changes.patch`. Its checksum and excluded tool state are recorded in `manifest.json`.

To inspect the committed baseline without replacing the current editor files:

```sh
git worktree add --detach /tmp/lpg-v40-checkout lpg-rollback-2026-10-19-v40
```

A future production rollback, if requested, can use the Heroku release rollback command below while v40 remains eligible:

```sh
heroku rollback v40 --app sassysolutions-loyaltygen
```

The commands above are instructions only; no rollback has been performed. A release rollback does not restore customer projects or data in the separate accounts service. This stamp does not snapshot secrets or runtime configuration. If release v40 is no longer available, build and deploy the tagged source through the normal release workflow.

The pending patch can be reapplied to a clean checkout of the tagged source after `git apply --check pending-tracked-changes.patch` succeeds. Do not apply it over the existing dirty files: they already contain those changes.
