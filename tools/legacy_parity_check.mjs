#!/usr/bin/env node
/**
 * Legacy parity checker
 * - Reads docs/LEGACY_PARITY_LEDGER.v1.json
 * - Validates ledger coverage vs docs/LEGACY_SYSTEM_MAP__patched366.v1.json
 * - Writes dist/legacy_parity.report.v1.json
 * - By default: exits 0 (diagnostic) so kernel deploy is never blocked mid-translation.
 * - With --strict: exits 2 if not 100% complete.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const STRICT = process.argv.includes('--strict');

const root = process.cwd();
const ledgerPath = path.join(root, 'docs', 'LEGACY_PARITY_LEDGER.v1.json');

// First: ensure the ledger still fully covers the legacy snapshot.
// This prevents “drift by omission” across context windows.
const validate = spawnSync(
  process.execPath,
  [path.join(root, 'tools', 'legacy_map_validate.mjs')],
  { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
);

// Keep stdout tiny but surface errors.
if (validate.stdout) process.stdout.write(validate.stdout);
if (validate.status !== 0) {
  if (validate.stderr) process.stderr.write(validate.stderr);
  console.error('[legacy:parity] map validation failed. Ledger does not match legacy snapshot.');
  process.exit(3);
}

if (!fs.existsSync(ledgerPath)) {
  console.error('[legacy:parity] missing ledger:', ledgerPath);
  process.exit(1);
}

const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const items = Array.isArray(ledger.items) ? ledger.items : [];

const total = items.length;
const done = items.filter(i => i.status === 'done').length;
const mapped = items.filter(i => i.status !== 'unmapped').length;
const unmapped = total - mapped;

const pctDone = total === 0 ? 100 : Math.round((done / total) * 1000) / 10;
const pctMapped = total === 0 ? 100 : Math.round((mapped / total) * 1000) / 10;

const report = {
  report_version: 'legacy_parity.report.v1',
  ledger_version: ledger.version || 'unknown',
  totals: { total, done, mapped, unmapped },
  percent: { done: pctDone, mapped: pctMapped },
  is_complete: done === total,
  strict: STRICT,
};

const distDir = path.join(root, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const reportPath = path.join(distDir, 'legacy_parity.report.v1.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

// Keep stdout tiny.
console.log(`[legacy:parity] done ${done}/${total} (${pctDone}%) | mapped ${mapped}/${total} (${pctMapped}%) | report -> ${path.relative(root, reportPath)}`);

if (STRICT && done !== total) {
  console.error('[legacy:parity] STRICT mode: translation is not 100% complete.');
  process.exit(2);
}
