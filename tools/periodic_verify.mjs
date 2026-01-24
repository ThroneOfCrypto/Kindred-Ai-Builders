import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runOne(indexPath, outJsonPath) {
  const args = [
    "tools/periodic_contracts_check.mjs",
    "--strict",
    "--quiet",
    indexPath,
    "--out-json",
    outJsonPath,
  ];

  const res = spawnSync(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (res.error) throw res.error;

  // Keep stdout/stderr tiny by construction.
  if (res.stdout && res.stdout.trim().length) process.stdout.write(res.stdout);
  if (res.stderr && res.stderr.trim().length) process.stderr.write(res.stderr);

  return res.status ?? 1;
}

function main() {
  const distDir = path.resolve(process.cwd(), "dist");
  fs.mkdirSync(distDir, { recursive: true });

  const phase0Index = "periodic/v1/periodic.index.phase0.v1.json";
  const phase1Index = "periodic/v1/periodic.index.phase1.v1.json";

  const out0 = path.join("dist", "periodic_contracts_phase0.report.json");
  const out1 = path.join("dist", "periodic_contracts_phase1.report.json");

  const s0 = runOne(phase0Index, out0);
  const s1 = runOne(phase1Index, out1);

  if (s0 !== 0 || s1 !== 0) {
    process.exitCode = 2;
    process.stdout.write("[periodic_verify] FAIL (see dist/*.report.json)\n");
    return;
  }
  process.stdout.write("[periodic_verify] PASS (phase0 + phase1)\n");
}

main();
