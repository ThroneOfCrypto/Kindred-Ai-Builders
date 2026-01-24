# Zero-friction maintenance (Node 24.x + Vercel-authoritative)

This repo is intentionally boring:

- **Vercel is the authority** (local runs are diagnostic)
- **Node 24.x only**
- **No portability inside the kernel** (portability lives in `kits/**`)

## What you do day-to-day

### Deploy (recommended)

1. Edit in Codespaces
2. `git commit` + `git push`
3. Vercel deploys automatically via Git integration

## What the repo automates for you

### Vercel CLI stability (pinned)

All Codespaces deploy scripts use a **pinned Vercel CLI** so you don't get surprise behavior changes mid-week:

- `vercel@50.4.10`

If you ever need to bump it, update the version in `package.json` scripts.

### Dependency updates (Dependabot)

A minimal `.github/dependabot.yml` is included so GitHub can open weekly npm update PRs.

Keep it boring:

- merge patch/minor updates
- review major updates (they break things for sport)

### Node 24 safety

The repo refuses to install under the wrong Node major version.

## When something breaks (it will)

### First move: reproduce the Vercel build locally

```bash
npm run deploy:build:preview
```

This runs `vercel build` in diagnostic mode so you see issues *before* pushing.

### Second move: look at the proof artifacts

After a successful build, the proof portal and artifacts are available from:

- `public/proof/`

The full reports are written to `dist/**` and published statically.
