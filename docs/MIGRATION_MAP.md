# Migration Map (Legacy → Deterministic Vercel Kernel)

This document translates the legacy repository into the new Vercel-only,
correct-by-construction kernel. It is not aspirational; it is a binding plan.

Legacy reference:
kindred_ai_builders__v1.1.1__pre_vercel__patched366_node24_strict_vercel_handglove_perfected__2026-01-22.zip

Deterministic kernel baseline: **v0.30.0**

---

## A. Execution & Authority

Legacy:
- Mixed assumptions about local, CI, and Vercel execution.
- Node 24 enforced socially and partially.

New:
- `/docs/EXECUTION_AUTHORITY_AND_LINEAGE.md`
- Hard requirement: `process.env.VERCEL === '1'`
- Local execution is diagnostic-only.

Status: COMPLETE

---

## B. Environment & Toolchain

Legacy:
- npm/corepack behavior adjusted reactively.
- Registry/network issues handled ad hoc.

New:
- Environment, toolchain, defaults, determinism encoded as contracts.
- Any deviation aborts execution.
 - Preinstall guard: `tools/assert_node_contract.mjs` enforces Node 24.x early.

Status: COMPLETE

---

## C. Build vs Runtime

Legacy:
- Implicit assumption build == runtime.

New:
- Explicit phase separation with continuity checks.
- Mismatch is a platform fault.

Status: COMPLETE

---

## D. Dependency Graph

Legacy:
- Lockfile relied upon but not cryptographically enforced.

New:
- Lockfile hash treated as a contract.
- Drift forbidden.

Status: COMPLETE

---

## E. Determinism (Time / Randomness)

Legacy:
- Implicit access to time and nondeterministic behavior.

New:
- Time and randomness forbidden unless explicitly declared and replayable.

Status: COMPLETE

---

## F. Evidence & Proof

Legacy:
- Logs and CI output implied correctness.

New:
- Every verification step emits hashable evidence.
- Manifest is the court record.

Status: COMPLETE

---

## G. Application Logic (TO BE PORTED)

Legacy:
- SPEL / builders / domain logic intertwined with tooling.

New:
- Application logic must live ABOVE this kernel.
- It must:
  - run only on Vercel
  - emit evidence
  - obey determinism contracts
  - never weaken authority checks

Target structure (planned):
- `/app` (Vercel app code)
- `/app/verify` (app-level evidence emitters)
- `/app/contracts` (app-specific contracts)

Status: NEXT

Progress (ported slices):
- **G1** SPEL canonicalization kernel (κ-json) + verify wiring ✅
- **G2** Periodic Tables + contracts checker (phase0/phase1) integrated as CI-safe verification ✅
- **G3** Periodic stability gates (trace/system-order/compound-order) imported with CI-safe summaries + dist artifacts ✅
- **G4** Mechanized weak/strong equivalence tool + digest commitment (SPEL equiv) + minimal counterexample harness ✅
- **G5** Digest-bound proof graph export (DAG) with deterministic node/edge identities + DOT export ✅
- **G6** Proof graph minimality rules + validator + negative tests (cycles, orphan artifacts, unknown edge types forbidden) ✅
- **G7** Federation packs + immiscibility counterexamples (mechanized immiscible domain pairs gate) ✅
- **G8** External interop proof pack (cosign / in-toto optional probes + deterministic report) ✅
- **G9** Evaluation pack (threat model + reproducibility checks + lightweight benchmarks) ✅
- **G10** Runtime surface: static home + /api/health + publish proof artifacts to public/proof ✅
- **G11** Proof portal index + deterministic proof manifest (public/proof/index.html + proof_manifest.v1.json) ✅
- **G12** Preinstall Node contract enforcement (fail-fast on non-Node24 before any install/build step) ✅
- **G13** Proof UX hardening: build order fixed (graph before publish) + /api/proof endpoint for manifest/graph digests ✅
- **G14** Vercel-only execution contract guard (requires VERCEL=1; local only via explicit diagnostic escape hatch) ✅
- **G15** Target Kits scaffolding (vercel-node24 authoritative kit + docker-node24 planned kit) ✅

- **G16** Target Kits usable lane: docker-node24 implemented payload + deterministic target pack includes payload digests + packs emitted during build via `target:pack:all` + negative test (kits cannot bypass kernel contracts) ✅

- **G17** Legacy runtime affordances: `/verify` UI + `/feedback` no-custody helper + `/healthz` minimal uptime endpoint ✅

---

## H. What Will NOT Be Ported

Explicitly excluded from migration:
- Portability helpers
- CI workarounds for non-Vercel runners
- Defensive code for other platforms
- Implicit defaults of any kind

These were sources of entropy.

---

## I. Order of Operations

1. Freeze kernel (this repo).
2. Create a new Vercel app layer on top.
3. Port legacy logic module-by-module into `/app`.
4. Each ported module must:
   - declare contracts
   - emit evidence
   - pass determinism checks

Anything that cannot meet these requirements is discarded.


---

## G17 — Codespaces deploy ergonomics (diagnostic only)

Kernel remains Vercel-authoritative. Added minimal `npm run deploy:*` convenience scripts for **Codespaces / CLI** usage without changing kernel contracts.

- Added: `docs/DEPLOY_FROM_CODESPACES.md`
- Added scripts:
  - `deploy:preview` → `npx vercel@50.4.10 --yes`
  - `deploy:prod` → `npx vercel@50.4.10 --prod --yes`
  - `ship` → `npm run deploy:prod:zero`
  - `deploy:build:*` → local Vercel build emulation

Authority remains Vercel runtime + Node 24.x.

- Added `.devcontainer/devcontainer.json` pinned to `mcr.microsoft.com/devcontainers/javascript-node:24-bookworm` for Codespaces Node 24 alignment.

- **G17** Legacy translation tracking: added `docs/LEGACY_PARITY_LEDGER.v1.json` + `legacy:parity` diagnostic checker + scaffold kit `legacy-nextjs-ui` ✅
