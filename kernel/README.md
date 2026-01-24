# Application Layer (Vercel-Only)

This directory contains application logic that runs **on top of**
the deterministic kernel.

Rules:
- Runs only on Vercel.
- Must obey all kernel contracts.
- Must emit evidence for all checks.
- Must not weaken or bypass kernel enforcement.

Anything that violates these rules does not belong here.
