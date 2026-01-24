# Docker Node 24 Kit (Diagnostic)

This kit provides a **minimal Docker runner** for the Kindred Deterministic Core.

It exists so exports can target non‑Vercel environments **without contaminating** the kernel.

## Authority

- ✅ **Authoritative:** Vercel (`VERCEL=1`)
- ⚠️ **Diagnostic only:** Docker

Docker is useful to reproduce install/build/test behavior in a more controlled environment, but it is **not** a substitute for Vercel proof.

## What this kit does

- Uses the **official Node 24 Docker image**
- Runs `npm ci` (deterministic installs)
- Sets `KINDRED_ALLOW_LOCAL_DIAGNOSTIC=1` explicitly (so kernel contracts can execute without pretending Docker == Vercel)
- Defaults to `npm test`

## Build

From the **repo root**:

```bash
docker build -t kindred-deterministic-core:node24 -f kits/docker-node24/Dockerfile .
```

## Run tests

```bash
docker run --rm kindred-deterministic-core:node24
```

## Run build instead

```bash
docker run --rm kindred-deterministic-core:node24 npm run build
```

## Read the contract note

See: `kits/docker-node24/CONTRACT.md`
