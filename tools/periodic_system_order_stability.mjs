#!/usr/bin/env node
/*
  System Order Stability Check

  Goal:
    Ensure the checker output is stable under harmless *internal ordering*
    changes inside system JSON examples.

  Why this exists:
    "System-of-compounds" is where determinism usually dies first.
    Humans (and serializers) reorder arrays like "compounds" and "links".
    If receipts change because list order changed, SPEL isn't deterministic.

  Stable identity fields:
    - trace_hash_sha256
    - system_kappa_hashes
    - system_obligations_hashes
    - receipt_hash_sha256

  What we perturb:
    - system.compounds (reversed)
    - system.links (reversed)

  NOTE (bootstrap doctrine): this is a rehearsal tool; Proof Lane (Node24+registry)
  remains the authority.
*/

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

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

function readJson(p) {
  const abs = path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) die(`missing file: ${p}`);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function snapshotFromReport(report, profile) {
  if (!report.trace_hash_sha256) die(`missing trace_hash_sha256 for ${profile}`);
  if (!report.receipt_hash_sha256) die(`missing receipt_hash_sha256 for ${profile}`);

  const kappa = Array.isArray(report.system_kappa_hashes) ? report.system_kappa_hashes : [];
  const oblig = Array.isArray(report.system_obligations_hashes) ? report.system_obligations_hashes : [];

  return {
    trace_hash_sha256: String(report.trace_hash_sha256),
    system_kappa_hashes: kappa,
    system_obligations_hashes: oblig,
    receipt_hash_sha256: String(report.receipt_hash_sha256),
  };
}

function sameSnapshot(a, b) {
  return (
    a.trace_hash_sha256 === b.trace_hash_sha256 &&
    JSON.stringify(a.system_kappa_hashes) === JSON.stringify(b.system_kappa_hashes) &&
    JSON.stringify(a.system_obligations_hashes) === JSON.stringify(b.system_obligations_hashes) &&
    a.receipt_hash_sha256 === b.receipt_hash_sha256
  );
}

function runChecker({ indexPath, profile }) {
  const cmd = process.execPath;
  const args = [
    path.join("tools", "periodic_contracts_check.mjs"),
    indexPath,
    "--strict",
    "--profile",
    profile,
    "--trace",
    "--trace_hash_only",
  ];

  const res = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 50 * 1024 * 1024, timeout: 5 * 60 * 1000 });
  if (res.error) die(res.error);
  if (res.status !== 0 && res.status !== 2) {
    die(`checker crashed (status ${res.status}):\n${res.stderr || res.stdout}`);
  }

  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    die(`checker did not return JSON:\n${res.stdout}`);
  }
  if (!report || typeof report !== "object") die("invalid checker report");
  return report;
}

function perturbSystem(sys) {
  const out = JSON.parse(JSON.stringify(sys));
  if (Array.isArray(out.compounds)) out.compounds = [...out.compounds].reverse();
  if (Array.isArray(out.links)) out.links = [...out.links].reverse();
  return out;
}

function listSystemFiles(dirPath) {
  const abs = path.resolve(process.cwd(), dirPath);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dirPath, f));
}

