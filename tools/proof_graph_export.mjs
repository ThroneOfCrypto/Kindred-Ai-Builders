#!/usr/bin/env node
/*
  Proof Graph Export (Deterministic Core)

  Exports a deterministic DAG that binds:
    - inputs (package-lock)
    - verifiers (SPEL + Periodic)
    - emitted artifacts (dist/*.report.json, evidence/*)

  Construction rules:
    - No timestamps.
    - Stable sorting everywhere.
    - Default stdout is small.
    - Full graph written to dist/ by default.

  Output:
    - dist/proof_graph.v1.json
    - dist/proof_graph.v1.dot
*/

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function stableSortDeep(x) {
  if (Array.isArray(x)) return x.map(stableSortDeep);
  if (x && typeof x === 'object') {
    const out = {};
    for (const k of Object.keys(x).sort()) out[k] = stableSortDeep(x[k]);
    return out;
  }
  return x;
}

function stableJsonStringify(obj) {
  return JSON.stringify(stableSortDeep(obj));
}

function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listFiles(dir, pred = () => true) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => pred(f))
    .sort();
}

function writeFileAtomic(outPath, data) {
  const tmp = outPath + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, outPath);
}

function parseArgs(argv) {
  const args = { out: 'dist/proof_graph.v1.json', dot: 'dist/proof_graph.v1.dot', stdoutJson: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--dot') args.dot = argv[++i];
    else if (a === '--stdout-json') args.stdoutJson = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        [
          'usage: node tools/proof_graph_export.mjs [--out <path>] [--dot <path>] [--stdout-json]',
          '',
          'Default writes: dist/proof_graph.v1.json + dist/proof_graph.v1.dot',
          'Default stdout: tiny summary (graph digest + counts)',
        ].join('\n') + '\n'
      );
      process.exit(0);
    }
  }
  return args;
}

function makeNode({ id, kind, label, pathRef = null, ok = null, digest_sha256 = null }) {
  // Strip nulls for minimal, hash-stable output.
  const n = { id, kind, label };
  if (pathRef !== null) n.path = pathRef;
  if (ok !== null) n.ok = ok;
  if (digest_sha256 !== null) n.digest_sha256 = digest_sha256;
  return n;
}

function makeEdge({ from, to, type, note = null }) {
  const e = { from, to, type };
  if (note !== null) e.note = note;
  return e;
}

function idForPath(p) {
  return 'file:' + p.replace(/\\/g, '/');
}

