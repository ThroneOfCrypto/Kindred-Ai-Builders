#!/usr/bin/env node
/**
 * SPEL Federation immiscibility verifier (Deterministic Core)
 *
 * Purpose
 *   Mechanize the "immiscible domain pairs" list from:
 *     periodic/v1/domains/domains.v1.json
 *
 * For each (A,B) pair, construct a minimal compound containing one element
 * from domain A and one element from domain B, then ensure the periodic
 * checker rejects it with an error containing: "domain.immiscible".
 *
 * Output contract (Vercel-safe)
 *   - Writes full report to: dist/spel_federation_immiscibility.report.json
 *   - Writes per-case artifacts under: dist/federation_immiscibility/cases/
 *   - Stdout is small summary JSON only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function die(msg) {
  process.stderr.write(String(msg) + '\n');
  process.exit(2);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function runNode(args) {
  const res = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 50,
  });
  if (res.error) throw res.error;
  return {
    status: res.status ?? null,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function pickElementsByDomain(atomicProps) {
  const map = new Map();
  const props = Array.isArray(atomicProps?.properties) ? atomicProps.properties : [];
  for (const p of props) {
    const d = p?.domain;
    const e = p?.element_id;
    if (typeof d !== 'string' || typeof e !== 'string') continue;
    if (!map.has(d)) map.set(d, e);
  }
  return map;
}

function buildMiniIndex(baseIndex, examplesList, systemsDir, outPath) {
  const idx = JSON.parse(JSON.stringify(baseIndex));
  idx.examples = examplesList;
  if (!idx.systems) idx.systems = {};
  idx.systems.path = path.relative(process.cwd(), systemsDir);
  writeJson(outPath, idx);
}

function main() {
  const repoRoot = process.cwd();

  const domainsPath = path.join(repoRoot, 'periodic', 'v1', 'domains', 'domains.v1.json');
  const atomicPath = path.join(repoRoot, 'periodic', 'v1', 'atoms', 'atomic_properties.v1.json');
  const baseIndexPath = path.join(repoRoot, 'periodic', 'v1', 'periodic.index.phase8.v1.json');

  if (!fs.existsSync(domainsPath)) die(`missing: ${domainsPath}`);
  if (!fs.existsSync(atomicPath)) die(`missing: ${atomicPath}`);
  if (!fs.existsSync(baseIndexPath)) die(`missing: ${baseIndexPath}`);

  const domains = readJson(domainsPath);
  const atomic = readJson(atomicPath);
  const baseIndex = readJson(baseIndexPath);

  const pairs = Array.isArray(domains?.immiscible) ? domains.immiscible : [];
  const elementByDomain = pickElementsByDomain(atomic);

  // If the list is empty, that is allowed, but should be visible.
  const distRoot = path.join(repoRoot, 'dist', 'federation_immiscibility');
  const casesDir = path.join(distRoot, 'cases');
  ensureDir(casesDir);

  const results = [];
  let ok = true;

  for (const pair of pairs) {
    const a = Array.isArray(pair) ? pair[0] : null;
    const b = Array.isArray(pair) ? pair[1] : null;
    if (typeof a !== 'string' || typeof b !== 'string') {
      ok = false;
      results.push({ pair, ok: false, error: 'pair is not [string,string]' });
      continue;
    }

    const elA = elementByDomain.get(a);
    const elB = elementByDomain.get(b);
    if (!elA || !elB) {
      ok = false;
      results.push({ pair: [a, b], ok: false, error: 'no element representative for one of the domains' });
      continue;
    }

    const caseId = `${a}__X__${b}`;
    const caseDir = path.join(casesDir, caseId);
    const systemsDir = path.join(caseDir, 'systems');
    ensureDir(systemsDir);

    const compoundPath = path.join(caseDir, `compound.neg_immiscible.${caseId}.json`);
    const compound = {
      schema: 'periodic.compound.v1',
      id: `compound.neg_immiscible.${caseId}`,
      name: `NEGATIVE: immiscible domains mixed (${a} + ${b})`,
      tables_version: '1',
      elements: [elA, elB],
    };
    writeJson(compoundPath, compound);

    const indexPath = path.join(caseDir, 'mini.index.phase8.v1.json');
    buildMiniIndex(baseIndex, [path.relative(repoRoot, compoundPath)], systemsDir, indexPath);

    const checker = path.join(repoRoot, 'tools', 'periodic_contracts_check.mjs');
    const outReportPath = path.join(caseDir, 'checker.report.json');
    const res = runNode([
      checker,
      indexPath,
      '--strict',
      '--profile',
      'phase8',
      '--out-json',
      outReportPath,
    ]);

    const report = fs.existsSync(outReportPath) ? readJson(outReportPath) : null;
    const errs = Array.isArray(report?.errors) ? report.errors : [];
    const hasImmiscible = errs.some((e) => typeof e === 'string' && e.includes('domain.immiscible'));
    const caseOk = Boolean(report && report.ok === false && hasImmiscible);
    if (!caseOk) ok = false;

    results.push({
      pair: [a, b],
      ok: caseOk,
      element_a: elA,
      element_b: elB,
      checker_exit: res.status,
      checker_ok: report?.ok ?? null,
      errors_count: errs.length,
      has_domain_immiscible: hasImmiscible,
    });
  }

  const out = {
    ok,
    schema: 'spel.federation_immiscibility_report.v1',
    created_utc: new Date().toISOString(),
    pairs_total: pairs.length,
    pairs_verified: results.filter((r) => r.ok).length,
    results,
  };

  // Root report for proof-graph scanning
  const rootReportPath = path.join(repoRoot, 'dist', 'spel_federation_immiscibility.report.json');
  writeJson(rootReportPath, out);

  // Also keep the legacy-style report location for deep inspection
  const legacyStyleReportPath = path.join(distRoot, 'federation_immiscibility_report.json');
  writeJson(legacyStyleReportPath, out);

  process.stdout.write(JSON.stringify({ ok, report: path.relative(repoRoot, rootReportPath) }, null, 2) + '\n');
  process.exit(ok ? 0 : 2);
}

try {
  main();
} catch (e) {
  die(e?.stack || e?.message || String(e));
}
