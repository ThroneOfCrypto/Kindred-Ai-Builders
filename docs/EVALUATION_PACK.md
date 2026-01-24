# Evaluation Pack (Threat Model + Benchmarks + Reproducibility)

This repo is designed to run **on Vercel** under a **Node 24.x** contract.
The Evaluation Pack is a deterministic, CI-safe “health snapshot” emitted on every build/test run.

## What it is

The Evaluation Pack produces:

- `dist/evaluation_pack.report.json`

This file is intentionally compact, stable, and safe to emit in CI (no giant stdout blobs).

## Threat model surface (summary)

This system assumes a **hostile environment** by default. The main failure classes we defend against:

1. **Toolchain drift**
   - unexpected Node runtime changes
   - install behavior changes (`npm install` vs `npm ci`)
   - dependency graph instability

2. **Environment ambiguity**
   - “works locally, fails on Vercel”
   - missing config that is implicitly present in one environment

3. **Nondeterministic meaning**
   - the same system expressed differently producing different hashes / obligations

4. **Log truncation / evidence loss**
   - massive JSON dumps causing CI to truncate logs
   - missing artifacts because output only existed in stdout

5. **Silent bypass of gates**
   - “build passed” without running verification tools

## Reproducibility checks (what we enforce)

The evaluation pack verifies the presence and basic integrity of:

- `package-lock.json` (install determinism)
- `.npmrc` (engine strictness + registry pinning)
- `vercel.json` (installCommand/buildCommand explicit)
- required `dist/*.report.json` artifacts (evidence emitted to disk)

## Lightweight benchmarks (what we measure)

This is not a microbenchmark suite.
We capture low-cost stability indicators that are safe for CI:

- sizes + digests of `dist/*.report.json`
- sizes + digests of evidence outputs (`evidence/*`)
- counts of nodes/edges in `dist/proof_graph.v1.json` (when present)

## How to run

```bash
npm run eval:pack
```
