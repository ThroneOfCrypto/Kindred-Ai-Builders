#!/usr/bin/env node
/*
  Periodic Stability Runner (Deterministic Core)

  Runs the three "stability under harmless perturbation" gates:
    1) Trace Stability
    2) System Order Stability
    3) Compound Order Stability

  Construction rule:
    Default stdout MUST be small. Full artifacts are written to dist/.
    This avoids CI/Vercel log truncation (build logs truncate >4MB). 
*/

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function die(msg) {
  process.stderr.write(String(msg) + "\n");
  process.exit(2);
}

function run(label, args) {
  const cmd = process.execPath;
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  if (res.error) die(`${label} failed: ${res.error}`);
  if (res.status !== 0) {
    die(`${label} failed (status ${res.status})\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || "").trim();
}

function main() {
  const distRoot = path.join(process.cwd(), "dist");
  fs.mkdirSync(distRoot, { recursive: true });

  const outTrace = path.join(distRoot, "periodic_trace_stability.report.json");
  const outSystem = path.join(distRoot, "periodic_system_order_stability.report.json");
  const outCompound = path.join(distRoot, "periodic_compound_order_stability.report.json");

  const traceSummary = run("trace_stability", [
    path.join("tools", "periodic_trace_stability.mjs"),
    "--out",
    outTrace,
  ]);

  const systemSummary = run("system_order_stability", [
    path.join("tools", "periodic_system_order_stability.mjs"),
    "--out",
    outSystem,
  ]);

  const compoundSummary = run("compound_order_stability", [
    path.join("tools", "periodic_compound_order_stability.mjs"),
    "--out",
    outCompound,
  ]);

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        artifacts: {
          trace: "dist/periodic_trace_stability.report.json",
          system_order: "dist/periodic_system_order_stability.report.json",
          compound_order: "dist/periodic_compound_order_stability.report.json",
        },
        summaries: {
          trace: traceSummary ? JSON.parse(traceSummary) : null,
          system_order: systemSummary ? JSON.parse(systemSummary) : null,
          compound_order: compoundSummary ? JSON.parse(compoundSummary) : null,
        },
      },
      null,
      2
    ) + "\n"
  );
}

main();
