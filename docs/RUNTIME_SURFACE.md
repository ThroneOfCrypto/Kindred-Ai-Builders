# Runtime Surface (Vercel)

This repo is primarily a **deterministic verification kernel**.

To make it deployable on Vercel as a real, living service (not just a CI job), it includes:

- `public/index.html` (static landing page)
- `api/health.js` (Vercel Function health endpoint)

## Proof artifacts publishing

During `npm run build`, the tool `tools/proof_publish_static.mjs` copies selected proof artifacts from `dist/` into:

- `public/proof/`

This makes them accessible as static files in production (for humans, crawlers, and external auditors).

## Why this exists

If the system cannot be deployed and observed on its target platform (Vercel), then “deterministic core” is marketing, not engineering.
