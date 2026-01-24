#!/usr/bin/env node

/**
 * Kindred Deterministic Core
 * Execution contract guard.
 *
 * Default:
 *  - If running on Vercel (VERCEL=1): enforce the authoritative executor contract.
 *  - Otherwise: allow local/dev execution but mark it as NON-AUTHORITATIVE.
 *
 * Motivation:
 *  - Prevent "works locally, fails on Vercel" drift.
 *  - Make the execution authority mechanically explicit.
 */

function fail(msg) {
  console.error(`[kindred:contract:vercel] FAIL: ${msg}`);
  process.exit(2);
}

const vercelFlag = process.env.VERCEL;

// Non-authoritative lane: do not fail. We allow local/dev and keep logs tiny.
if (!vercelFlag) {
  console.error('[kindred:contract:vercel] NOTE: Not running on Vercel (missing VERCEL=1).');
  console.error('[kindred:contract:vercel] NOTE: Results are NON-AUTHORITATIVE outside Vercel Node 24.x.');
  process.exit(0);
}

// Authoritative lane: require VERCEL=1 and Node 24.x.
if (vercelFlag !== '1') {
  fail(`Expected process.env.VERCEL to be '1', got '${vercelFlag}'.`);
}

const major = Number(String(process.versions.node).split('.')[0]);
if (major !== 24) {
  fail(`Vercel authoritative contract requires Node 24.x, got Node ${process.versions.node}.`);
}

console.error('[kindred:contract:vercel] OK: Authoritative contract satisfied (VERCEL=1, Node 24.x).');
