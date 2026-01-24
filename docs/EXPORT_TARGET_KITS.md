# Export Target Kits (Option A + Option B)

The legacy Kindred system intended two truths to coexist:

- **Option A (Kernel Lane)**: one strict execution contract treated as authoritative.
- **Option B (Export Lanes)**: users can export repos that target other environments and may *not* run on Vercel.

This repository implements **Option A** as a deterministic kernel and preserves **Option B** as an explicit design rule.

---

## 1) What a Target Kit is

A **Target Kit** is a deterministic, hashable declaration of:

- the execution contract (platform, runtime, Node version)
- the required commands (`npm ci`, `npm run build`, `npm test`)
- the required environment variables
- what counts as **authoritative proof** for that target
- where evidence artifacts must be emitted

Target Kits exist to prevent the most common failure mode in software export systems:

> exporting a repo with no explicit contract, then treating any successful run anywhere as “proof”.

---

## 2) What this repo provides

This repo is the **reference kernel** for the first authoritative kit:

- `kits/vercel-node24/kit.json` (authoritative)

It also defines a placeholder kit for future export lanes:

- `kits/docker-node24/kit.json` (planned)

---

## 3) Authority rules (how Option A and B both stay true)

### Kernel Lane (Option A)

- authoritative environment: **Vercel**
- contract: **Node 24.x**
- enforced by: `tools/assert_vercel_contract.mjs` and `tools/assert_node_contract.mjs`

If this repo runs outside Vercel, that is **non-authoritative diagnostics**, not proof.

### Export Lanes (Option B)

Exports may target other environments.

However, an export is only valid if it includes:

- a Target Kit declaration
- a contract guard for that target (or an explicit statement that it is non-authoritative)
- deterministic evidence rules

In other words:

- **exports can target anything**
- but **authority must be explicit**

---

## 4) Why this is not contradictory

Option A is required to keep the system provable.

Option B is required to keep the system useful.

Without Option A: every target becomes “works somewhere, trust me”.

Without Option B: the system becomes a Vercel-only product builder, which is not the legacy intent.

---

## 5) How future targets should be added

1. Create a new kit under `/kits/<target-id>/kit.json`
2. Add a target-specific contract guard tool
3. Add target-specific evidence emission + verification
4. Ensure exports include the kit + guard + evidence rules

No target should be added as a “flag”, “setting”, or “if/else branch”.
Targets must be **artifact-defined** and independently auditable.
