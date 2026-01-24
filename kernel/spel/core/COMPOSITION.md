# SPEL Composition (Explicit, Deterministic)

Composition is where systems usually start "helpfully" merging things until the meaning is a smear.
SPEL treats composition as a *first-class, strategy-bound operation*.

## Goal

Given two meaning objects **A** and **B**, produce a composed meaning **C** such that:

1. **Deterministic**: same inputs + same strategy => same output
2. **Non-magical**: no implicit overrides
3. **Auditable**: composition emits evidence of what happened
4. **Fail-closed** by default: conflicts are errors unless a strategy explicitly permits them

## Strategies

SPEL supports a small strategy set (expand only with evidence + tests):

- **DenyOverrides** (default):
  - if both sides set the same key with different values => error
- **PermitOverrides**:
  - B wins on conflicts
- **OnlyOneApplicable**:
  - if both sides set the same key (even equal) => error

## Proof obligation

Every composition must emit an evidence record:

- `strategy`
- `inputs_hash` (hash of canonical A + canonical B + strategy)
- `output_hash` (hash of canonical C)
- `conflicts` (if any) and how they were resolved

In this repo, `app/spel/core/verify_composition.mjs` writes such evidence into `evidence/`.

## Why this matters

Most software breaks its own invariants via "harmless" merges (configs, policies, schemas, rulesets).
Explicit composition rules let you reason about the system like physics, not vibes.
