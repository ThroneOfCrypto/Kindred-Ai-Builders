#!/usr/bin/env node

/**
 * Vercel preflight (CI-safe, tiny stdout).
 *
 * Produces a stable report in dist/** and catches obvious contract drift.
 *
 * This is diagnostic only.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function sha256File(fp) {
  const buf = fs.readFileSync(fp);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function fail(msg) {
  console.error(`[kindred:vercel:preflight] FAIL: ${msg}`);
  process.exit(2);
}

const repoRoot = process.cwd();

const pkgPath = path.join(repoRoot, 'package.json');
const lockPath = path.join(repoRoot, 'package-lock.json');

if (!fs.existsSync(pkgPath)) fail('Missing package.json');
if (!fs.existsSync(lockPath)) fail('Missing package-lock.json (Vercel expects deterministic installs via npm ci).');

const pkg = readJson(pkgPath);
const enginesNode = pkg?.engines?.node;
if (enginesNode !== '24.x') {
  fail(`Expected package.json engines.node = "24.x", got ${JSON.stringify(enginesNode)}`);
}

const nodeVersion = process.version;
const major = Number(String(nodeVersion).replace(/^v/, '').split('.')[0]);

// This is informational only: the actual gate is tools/assert_node_contract.mjs
const nodeContractOk = major === 24;

const distDir = path.join(repoRoot, 'dist');
ensureDir(distDir);

const report = {
  schema: 'kindred.vercel_preflight.v1',
  node: {
    version: nodeVersion,
    major,
    contract_major_required: 24,
    contract_ok: nodeContractOk
  },
  npm: {
    user_agent: process.env.npm_config_user_agent || null
  },
  vercel: {
    VERCEL: process.env.VERCEL || null,
    VERCEL_ENV: process.env.VERCEL_ENV || null,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF || null
  },
  lockfile: {
    path: 'package-lock.json',
    sha256: sha256File(lockPath)
  }
};

const outPath = path.join(distDir, 'vercel_preflight.report.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

// Tiny stdout on purpose.
console.error('[kindred:vercel:preflight] OK: wrote dist/vercel_preflight.report.json');
