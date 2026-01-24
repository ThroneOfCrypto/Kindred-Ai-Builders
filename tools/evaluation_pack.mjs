#!/usr/bin/env node
/**
 * Evaluation Pack (Vercel-safe)
 *
 * Emits a deterministic snapshot that helps answer:
 * - what environment did this run under?
 * - were reproducibility constraints present?
 * - what evidence artifacts exist, and what are their stable digests?
 *
 * Output:
 *   dist/evaluation_pack.report.json
 *
 * Contract:
 * - stdout is compact (single summary line)
 * - full payload is written to disk
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function stableStringify(value) {
  // Minimal deterministic JSON (sorted keys).
  // Avoids depending on app internals so this tool can run even if the app changes.
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function readJsonIfExists(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function fileInfo(p) {
  try {
    const b = fs.readFileSync(p);
    return {
      path: p.replace(/\\/g, '/'),
      bytes: b.length,
      sha256: sha256Hex(b),
    };
  } catch {
    return null;
  }
}

function listFilesRecursive(dir, predicate) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!predicate || predicate(full)) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

function parseArgs(argv) {
  const args = { out: 'dist/evaluation_pack.report.json' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
  }
  return args;
}

function main() {
  const t0 = Date.now();
  const args = parseArgs(process.argv);

  const requiredFiles = [
    'package-lock.json',
    '.npmrc',
    'vercel.json',
    'package.json',
  ];

  const presence = Object.fromEntries(requiredFiles.map(f => [f, fs.existsSync(f)]));

  const pkg = readJsonIfExists('package.json');
  const lock = readJsonIfExists('package-lock.json');

  const distReports = listFilesRecursive('dist', (p) => p.endsWith('.report.json'))
    .map(p => fileInfo(p))
    .filter(Boolean);

  const evidenceFiles = listFilesRecursive('evidence', (p) => !p.endsWith('.DS_Store'))
    .map(p => fileInfo(p))
    .filter(Boolean);

  const proofGraph = fileInfo('dist/proof_graph.v1.json');
  let proofGraphMeta = null;
  if (proofGraph && fs.existsSync('dist/proof_graph.v1.json')) {
    const g = readJsonIfExists('dist/proof_graph.v1.json');
    if (g && Array.isArray(g.nodes) && Array.isArray(g.edges)) {
      proofGraphMeta = { nodes: g.nodes.length, edges: g.edges.length, digest: proofGraph.sha256 };
    }
  }

  // Minimum expectations: if build/test ran, we should have at least one dist report.
  const expectations = {
    node_engine_declared: Boolean(pkg?.engines?.node),
    lockfile_declared: Boolean(lock?.lockfileVersion),
    vercel_install_explicit: fs.existsSync('vercel.json'),
    dist_reports_present: distReports.length > 0,
  };

  // This pack should be runnable standalone. We do not require dist reports to exist.
  const ok = Object.values(presence).every(Boolean) && expectations.node_engine_declared && expectations.lockfile_declared && expectations.vercel_install_explicit;

  const report = {
    ok,
    kind: 'evaluation_pack.v1',
    repo: {
      name: pkg?.name ?? null,
      version: pkg?.version ?? null,
      engines_node: pkg?.engines?.node ?? null,
    },
    env: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus()?.length ?? null,
      vercel: Boolean(process.env.VERCEL),
      vercel_env: process.env.VERCEL_ENV ?? null,
    },
    checks: {
      required_files_present: presence,
      expectations,
    },
    artifacts: {
      dist_reports: distReports,
      evidence: evidenceFiles,
      proof_graph: proofGraphMeta,
    },
    timing_ms: {
      total: Date.now() - t0,
    },
  };

  const payload = stableStringify(report);
  const payloadDigest = sha256Hex(Buffer.from(payload, 'utf8'));

  // emit
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify({ ...report, digest_sha256: payloadDigest }, null, 2) + '\n', 'utf8');

  process.stdout.write(`[evaluation_pack] ok=${ok} digest=${payloadDigest.slice(0, 12)} out=${args.out}\n`);
  process.exit(ok ? 0 : 2);
}

main();
