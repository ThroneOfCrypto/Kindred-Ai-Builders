#!/usr/bin/env node
/*
  Proof Graph Validate (Deterministic Core)

  Enforces "graph minimality" so the proof graph cannot silently drift into:
    - dangling edges
    - unknown edge types
    - duplicate nodes/edges
    - orphaned dist artifacts
    - cycles (must remain a DAG)

  Output:
    - dist/proof_graph_validate.report.json

  Default stdout: tiny summary.
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
  const args = { graph: 'dist/proof_graph.v1.json', out: 'dist/proof_graph_validate.report.json', stdoutJson: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--graph') args.graph = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--stdout-json') args.stdoutJson = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        [
          'usage: node tools/proof_graph_validate.mjs [--graph <path>] [--out <path>] [--stdout-json]',
          '',
          'Validates proof graph minimality and emits dist/proof_graph_validate.report.json',
        ].join('\n') +
          '\n'
      );
      process.exit(0);
    }
  }
  return args;
}

function topologicalIsAcyclic(nodes, edges) {
  const indeg = new Map();
  const out = new Map();
  for (const n of nodes) {
    indeg.set(n.id, 0);
    out.set(n.id, []);
  }
  for (const e of edges) {
    if (!out.has(e.from) || !indeg.has(e.to)) continue;
    out.get(e.from).push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const q = [];
  for (const [id, d] of indeg.entries()) if (d === 0) q.push(id);
  q.sort();

  let seen = 0;
  while (q.length) {
    const id = q.shift();
    seen++;
    for (const to of out.get(id) ?? []) {
      const nd = (indeg.get(to) ?? 0) - 1;
      indeg.set(to, nd);
      if (nd === 0) {
        q.push(to);
        q.sort();
      }
    }
  }
  return seen === nodes.length;
}

function validateGraph(graph, fsCwd = process.cwd()) {
  const errors = [];

  if (!graph || typeof graph !== 'object') {
    return { ok: false, errors: ['graph_not_object'] };
  }

  if (graph.schema !== 'kindred.proof_graph.v1') errors.push('schema_mismatch');
  if (typeof graph.root !== 'string' || !graph.root) errors.push('root_missing');

  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  const nodeIds = new Set();
  for (const n of nodes) {
    if (!n || typeof n !== 'object') {
      errors.push('node_not_object');
      continue;
    }
    if (typeof n.id !== 'string' || !n.id) errors.push('node_id_missing');
    if (nodeIds.has(n.id)) errors.push(`duplicate_node:${n.id}`);
    nodeIds.add(n.id);
  }

  if (graph.root && !nodeIds.has(graph.root)) errors.push('root_not_in_nodes');

  // Allowed edge types only.
  const allowedTypes = new Set(['inputs', 'runs', 'emits', 'satisfies', 'violates']);

  const edgeKeySet = new Set();
  for (const e of edges) {
    if (!e || typeof e !== 'object') {
      errors.push('edge_not_object');
      continue;
    }
    if (typeof e.from !== 'string' || typeof e.to !== 'string' || typeof e.type !== 'string') {
      errors.push('edge_fields_missing');
      continue;
    }
    if (!allowedTypes.has(e.type)) errors.push(`edge_type_unknown:${e.type}`);
    if (!nodeIds.has(e.from)) errors.push(`edge_from_missing:${e.from}`);
    if (!nodeIds.has(e.to)) errors.push(`edge_to_missing:${e.to}`);

    const k = `${e.from}|${e.type}|${e.to}`;
    if (edgeKeySet.has(k)) errors.push(`duplicate_edge:${k}`);
    edgeKeySet.add(k);
  }

  // Minimality rule: build node must be a sink (no outgoing edges).
  const buildId = graph.root;
  if (buildId) {
    const outFromBuild = edges.filter((e) => e && e.from === buildId);
    if (outFromBuild.length > 0) errors.push('build_not_sink');
  }

  // Minimality rule: every dist report must exist as node + have an emits edge.
  const distDir = path.resolve(fsCwd, 'dist');
  const distReports = listFiles(distDir, (f) => f.endsWith('.report.json'));
  for (const f of distReports) {
    const pid = 'file:dist/' + f;
    if (!nodeIds.has(pid)) errors.push(`missing_report_node:${f}`);
    const hasEmitter = edges.some((e) => e && e.to === pid && e.type === 'emits');
    if (!hasEmitter) errors.push(`missing_report_emitter_edge:${f}`);
  }

  // Minimality rule: the proof graph should account for its own emission.
  for (const f of ['proof_graph.v1.json', 'proof_graph.v1.dot']) {
    const p = path.join(distDir, f);
    if (!fs.existsSync(p)) continue;
    const pid = 'file:dist/' + f;
    if (!nodeIds.has(pid)) errors.push(`missing_proof_graph_node:${f}`);
    const hasEmitter = edges.some((e) => e && e.to === pid && e.type === 'emits' && e.from === 'tool:proof_graph_export');
    if (!hasEmitter) errors.push(`missing_proof_graph_emitter_edge:${f}`);
  }

  // DAG rule.
  if (!topologicalIsAcyclic(nodes, edges)) errors.push('graph_has_cycle');

  // Canonical ordering: nodes and edges should already be sorted.
  const nodesSorted = [...nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i]?.id !== nodesSorted[i]?.id) {
      errors.push('nodes_not_sorted');
      break;
    }
  }
  const edgesSorted = [...edges]
    .map((e) => stableSortDeep(e))
    .sort((a, b) => `${a.from}|${a.type}|${a.to}`.localeCompare(`${b.from}|${b.type}|${b.to}`));
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i];
    const b = edgesSorted[i];
    if (!a || !b) continue;
    const ka = `${a.from}|${a.type}|${a.to}`;
    const kb = `${b.from}|${b.type}|${b.to}`;
    if (ka !== kb) {
      errors.push('edges_not_sorted');
      break;
    }
  }

  return { ok: errors.length === 0, errors };
}

function runSelfNegativeTests() {
  // If this ever passes, your validator is lying.
  const fake = {
    schema: 'kindred.proof_graph.v1',
    root: 'build:vercel_kernel',
    nodes: [{ id: 'build:vercel_kernel', kind: 'run', label: 'build' }],
    edges: [{ from: 'build:vercel_kernel', to: 'tool:x', type: 'runs' }],
  };
  const res = validateGraph(fake, process.cwd());
  if (res.ok) {
    throw new Error('proof_graph_validate_negative_test_failed: validator accepted an invalid graph');
  }
}

function main() {
  const args = parseArgs(process.argv);
  runSelfNegativeTests();

  const graphPath = path.resolve(process.cwd(), args.graph);
  if (!fs.existsSync(graphPath)) {
    process.stderr.write(`[proof_graph_validate] missing graph file: ${args.graph}\n`);
    process.exit(2);
  }

  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const res = validateGraph(graph, process.cwd());

  const report = {
    ok: res.ok,
    graph_path: args.graph.replace(/\\/g, '/'),
    errors: res.errors,
  };

  const reportCanonical = stableJsonStringify(report);
  report.report_digest_sha256 = sha256Hex(Buffer.from(reportCanonical, 'utf8'));

  const outPath = path.resolve(process.cwd(), args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileAtomic(outPath, JSON.stringify(report, null, 2) + '\n');

  if (args.stdoutJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(
      `[proof_graph_validate] ok=${report.ok} errors=${report.errors.length} -> ${args.out.replace(/\\/g, '/')}\n`
    );
  }

  if (!report.ok) process.exit(2);
}

main();
