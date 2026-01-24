# Kernel Completion Checklist (Vercel-Authoritative)

This checklist exists to prevent **duplication, drift, and dead ends** when handing work between windows.

It reflects the current, already-landed status of the **deterministic kernel**.

Current kernel version: **v0.30.x**

---

## A) Authority & Execution Contract (Option A)

- [x] **Vercel is authoritative** (kernel lane)
- [x] **Node 24.x strict** (`engines.node=24.x`)
- [x] **Fail-fast Node guard** (`preinstall` → `tools/assert_node_contract.mjs`)
- [x] **Fail-fast Vercel guard** (`npm run contracts:verify` → `tools/assert_vercel_contract.mjs`)

## B) Toolchain Determinism

- [x] `npm ci` enforced in Vercel config
- [x] `.npmrc` pins registry + retries + disables audit/fund/progress
- [x] `engine-strict=true` in `.npmrc`
- [x] `vercel.json` overrides install/build commands
- [x] `vercel:preflight` emits `dist/vercel_preflight.report.json` (tiny stdout)
- [x] `.vercelignore` present for CLI deploy hygiene
- [x] Codespaces deploy scripts pin Vercel CLI version (avoid surprise CLI behavior changes)
- [x] GitHub Action `node24-preflight` runs diagnostic build on PRs

## C) SPEL Core Semantics

- [x] κ canonicalization core (stable-json + κ-json)
- [x] RFC8785/JCS smoke support (optional mode)
- [x] `npm run spel:verify` wired into build/test

## D) Periodic Contracts + Stability (meaning doesn’t drift)

- [x] Phase0/Phase1 contracts verification (`periodic:verify`)
- [x] Stability gates:
  - [x] trace stability
  - [x] system order stability
  - [x] compound order stability
- [x] All periodic tools are **CI-safe** (summaries to stdout, full JSON to `dist/`)

## E) Equivalence + Counterexamples

- [x] Weak equivalence tool (`tools/spel_equiv.mjs`)
- [x] Strong equivalence mode (context-sensitive)
- [x] Deterministic digest commitment (`sha256(stable_json(result))`)
- [x] Minimal counterexample harness (`spel:counterexample_minimal`)

## F) Proof Graph (DAG) + Validation

- [x] Proof DAG export (`proof:graph`) → JSON + DOT
- [x] Deterministic digest binding
- [x] Minimality validator (`proof:graph:validate`):
  - [x] no cycles
  - [x] no unknown edge types
  - [x] no orphan artifacts
  - [x] build node is sink

## G) Federation + Immiscibility

- [x] Immiscibility counterexample gate (immiscible domain pairs must fail)

## H) Interop Proof Pack (optional)

- [x] `proof:interop` emits deterministic report
- [x] Optional enable via `KINDRED_INTEROP_ENABLE=1`

## I) Evaluation Pack

- [x] Threat/repro baseline checks (`eval:pack`)
- [x] Artifact inventory + sha256 digests recorded

## J) Runtime Surface (Vercel)

- [x] `/` static page (`public/index.html`)
- [x] `/verify` static verification UI (human-friendly proof inspection)
- [x] `/feedback` static no-custody feedback helper
- [x] `/healthz` minimal uptime endpoint (`{"ok":true}`)
- [x] `/api/health` function
- [x] `/api/proof` function (FS read + URL fallback)

## K) Proof Publishing Portal

- [x] `proof:publish_static` copies selected `dist/` artifacts to `public/proof/`
- [x] `public/proof/index.html` generated
- [x] `public/proof/proof_manifest.v1.json` generated (hash + size)

## L) Target Kits (Option B scaffolding)

- [x] `kits/vercel-node24/kit.json` (authoritative)
- [x] `kits/docker-node24/kit.json` (diagnostic)
- [x] `kits/docker-node24/Dockerfile` (diagnostic runner)
- [x] `kits/docker-node24/README.md` (how to build/run)
- [x] `kits/docker-node24/CONTRACT.md` (authority note)
- [x] `target:pack` emits deterministic kit-pack artifact to `dist/target_packs/**` including kit payload file digests
- [x] `target:pack:all` runs during `npm run build` / `npm test` to ensure packs exist for Vercel static proof publishing
- [x] Negative test: kits cannot weaken kernel contract guard (`npm run kits:negative`)

---

## What is intentionally NOT done (to avoid dead ends)

- [ ] Multi-platform kernel support (explicitly forbidden)
- [ ] “Portability helpers” for non-Vercel runners
- [ ] Full repo exporter (will be a separate, higher layer on top of this kernel)

## Legacy translation tracking

- [x] Legacy parity ledger present (`docs/LEGACY_PARITY_LEDGER.v1.json`)
- [x] Legacy system map snapshot present (`docs/LEGACY_SYSTEM_MAP__patched366.v1.json`)
- [x] Legacy map validation gate present (`npm run legacy:map:validate`)
- [x] `npm run legacy:parity` emits CI-safe progress report to `dist/` (does not block deploy)
- [ ] 100% translation complete (all ledger items status=done)
