# Execution Authority and Lineage

## 1. Execution Authority (Non-Negotiable)

This repository is written **exclusively** for deployment and execution on **Vercel**.

- Vercel is the **sole authoritative execution environment**.
- Any environment that is not Vercel is **non-authoritative**.
- Local machines, Codespaces, CI runners, and other platforms are **not correctness targets**.

Portability is a **non-goal**.
Abstraction over execution platforms is **forbidden**.
Generalization beyond Vercel is **incorrect by definition**.

If this repository fails outside Vercel, that is **expected and correct behavior**.

If Vercel’s execution model changes, this repository adapts.
If another platform exists, this repository ignores it.

---

## 2. Rationale

This system is designed to be **correct by construction**, not flexible by convention.

Modern software failures overwhelmingly come from:
- implicit platform assumptions
- “helpful” portability layers
- build/runtime ambiguity
- CI environments pretending to be production

To eliminate these failure classes, the execution environment must be:
- singular
- explicit
- mechanically enforced

Vercel is treated as part of the system’s physics, not as an interchangeable host.

---

## 3. Lineage and Intent Preservation

This repository is a **deliberate replacement** for an earlier implementation:

Legacy reference:
kindred_ai_builders__v1.1.1__pre_vercel__patched366_node24_strict_vercel_handglove_perfected__2026-01-22.zip

That repository demonstrated the need for:
- Vercel-first execution semantics
- Node 24 strictness
- deterministic behavior
- refusal over recovery

This repository exists to encode those lessons as **law**, not convention.

---

## 4. Rules for All Future Changes

Any change, proposal, or implementation that does **any** of the following is invalid:

- Introduces multi-platform support
- Treats local execution as authoritative
- Abstracts over Vercel-specific behavior
- Weakens Vercel environment checks
- Adds defensive portability

Such changes must be rejected without debate.

This is not a style preference.
It is a structural requirement.

---

## 5. Deterministic Verification Surface

Verification is treated as **construction**, not “best effort”.

The authoritative checks are:

- `npm ci` (with `preinstall` Node-contract guard)

- `npm run spel:verify` (SPEL meaning rules)
- `npm run spel:counterexample_minimal` (Equivalence boundary: weak may hold, strong must respect context)
- `npm run spel:federation_immiscibility_verify` (Federation immiscibility: forbidden domain mixtures must be rejected)
- `npm run periodic:verify` (Periodic Tables + examples contracts)
- `npm run periodic:stability` (Determinism under harmless perturbations)
- `npm run proof:graph` (Proof graph export: digest-bound DAG of inputs, tools, and emitted artifacts)
- `npm run proof:graph:validate` (Proof graph minimality: no cycles, no orphan artifacts, no unknown edge types)
- `npm run proof:interop` (External interop proof pack: emits a deterministic report; optional tooling probes)

Both verifiers are **CI-safe by default**:
- Short stdout summaries only
- Full structured reports emitted to `dist/` when needed

This is not "politeness". It is a hard constraint of production execution.
Vercel build logs can be truncated when they exceed platform limits, so tools must
write detailed artifacts to disk instead of vomiting JSON into stdout.

Why this matters:
- Vercel build logs are automatically truncated if the total size exceeds ~4MB.
  A verifier that prints megabytes of JSON is a verifier that eventually lies.

Interop note:
- External tooling (cosign / in-toto) is **not required** in the Vercel build environment.
- `npm run proof:interop` defaults to **skip mode** and remains deterministic.
- To enable probes in a controlled environment, set `KINDRED_INTEROP_ENABLE=1`.

---

## 6. Instruction to Humans and AI

Before making changes to this repository, you must accept:

- You are not building a general Node.js app.
- You are not optimizing for reuse.
- You are not future-proofing against other platforms.

You are enforcing **correctness within Vercel’s execution model**.

If you disagree with this, you are working on the wrong system.

---

## 7. Option A + Option B (Kernel vs Export Targets)

The legacy system intended both of these to be true:

- **Option A**: this repo remains a strict authoritative kernel (Vercel + Node 24).
- **Option B**: the wider Kindred system can export repos that target non-Vercel environments.

This repository **does not** become multi-platform to satisfy Option B.
Instead, Option B is represented as **Target Kits** that are explicit, hashable artifacts.

See:
- `docs/EXPORT_TARGET_KITS.md`
- `kits/vercel-node24/kit.json`
- `kits/docker-node24/kit.json` (planned)


## Evaluation Pack (Vercel-safe)

The evaluation pack is a deterministic artifact emitter that records:

- threat model surface summary
- reproducibility checks (Node engine strictness, lockfile, npmrc/vercel config)
- lightweight performance baselines (artifact sizes + digests)

Artifact:
- `dist/evaluation_pack.report.json`

Script:
- `npm run eval:pack`


### Runtime surface
This repo includes a minimal Vercel runtime surface: static public/ and /api/health.

The deterministic build publishes selected proof artifacts to public/proof via tools/proof_publish_static.mjs.
For runtime inspection, /api/proof returns the published proof manifest + proof graph digests.


### Contract Guards
- tools/assert_node_contract.mjs (Node 24.x strict)
- tools/assert_vercel_contract.mjs (Vercel-only execution; requires VERCEL=1)
