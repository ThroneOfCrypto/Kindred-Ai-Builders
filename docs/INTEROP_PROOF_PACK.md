# External Interop Proof Pack

This repo is **Vercel-only** and **Node 24 strict**.
External tooling (like `cosign` or `in-toto`) is **not required** for Vercel builds,
because requiring it would reintroduce toolchain drift and environment ambiguity.

So interop is treated as an **optional proof pack** that is:

- deterministic
- log-safe
- explicitly enabled
- evidence-emitting

## What it does

The interop pack emits:

- `dist/interop_proof_pack.report.json`

By default it **SKIPS** (still `ok=true`) so Vercel builds remain stable.

When enabled, it probes for external tooling and records availability.

## How to run

### Default (safe): skip mode

```bash
npm run proof:interop
```

Expected result:

- `ok: true`
- `skipped: true`

### Enabled mode (requires tools installed in the environment)

```bash
KINDRED_INTEROP_ENABLE=1 npm run proof:interop
```

If `cosign` is present, the report records success.
If `cosign` is missing, the tool fails deterministically.

## Why this exists

Kindred’s deterministic core is built around:

- κ-canonical meaning
- evidence emission to `dist/` and `evidence/`
- proof graphs binding inputs → tools → artifacts

External ecosystems (supply chain signing, attestations) can consume these artifacts,
but we do **not** allow them to become build-time dependencies on Vercel.

Interop is therefore:

- **portable proof** for humans and other toolchains
- **non-authoritative** on Vercel unless explicitly enabled