function dotEscape(s) {
  return String(s).replace(/"/g, '\\"');
}

function main() {
  const args = parseArgs(process.argv);

  const distDir = path.resolve(process.cwd(), 'dist');
  const evidenceDir = path.resolve(process.cwd(), 'evidence');
  fs.mkdirSync(distDir, { recursive: true });

  const nodes = [];
  const edges = [];

  // Build node: deterministic identity of this run boundary.
  const buildNode = makeNode({
    id: 'build:vercel_kernel',
    kind: 'run',
    label: 'Vercel kernel build surface',
  });
  nodes.push(buildNode);

  // Input contract: lockfile
  const lockPath = 'package-lock.json';
  if (fs.existsSync(lockPath)) {
    const lockBuf = fs.readFileSync(lockPath);
    const lockNode = makeNode({
      id: idForPath(lockPath),
      kind: 'input',
      label: 'package-lock.json',
      pathRef: lockPath,
      digest_sha256: sha256Hex(lockBuf),
    });
    nodes.push(lockNode);
    edges.push(makeEdge({ from: lockNode.id, to: buildNode.id, type: 'inputs' }));
  }

  // Tool nodes (deterministic set)
  const toolIds = [['tool:contracts_verify', 'Contracts verify (Vercel-only guard)'],
    ['tool:spel_verify', 'SPEL verify'],
    ['tool:spel_counterexample_minimal', 'SPEL counterexample minimal'],
    ['tool:spel_federation_immiscibility_verify', 'SPEL federation immiscibility verify'],
    ['tool:periodic_verify', 'Periodic verify'],
    ['tool:periodic_stability', 'Periodic stability'],
    ['tool:proof_interop_pack', 'External interop proof pack (optional)'],
    ['tool:evaluation_pack', 'Evaluation pack'],
    ['tool:proof_publish_static', 'Publish static proof artifacts'],
    ['tool:evidence_emit', 'Evidence emit'],
    ['tool:evidence_manifest', 'Evidence manifest'],
    ['tool:proof_graph_export', 'Proof graph export'],
    ['tool:proof_graph_validate', 'Proof graph validate'],
    ['tool:build_pipeline', 'Build pipeline (fallback attribution)'],
  ];
  for (const [id, label] of toolIds) {
    nodes.push(makeNode({ id, kind: 'tool', label }));
    // Direction chosen to preserve DAG: tool -> build.
    edges.push(makeEdge({ from: id, to: buildNode.id, type: 'runs' }));
  }

  // Dist reports
  const reportFiles = listFiles('dist', (f) => f.endsWith('.report.json'));
  for (const f of reportFiles) {
    const p = path.join('dist', f);
    const buf = fs.readFileSync(p);
    const json = readJsonIfExists(p);
    const ok = json && typeof json.ok === 'boolean' ? json.ok : null;
    const n = makeNode({
      id: idForPath(p),
      kind: 'artifact',
      label: f,
      pathRef: p,
      ok,
      digest_sha256: sha256Hex(buf),
    });
    nodes.push(n);

    // Satisfaction edges: reports that explicitly carry ok=true/false
    if (ok === true) edges.push(makeEdge({ from: n.id, to: buildNode.id, type: 'satisfies' }));
    if (ok === false) edges.push(makeEdge({ from: n.id, to: buildNode.id, type: 'violates' }));

    // Best-effort attribution to a tool node.
    if (f.includes('periodic_contracts')) edges.push(makeEdge({ from: 'tool:periodic_verify', to: n.id, type: 'emits' }));
    else if (f.includes('periodic_trace_stability')) edges.push(makeEdge({ from: 'tool:periodic_stability', to: n.id, type: 'emits' }));
    else if (f.includes('periodic_system_order_stability')) edges.push(makeEdge({ from: 'tool:periodic_stability', to: n.id, type: 'emits' }));
    else if (f.includes('periodic_compound_order_stability')) edges.push(makeEdge({ from: 'tool:periodic_stability', to: n.id, type: 'emits' }));
    else if (f.includes('spel_counterexample')) edges.push(makeEdge({ from: 'tool:spel_counterexample_minimal', to: n.id, type: 'emits' }));
    else if (f.includes('spel_federation_immiscibility'))
      edges.push(makeEdge({ from: 'tool:spel_federation_immiscibility_verify', to: n.id, type: 'emits' }));
    else if (f.includes('evaluation_pack')) edges.push(makeEdge({ from: 'tool:evaluation_pack', to: n.id, type: 'emits' }));
    else if (f.includes('interop_proof_pack')) edges.push(makeEdge({ from: 'tool:proof_interop_pack', to: n.id, type: 'emits' }));
    else if (f.includes('proof_publish_static')) edges.push(makeEdge({ from: 'tool:proof_publish_static', to: n.id, type: 'emits' }));
    else if (f.includes('proof_graph_validate')) edges.push(makeEdge({ from: 'tool:proof_graph_validate', to: n.id, type: 'emits' }));
    else edges.push(makeEdge({ from: 'tool:build_pipeline', to: n.id, type: 'emits' }));
  }

  // Proof graph artifacts themselves (declared up-front).
  // We intentionally do NOT hash these here to avoid recursive self-digests.
  for (const f of ['proof_graph.v1.json', 'proof_graph.v1.dot']) {
    const p = path.join('dist', f);
    const n = makeNode({
      id: idForPath(p),
      kind: 'artifact',
      label: f,
      pathRef: p,
      digest_sha256: null,
    });
    nodes.push(n);
    edges.push(makeEdge({ from: 'tool:proof_graph_export', to: n.id, type: 'emits' }));
  }

  // Evidence files
  const evidenceFiles = listFiles('evidence', (f) => f.endsWith('.json') || f.endsWith('.sha256'));
  for (const f of evidenceFiles) {
    const p = path.join('evidence', f);
    const buf = fs.readFileSync(p);
    const n = makeNode({
      id: idForPath(p),
      kind: 'evidence',
      label: f,
      pathRef: p,
      digest_sha256: sha256Hex(buf),
    });
    nodes.push(n);
    if (f === 'manifest.json') edges.push(makeEdge({ from: 'tool:evidence_manifest', to: n.id, type: 'emits' }));
    else edges.push(makeEdge({ from: 'tool:evidence_emit', to: n.id, type: 'emits' }));
  }

  // Deterministic graph identity
  const graph = {
    schema: 'kindred.proof_graph.v1',
    root: buildNode.id,
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges
      .map((e) => stableSortDeep(e))
      .sort((a, b) => {
        const ka = `${a.from}|${a.type}|${a.to}`;
        const kb = `${b.from}|${b.type}|${b.to}`;
        return ka.localeCompare(kb);
      }),
  };

  const graphCanonical = stableJsonStringify(graph);
  const graphDigest = sha256Hex(Buffer.from(graphCanonical, 'utf8'));

  // Write JSON + DOT
  const outJson = path.resolve(process.cwd(), args.out);
  const outDot = path.resolve(process.cwd(), args.dot);
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.mkdirSync(path.dirname(outDot), { recursive: true });

  writeFileAtomic(outJson, JSON.stringify({ ...graph, graph_digest_sha256: graphDigest }, null, 2) + '\n');

  const dotLines = [];
  dotLines.push('digraph proof_graph {');
  dotLines.push('  rankdir=LR;');
  for (const n of graph.nodes) {
    const label = `${n.label}${n.ok === null ? '' : n.ok ? '\\nOK' : '\\nFAIL'}`;
    dotLines.push(`  "${dotEscape(n.id)}" [label="${dotEscape(label)}"];`);
  }
  for (const e of graph.edges) {
    dotLines.push(`  "${dotEscape(e.from)}" -> "${dotEscape(e.to)}" [label="${dotEscape(e.type)}"];`);
  }
  dotLines.push('}');
  writeFileAtomic(outDot, dotLines.join('\n') + '\n');

  // Default stdout: compact summary
  const summary = {
    ok: true,
    graph_digest_sha256: graphDigest,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    out_json: path.relative(process.cwd(), outJson).replace(/\\/g, '/'),
    out_dot: path.relative(process.cwd(), outDot).replace(/\\/g, '/'),
  };

  if (args.stdoutJson) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    process.stdout.write(
      `[proof_graph_export] digest=${graphDigest} nodes=${summary.nodes} edges=${summary.edges} -> ${summary.out_json}\n`
    );
  }
}

main();
