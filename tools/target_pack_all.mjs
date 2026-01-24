#!/usr/bin/env node
/**
 * target_pack_all.mjs
 *
 * Deterministically emits Target Kit Packs for *all* kits in /kits.
 *
 * Why:
 * - Target kits are the non-Vercel export lane (Option B).
 * - If we publish proof artifacts on Vercel, the packs must exist during `npm run build`.
 * - This tool keeps output tiny and writes a full report to dist/.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fail(msg) {
  console.error(`[target_pack_all] FAIL: ${msg}`);
  process.exit(2);
}

const root = process.cwd();
const kitsDir = path.join(root, 'kits');
if (!fs.existsSync(kitsDir)) fail(`missing kits dir: ${kitsDir}`);

const kitIds = fs
  .readdirSync(kitsDir)
  .filter((name) => {
    const full = path.join(kitsDir, name);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'kit.json'));
  })
  .sort();

const outRoot = path.join(root, 'dist', 'target_packs');
fs.mkdirSync(outRoot, { recursive: true });

const results = [];

for (const kitId of kitIds) {
  const r = spawnSync(process.execPath, [path.join(root, 'tools', 'target_pack.mjs'), '--kit', kitId], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (r.error) fail(`spawn error for kit ${kitId}: ${r.error.message}`);
  if (r.status !== 0) {
    const stderr = (r.stderr || '').slice(0, 1000);
    fail(`kit ${kitId} failed with status ${r.status}. stderr: ${stderr}`);
  }

  const packPath = path.join(outRoot, kitId, 'target_kit_pack.v1.json');
  if (!fs.existsSync(packPath)) fail(`expected pack missing for kit ${kitId}: ${packPath}`);

  const packBuf = fs.readFileSync(packPath);
  results.push({
    kit_id: kitId,
    pack_path: path.relative(root, packPath).replace(/\\/g, '/'),
    bytes: packBuf.length,
    sha256: sha256(packBuf),
  });
}

const report = {
  ok: true,
  tool: 'target_pack_all',
  kits: results.slice().sort((a, b) => a.kit_id.localeCompare(b.kit_id)),
};

const reportPath = path.join(outRoot, 'target_pack_all.report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

process.stdout.write(`[target_pack_all] kits=${results.length} -> dist/target_packs/**\n`);
