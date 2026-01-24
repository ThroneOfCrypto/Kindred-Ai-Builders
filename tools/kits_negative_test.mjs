#!/usr/bin/env node

/**
 * kits_negative_test.mjs
 *
 * Negative test: the existence of Target Kits must NOT weaken kernel contracts.
 *
 * Specifically:
 *  - Having kits/docker-node24 in the repo must NOT bypass `contracts:verify`.
 *  - Only Vercel (`VERCEL=1`) is authoritative.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fail(msg) {
  console.error(`[kits:negative] FAIL: ${msg}`);
  process.exit(2);
}

const repoRoot = process.cwd();

// Sanity: docker kit payload must exist (otherwise this negative test is meaningless).
const dockerKitDir = path.join(repoRoot, 'kits', 'docker-node24');
const dockerKitFiles = ['kit.json', 'Dockerfile', 'README.md', 'CONTRACT.md'];
for (const f of dockerKitFiles) {
  const p = path.join(dockerKitDir, f);
  if (!fs.existsSync(p)) fail(`Expected docker kit payload file missing: ${p}`);
}

// Child-process run of the Vercel contract guard in an environment where:
//  - VERCEL is absent
//  - KINDRED_ALLOW_LOCAL_DIAGNOSTIC is absent
// Expected: guard fails with exit code 2.
const guard = path.join(repoRoot, 'tools', 'assert_vercel_contract.mjs');
const env = { ...process.env };
delete env.VERCEL;
delete env.KINDRED_ALLOW_LOCAL_DIAGNOSTIC;

const r = spawnSync(process.execPath, [guard], {
  env,
  encoding: 'utf8'
});

if (r.status !== 2) {
  fail(
    `Expected assert_vercel_contract.mjs to fail (exit 2) when VERCEL is missing. Got status=${r.status}\n` +
      `stdout=${(r.stdout || '').slice(0, 400)}\n` +
      `stderr=${(r.stderr || '').slice(0, 400)}\n`
  );
}

process.stdout.write('[kits:negative] OK: kits cannot bypass kernel Vercel contract guard.\n');
