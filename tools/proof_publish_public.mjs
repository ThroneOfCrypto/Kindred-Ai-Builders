import fs from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const outDir = path.resolve('public', 'proof');

const allowList = [
  'proof_graph.v1.json',
  'proof_graph.v1.dot',
  'proof_graph_validate.report.json',
  'evaluation_pack.report.json',
  'interop_proof_pack.report.json',
  'periodic_contracts_phase0.report.json',
  'periodic_contracts_phase1.report.json',
  'periodic_trace_stability.report.json',
  'periodic_system_order_stability.report.json',
  'periodic_compound_order_stability.report.json',
  'spel_counterexample_minimal.report.json',
  'spel_federation_immiscibility.report.json',
];

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const copied = [];
  const missing = [];

  for (const f of allowList) {
    const src = path.join(distDir, f);
    const dst = path.join(outDir, f);
    if (await exists(src)) {
      await fs.copyFile(src, dst);
      copied.push(f);
    } else {
      missing.push(f);
    }
  }

  const report = {
    ok: true,
    tool: 'proof_publish_public',
    copied,
    missing,
    outDir: 'public/proof',
  };

  // Emit compact output (CI-safe)
  process.stdout.write(`[proof_publish_public] copied=${copied.length} missing=${missing.length} -> public/proof\n`);

  await fs.writeFile(path.join('dist', 'proof_publish_public.report.json'), JSON.stringify(report, null, 2));
}

await main();
