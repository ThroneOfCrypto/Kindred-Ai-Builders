# Kindred Deterministic Core

This repository is a **Vercel-only, Node 24.x** deterministic kernel.

If it passed, prove it.


## Deploying

### One-click setup (GitHub → Vercel)

Use Vercel's Deploy Button flow to connect your Git repo and get automatic deployments.

> Replace `<YOUR_GITHUB_REPO_URL>` with your repo URL.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=<YOUR_GITHUB_REPO_URL>)

- Git-connected deploy (recommended): push to GitHub and let Vercel deploy.
- Codespaces CLI deploy: see `docs/DEPLOY_FROM_CODESPACES.md`.

### Zero-friction Codespaces deploy (minimal commands)

First time (per Codespace):

```bash
npm ci
npx vercel@50.4.10 login
npm run deploy:preview:zero
```

After that:

```bash
npm run deploy:preview:zero
```

Production:

```bash
npm run deploy:prod:zero
```

Ultra-minimal alias:

```bash
npm run ship
```

## What deploys on Vercel

- Static home: `/` (served from `public/index.html`)
- Health endpoint: `/api/health`
- Proof API: `/api/proof` (manifest + graph digests)
- Proof artifacts (static): `/proof/*.json`
- Proof portal (static): `/proof/` (index + manifest)

## Local expectations

Local execution is **diagnostic-only**. The authority contract is Vercel.

## Export targets (legacy intent preserved)

This repo is the authoritative kernel for the **vercel-node24** Target Kit.
The wider Kindred system can export repos that target non-Vercel environments,
but only via explicit Target Kits (see `docs/EXPORT_TARGET_KITS.md`).

---

See `/app` for Vercel-only application logic built on this kernel.
