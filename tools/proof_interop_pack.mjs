#!/usr/bin/env node
/*
  External Interop Proof Pack (Deterministic Core)

  Purpose:
    Provide a deterministic, Vercel-safe "interop surface" that can be used
    to prove this repo's evidence artifacts can be consumed by external tools
    (cosign / in-toto style ecosystems) WITHOUT making those tools mandatory
    in the Vercel build environment.

  Contract:
    - Default behavior is SKIP (ok=true, skipped=true).
    - When enabled (KINDRED_INTEROP_ENABLE=1), we probe for external tooling
      and emit a report that is still deterministic and log-safe.

  Why:
    Vercel builders are intentionally minimal. Installing cosign in the build
    step would reintroduce toolchain drift. So we treat external interop as
    an *optional, explicitly enabled* proof pack.

  Output:
    - dist/interop_proof_pack.report.json
*/

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function writeFileAtomic(outPath, data) {
  const tmp = outPath + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, outPath);
}

function smallSpawn(cmd, args) {
  // Keep outputs small to avoid CI buffer drama.
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout || '').trim().slice(0, 1000),
    stderr: (r.stderr || '').trim().slice(0, 1000),
  };
}

function main() {
  const distDir = path.resolve(process.cwd(), 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  const enabled = process.env.KINDRED_INTEROP_ENABLE === '1';

  const report = {
    ok: true,
    skipped: !enabled,
    mode: enabled ? 'enabled' : 'skipped',
    notes: [],
    probes: {},
  };

  if (!enabled) {
    report.notes.push('Interop pack skipped (set KINDRED_INTEROP_ENABLE=1 to enable probes).');
  } else {
    // Probe for cosign presence. If absent, we fail deterministically.
    const cosign = smallSpawn('cosign', ['version']);
    report.probes.cosign = cosign;
    if (!cosign.ok) {
      report.ok = false;
      report.notes.push('cosign not available in environment. Install cosign and re-run with KINDRED_INTEROP_ENABLE=1.');
    } else {
      report.notes.push('cosign detected. This pack currently validates tool availability only (no signing performed on Vercel).');
    }

    // Probe for in-toto tooling presence (best-effort). Many environments will not have it.
    const intoto = smallSpawn('in-toto-run', ['--help']);
    report.probes.in_toto_run = intoto;
    if (!intoto.ok) {
      report.notes.push('in-toto-run not detected (optional).');
    } else {
      report.notes.push('in-toto-run detected (optional).');
    }
  }

  const outPath = path.join(distDir, 'interop_proof_pack.report.json');
  writeFileAtomic(outPath, JSON.stringify(report, null, 2) + '\n');

  // Tiny stdout summary.
  process.stdout.write(`[proof:interop] ok=${report.ok} skipped=${report.skipped} -> dist/interop_proof_pack.report.json\n`);
  process.exit(report.ok ? 0 : 2);
}

main();