function rewriteIndexWithPerturbedSystems({ idx, tempRoot }) {
  const out = JSON.parse(JSON.stringify(idx));

  const systemsDir = out.systems?.path;
  const sysNegPath = out.system_negative_examples?.path;
  if (!systemsDir) return out;

  const mapping = new Map();

  // Copy + perturb all system JSON files from the systems folder.
  const sysFiles = listSystemFiles(systemsDir);
  const systemsDestDir = path.join(tempRoot, systemsDir);
  fs.mkdirSync(systemsDestDir, { recursive: true });

  for (const relPath of sysFiles) {
    const sys = readJson(relPath);
    const perturbed = perturbSystem(sys);
    const dest = path.join(tempRoot, relPath);
    writeJson(dest, perturbed);
    mapping.set(relPath, dest);
  }

  // Rewrite system_negative_examples paths so negatives also point to perturbed system files.
  if (sysNegPath) {
    const neg = readJson(sysNegPath);
    const negOut = JSON.parse(JSON.stringify(neg));
    if (Array.isArray(negOut.cases)) {
      negOut.cases = negOut.cases.map((c) => {
        const next = { ...c };
        if (typeof next.path === "string" && mapping.has(next.path)) next.path = mapping.get(next.path);
        return next;
      });
    }
    const negDest = path.join(tempRoot, "periodic", "v1", "examples", path.basename(sysNegPath));
    writeJson(negDest, negOut);
    out.system_negative_examples = { path: negDest };
  }

  out.systems = {
    ...out.systems,
    path: systemsDestDir,
  };

  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const phasesAll = [
    { profile: "phase0", index: "periodic/v1/periodic.index.phase0.v1.json" },
    { profile: "phase1", index: "periodic/v1/periodic.index.phase1.v1.json" },
    { profile: "phase2", index: "periodic/v1/periodic.index.phase2.v1.json" },
    { profile: "phase3", index: "periodic/v1/periodic.index.phase3.v1.json" },
    { profile: "phase4", index: "periodic/v1/periodic.index.phase4.v1.json" },
    { profile: "phase5", index: "periodic/v1/periodic.index.phase5.v1.json" },
    { profile: "phase6", index: "periodic/v1/periodic.index.phase6.v1.json" },
    { profile: "phase7", index: "periodic/v1/periodic.index.phase7.v1.json" },
    { profile: "phase8", index: "periodic/v1/periodic.index.phase8.v1.json" },
  ];

  // Deterministic Core default: keep runtime + log pressure low.
  const phasesDefault = phasesAll.filter((p) => p.profile === "phase0" || p.profile === "phase1");
  const phases = args.allPhases ? phasesAll : phasesDefault;
  const selected = Array.isArray(args.onlyProfiles)
    ? phases.filter((p) => args.onlyProfiles.includes(p.profile))
    : phases;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spel_system_order_"));
  const results = [];

  for (const ph of selected) {
    const idx = readJson(ph.index);

    const baselineReport = runChecker({ indexPath: ph.index, profile: ph.profile });
    if (!baselineReport.ok) die(`baseline check must pass for ${ph.profile}`);
    const baselineSnap = snapshotFromReport(baselineReport, ph.profile);

    const tempRoot = path.join(tmp, ph.profile);
    fs.mkdirSync(tempRoot, { recursive: true });
    const idxTemp = rewriteIndexWithPerturbedSystems({ idx, tempRoot });
    const idxTempPath = path.join(tempRoot, "index.temp.json");
    writeJson(idxTempPath, idxTemp);

    const perturbedReport = runChecker({ indexPath: idxTempPath, profile: ph.profile });

    const errors = Array.isArray(perturbedReport.errors) ? perturbedReport.errors : [];
    const waived = Array.isArray(perturbedReport.waived) ? perturbedReport.waived : [];

    if (errors.length > 0) {
      die(`perturbed run produced unexpected errors for ${ph.profile}:\n${errors.join("\n")}`);
    }
    if (waived.length > 0) {
      die(`perturbed run produced waived results for ${ph.profile}:\n${waived.join("\n")}`);
    }

    const perturbedSnap = snapshotFromReport(perturbedReport, ph.profile);
    const ok = sameSnapshot(baselineSnap, perturbedSnap);
    results.push({ profile: ph.profile, ok, baseline: baselineSnap, perturbed: perturbedSnap });

    if (!ok) {
      die(
        `system-order instability detected for ${ph.profile}:\n  baseline=${JSON.stringify(
          baselineSnap,
          null,
          2
        )}\n  perturbed=${JSON.stringify(perturbedSnap, null, 2)}`
      );
    }
  }

  const final = { ok: true, cases: results };

  if (args.outPath) {
    const abs = path.resolve(process.cwd(), args.outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(final, null, 2) + "\n", "utf8");
  }

  if (args.stdoutJson) {
    process.stdout.write(JSON.stringify(final, null, 2) + "\n");
    return;
  }

  const profiles = (final.cases || []).map((c) => c.profile);
  const failed = (final.cases || []).filter((c) => c && c.ok === false).map((c) => c.profile);
  process.stdout.write(JSON.stringify({ ok: true, profiles, failed_profiles: failed, cases_total: profiles.length }, null, 2) + "\n");
}

main();
