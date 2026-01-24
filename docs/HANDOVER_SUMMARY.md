# Handover Summary

This file exists to carry context across windows without re-reading long chat logs.

## Current posture

The repo is a **Vercel-only deterministic kernel** (**Option A**), with **Target Kits** (**Option B**) for exporting repos into other execution lanes.

## Kernel authority (Option A)

Enforced by:
- `tools/assert_node_contract.mjs` (Node 24.x strict, fail-fast)
- `tools/assert_vercel_contract.mjs` (requires `VERCEL=1`, fail-fast)

The kernel keeps stdout small and writes all detailed evidence to `dist/**`.

## What was ported from legacy (high level)

Completed migration slices are listed as **G1–G15** in `docs/MIGRATION_MAP.md`.
The ticked canonical checklist is `docs/KERNEL_COMPLETION_CHECKLIST.md`.

## Where proof lives

- Evidence emission: `dist/**` and `evidence/**`
- Proof graph export: `dist/proof_graph.v1.json` + `.dot`
- Proof portal publishing: `public/proof/**`
- Runtime inspection:
  - `/api/health`
  - `/api/proof`

## Next work (intended)

Promote `kits/docker-node24` from placeholder to a **real kit** (payload + deterministic pack), without contaminating kernel authority.
