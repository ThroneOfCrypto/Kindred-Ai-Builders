# NEW WINDOW PROMPT — Kindred Deterministic Core (Kernel + Target Kits)

You are the next AI assistant working on **Kindred Deterministic Core**.

This window continues the repo evolution **without duplication, drift, or dead ends**.

---

## Inputs you will receive

The user will provide two zip files:

1) **Legacy reference** (read-only intent source)
   - `kindred_ai_builders__v1.1.1__pre_vercel__patched366_node24_strict_vercel_handglove_perfected__2026-01-22.zip`

2) **Deterministic kernel target** (authoritative)
   - `kindred-deterministic-core__v0.30.0__handover_packet.zip` (or newer)

---

## Authority + Mission (NON-NEGOTIABLE)

### 1) Kernel authority is **Vercel-only (Option A)**

This repo is a **Vercel-authoritative deterministic kernel**.

Rules:
- **Vercel wins** over local/CI assumptions.
- **Node 24.x strict**. No Node 20 fallback. No multi-engine support.
- `npm ci`, `npm run build`, and `npm test` must always pass under the Vercel contract.

### 2) Export lanes are **Target Kits (Option B)**

Users must be able to export repos that do **not** run on Vercel.

However:
- The kernel remains Vercel-authoritative.
- Non-Vercel exports happen via **explicit Target Kits** (hashable contracts in `kits/**`).

---

## What is already completed (do NOT redo)

Read first:
- `docs/MIGRATION_MAP.md` (G1–G15 are complete)
- `docs/KERNEL_COMPLETION_CHECKLIST.md` (ticked checklist of everything already landed)

If you cannot point to a specific missing contract or broken gate, **do not add new work**.

---

## How to work (hard constraints)

1) **Single-failure discipline**
   - Fix only the first failing gate.
   - Rerun build/test.

2) **No drift**
   - No framework swaps.
   - No architecture "modernization".
   - No platform portability inside the kernel.

3) **CI-safe evidence**
   - Keep stdout tiny.
   - Write full reports to `dist/**` and publish via `public/proof/**`.

4) **Every patch must**
   - bump version
   - update `docs/MIGRATION_MAP.md` only if new scope is added
   - zip and provide the updated repo

---

## First objective in this new window

Upgrade **Target Kits** from scaffolding to a usable second lane without contaminating the kernel:

### Step 1 — Make `docker-node24` a real kit
- Add a minimal `kits/docker-node24/` kit payload:
  - `Dockerfile`
  - `README.md` (how to build/run)
  - a tiny contract note (what is authoritative, what is diagnostic)

### Step 2 — Make `target:pack` include kit payload files
- Ensure `tools/target_pack.mjs` emits a deterministic pack that includes:
  - kit metadata
  - file list + sha256 for each kit payload file
  - no kernel behavior changes

### Step 3 — Add one negative test
- Demonstrate that "kit features" cannot weaken kernel contracts.
  - Example: `docker-node24` kit existence must NOT bypass `contracts:verify`.

Then ship:
- `kindred-deterministic-core__vX.Y.Z__docker_node24_kit_real.zip`
