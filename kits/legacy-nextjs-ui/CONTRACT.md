# Contract: legacy-nextjs-ui kit

This kit exists to preserve the **legacy UI + workflow intentions** from `patched366` without contaminating the kernel.

## What is authoritative

Nothing in this kit is authoritative for the kernel.

The deterministic kernel is authoritative only under:
- Vercel runtime contract
- Node 24.x strict

## What this kit is allowed to do

- Ship UI + UX surfaces
- Include optional API routes (diagnostic / helper)
- Run on non-Vercel targets when exported

## What this kit is NOT allowed to do

- Weaken kernel contract verification
- Change proof publication rules
- Bypass Node 24 enforcement for the kernel
