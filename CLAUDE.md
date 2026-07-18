# Loyalty Portal Generator

A wizard tool for Salesforce SEs to spin up branded loyalty portal demos in minutes.

## Page Host

When building HTML pages for the Page Host platform, read the skill at:
https://single-html-page-app-host-07cda8a7041b.herokuapp.com/skills/00-PAGE-HOST-SKILL.md

This project is designed to be deployed to Page Host as a zip bundle:
- `index.html` at the root is the entry point.
- All local references use `./`-prefixed paths per Page Host's rule.
- The Quick Start (Step 1) feature relies on `POST /api/proxy/llm/{uploadId}` and `GET /api/proxy/fetch/{uploadId}/{targetUrl}` — see `js/pagehost.js`.
- Before demoing, add proxy connections for the customer domains you want to analyze, and confirm an `einstein` AI connection is configured on the tile.
