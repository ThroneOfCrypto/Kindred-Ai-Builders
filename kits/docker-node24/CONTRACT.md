# Docker Node 24 Kit Contract Note

This repository is a **Vercel-authoritative deterministic kernel**.

Kernel authority rule:

- ✅ **Authoritative:** Vercel execution (`VERCEL=1`)
- ⚠️ **Non-authoritative:** Docker execution

## What this kit changes

Nothing in the kernel.

This kit only provides a Dockerfile so you can run the kernel commands under a clean Node 24 environment.

To make that possible, the Dockerfile sets:

- `KINDRED_ALLOW_LOCAL_DIAGNOSTIC=1`

This is an explicit diagnostic escape hatch already supported by the kernel contract guard.
It does **not** grant Docker authority, and it must never be enabled implicitly.

## What this kit must NOT do

- It must NOT set `VERCEL=1`.
- It must NOT patch, replace, or influence kernel contracts.
- It must NOT be consulted by `contracts:verify` (or any other kernel gate).

If Docker output disagrees with Vercel, **Vercel wins**.
