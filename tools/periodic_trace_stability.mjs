#!/usr/bin/env node
/*
  Trace Stability Check

  Goal:
    Ensure the checker's --trace output is stable under harmless input
    re-ordering (build-context object insertion order).

  Stable identity fields (hostile-reader grade):
    - trace_hash_sha256
    - system_kappa_hashes
    - system_obligations_hashes
    - receipt_hash_sha256

  This is the mechanical version of "determinism is not vibes".

  NOTE (bootstrap doctrine): this is a rehearsal tool; Proof Lane (Node24+registry)
  remains the authority.
*/

import fs from "node:fs";
import path from "node:path";
import { computeTraceStability, getAllPhases, getDefaultPhases } from "./lib/periodic_trace_stability_core.mjs";

function die(msg) {
  process.stderr.write(String(msg) + "\n");
  process.exit(2);
}

function parseArgs(argv) {
  const out = {
    summary: true,
    stdoutJson: false,
    outPath: null,
    onlyProfiles: null,
    allPhases: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--summary") {
      out.summary = true;
      continue;
    }
    if (a === "--stdout-json") {
      out.stdoutJson = true;
      out.summary = false;
      continue;
    }
    if (a === "--out") {
      const p = argv[i + 1];
      if (!p) die("--out requires a path");
      out.outPath = p;
      i++;
      continue;
    }
    if (a === "--profiles") {
      const v = argv[i + 1];
      if (!v) die("--profiles requires a comma-separated value");
      out.onlyProfiles = v.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
      continue;
    }
    if (a === "--all-phases") {
      out.allPhases = true;
      continue;
    }
    die("unknown arg: " + a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const phases = args.allPhases ? getAllPhases() : getDefaultPhases();

  let result;
  try {
    result = await computeTraceStability({
      phases,
      onlyProfiles: args.onlyProfiles || undefined,
    });
  } catch (e) {
    die(e && e.message ? e.message : String(e));
  }

  // Optional full artifact write
  if (args.outPath) {
    const abs = path.resolve(process.cwd(), args.outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(result, null, 2) + "\n", "utf8");
  }

  if (args.stdoutJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  // Default behavior: small, CI-safe summary.
  const profiles = (result.cases || []).map((c) => c.profile);
  const failed = (result.cases || []).filter((c) => c && c.ok === false).map((c) => c.profile);
  process.stdout.write(
    JSON.stringify(
      {
        ok: result.ok === true,
        profiles,
        failed_profiles: failed,
        cases_total: profiles.length,
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((e) => die(e && e.message ? e.message : String(e)));
