#!/usr/bin/env node
/**
 * Legacy system map validator
 * Ensures docs/LEGACY_PARITY_LEDGER.v1.json covers exactly the legacy snapshot
 * in docs/LEGACY_SYSTEM_MAP__patched366.v1.json.
 *
 * Writes dist/legacy_map_validate.report.v1.json
 * Stdout stays tiny.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mapPath = path.join(root, 'docs', 'LEGACY_SYSTEM_MAP__patched366.v1.json');
const ledgerPath = path.join(root, 'docs', 'LEGACY_PARITY_LEDGER.v1.json');

if (!fs.existsSync(mapPath)) {
  console.error('[legacy:map:validate] missing map:', mapPath);
  process.exit(1);
}
if (!fs.existsSync(ledgerPath)) {
  console.error('[legacy:map:validate] missing ledger:', ledgerPath);
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));

const baselineKeys = new Set();

const pages = Array.isArray(map.pages) ? map.pages : [];
for (const r of pages) baselineKeys.add(`page:${r}`);

const handlers = Array.isArray(map.route_handlers) ? map.route_handlers : [];
for (const h of handlers) {
  if (typeof h === 'string') baselineKeys.add(`route:${h}`);
  else if (h && typeof h.route === 'string') baselineKeys.add(`route:${h.route}`);
}

const ledgerItems = Array.isArray(ledger.items) ? ledger.items : [];
const ledgerKeys = new Set();

for (const item of ledgerItems) {
  const kind = item.kind || 'unknown';
  const legacy = item.legacy_path || '';
  if (kind === 'page') {
    const route = legacy.replace(/\/page\.(t|j)sx?$/i, '') || '/';
    ledgerKeys.add(`page:${route}`);
  } else {
    const route = legacy.replace(/\/route\.(t|j)s$/i, '');
    ledgerKeys.add(`route:${route}`);
  }
}

const missing = [...baselineKeys].filter(k => !ledgerKeys.has(k)).sort();
const extra = [...ledgerKeys].filter(k => !baselineKeys.has(k)).sort();

const report = {
  report_version: 'legacy_map_validate.report.v1',
  map_version: map.version || 'unknown',
  ledger_version: ledger.version || 'unknown',
  totals: {
    baseline: baselineKeys.size,
    ledger: ledgerKeys.size,
    missing: missing.length,
    extra: extra.length,
  },
  missing,
  extra,
  ok: missing.length === 0 && extra.length === 0,
};

const distDir = path.join(root, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

const reportPath = path.join(distDir, 'legacy_map_validate.report.v1.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

console.log(`[legacy:map:validate] ok=${report.ok} missing=${missing.length} extra=${extra.length} | report -> ${path.relative(root, reportPath)}`);

if (!report.ok) {
  process.exit(3);
}
