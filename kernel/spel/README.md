# SPEL (Software Physics Expression Language)

SPEL is the foundational application subsystem.
It exists **on top of** the deterministic kernel and inherits all kernel laws.

Non-negotiables:
- Executes only on Vercel.
- Deterministic by construction.
- Emits evidence for all verification steps.
- No implicit time, randomness, or defaults.
- Kernel authority is absolute.

SPEL is not a library.
It is a governed language runtime.

## What is enforced (currently)

1) **Environment contract**

- Node **24.x** only
- Vercel build/runtime signals required

2) **Core semantics**

- κ: canonicalization into stable, hashable form
- Equivalence: stable equality under κ (semantic sameness)

3) **Context semantics**

- Context is explicit metadata used to evaluate meaning
- Context must be stable and hash-bound

4) **Composition semantics**

- Composition is explicit and strategy-bound (no “helpful” merging)
- See `core/COMPOSITION.md`

## Verification

`npm run spel:verify` runs:

- Environment checks
- Core semantics verifier
- Context semantics verifier
- Composition semantics verifier

All verifiers emit evidence under `evidence/`.
