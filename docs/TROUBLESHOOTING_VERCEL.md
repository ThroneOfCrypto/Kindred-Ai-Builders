# Troubleshooting Vercel Deploys (Deterministic Core)

This repo is **Vercel-authoritative** and **Node 24.x strict**.

If something breaks, do the smallest possible thing that restores the contract.

---

## 1) Build cache issues

Vercel may reuse build cache across deployments. If a fix should have landed but the deploy behaves like it didn't, redeploy **without build cache**.

### Codespaces / CLI (recommended)

```bash
npm run ship:force
```

This runs a production deploy with the Vercel CLI `--force` flag.

### Vercel Dashboard

Open the deployment and use **Redeploy**. In the redeploy dialog, ensure **Use existing Build Cache** is disabled.

### Project-wide option

You can also set an environment variable `VERCEL_FORCE_NO_BUILD_CACHE=1` in the Vercel project settings to always skip build cache.

---

## 2) Node version mismatch

This repo enforces `Node 24.x`.

If you see install-time failures, check:

- `package.json -> engines.node` is `24.x`
- Vercel project **Node.js Version** is set to `24.x`

---

## 3) CDN/Data cache issues

If the site is deployed but you're seeing stale assets, purge cache:

```bash
npm run cache:purge
```

---

## 4) Fast diagnostics

Run the deterministic checks locally (diagnostic-only):

```bash
npm run doctor
```
