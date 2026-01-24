# Deploy from GitHub Codespaces (Minimal Commands)

This kernel is **Vercel-authoritative** and **Node 24.x strict**.

## Zero-drama deployment flow (recommended)

You do **not** need to deploy from the terminal if your repo is connected to Vercel.

1. Make changes in Codespaces
2. Commit + push to GitHub
3. Vercel automatically deploys

This keeps the kernel contract simple: **Vercel decides the truth**.

## Minimal CLI flow (Codespaces)

This repo includes a `.devcontainer/devcontainer.json` that pins **Node 24** for Codespaces.


If you want a manual deploy from Codespaces with the fewest commands:

### One-time setup (first deploy ever)
In the repo root:

```bash
npx vercel@50.4.10 login
npm ci
npm run deploy:preview:zero
```

That links the project (if needed) and creates a Preview deployment.

### Deploy again (Preview)
```bash
npm run deploy:preview:zero
```

### Deploy to Production
```bash
npm run deploy:prod:zero
```

Or the laziest possible alias:

```bash
npm run ship
```

### Pull Vercel settings + env vars locally (optional)

If you want your Codespace to mirror Vercel settings and env vars:

```bash
npm run setup:vercel
npm run vercel:env:pull
```

## If you want to *verify* Vercel build behavior locally

Preview environment build:
```bash
npm run deploy:build:preview
```

Production environment build:
```bash
npm run deploy:build:prod
```

## Node 24 strict check

At any time:
```bash
node -v
```

If this is not 24.x, the repo will refuse to install (`preinstall` contract guard).

## Notes (so the kernel stays clean)

- **The kernel never becomes portable.** Docker and other targets are **kits**.
- CLI deploy commands are **diagnostic convenience**, not authority.
