# Legacy Director UI (Next.js) — Target Kit

This kit is the **translation lane** for the original `patched366` Next.js UI.

- ✅ Preserves the original design language and information architecture
- ✅ Keeps the deterministic kernel clean (static + Vercel-authoritative)
- ✅ Allows Directors to export a full UI surface when desired

## Authority

This kit is **not authoritative**. The authoritative kernel contract remains:

- Vercel-only runtime
- Node 24.x strict
- Kernel proof artifacts published under `public/proof/**`

This kit is an **export target**.

## Status

Scaffold only. Payload will be filled by translating the Next.js pages and API routes into this kit.
