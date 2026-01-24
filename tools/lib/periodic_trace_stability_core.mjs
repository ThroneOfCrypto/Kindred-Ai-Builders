/**
 * Periodic Trace Stability Core
 *
 * Exported core to avoid nested spawnSync + stdio inheritance edge cases.
 * Deterministic: given the same periodic indices + checker behavior, output is stable.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function die(msg) {
  const err = new Error(String(msg));
  err.code = "TRACE_STABILITY_CORE";
  throw err;
}

function readJson(p) {
  const abs = path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) die(`missing file: ${p}`);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function writeJson(absPath, obj) {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
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

function runChildJson(cmd, args, opts = {}) {
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 5 * 60 * 1000;
  const maxBytes = typeof opts.maxBytes === 'number' ? opts.maxBytes : 50 * 1024 * 1024;

  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);

    const append = (which, chunk) => {
      const s = chunk?.toString('utf8') ?? '';
      if (!s) return;
      if (which === 'stdout') {
        if (stdout.length < maxBytes) stdout += s;
      } else {
        if (stderr.length < maxBytes) stderr += s;
      }
    };

    child.stdout?.on('data', (c) => append('stdout', c));
    child.stderr?.on('data', (c) => append('stderr', c));

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        status: typeof code === 'number' ? code : null,
        signal: signal || null,
        timed_out: killed,
        stdout,
        stderr
      });
    });
  });
}

async function runChecker({ indexPath, profile }) {
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

  const res = await runChildJson(cmd, args, { timeoutMs: 5 * 60 * 1000, maxBytes: 50 * 1024 * 1024 });
  if (res.timed_out) die(`checker timed out for ${profile}`);
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
  if (!report.ok) die(`expected ok:true for ${profile} but got failures`);

  return snapshotFromReport(report, profile);
}

function rewriteIndexForTemp(idx) {
  const out = JSON.parse(JSON.stringify(idx));

  if (out.tables && typeof out.tables === "object") {
    const keys = Object.keys(out.tables);
    const rev = [...keys].reverse();
    const next = {};
    for (const k of rev) next[k] = out.tables[k];
    out.tables = next;
  }

  if (out.tags && typeof out.tags === "object") {
    out.tags = { ...out.tags };
  }

  return out;
}

export function getAllPhases() {
  return [
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
}

// Deterministic Core default: keep runtime + log pressure low.
// You can opt into full-suite stability checks via --all-phases.
export function getDefaultPhases() {
  return getAllPhases().filter((p) => p.profile === "phase0" || p.profile === "phase1");
}

export async function computeTraceStability(params = {}) {
  const phases = Array.isArray(params.phases) ? params.phases : getDefaultPhases();
  const only = Array.isArray(params.onlyProfiles) ? params.onlyProfiles : null;
  const selected = only ? phases.filter((p) => only.includes(p.profile)) : phases;

  const tmp = params.tmpRoot || fs.mkdtempSync(path.join(os.tmpdir(), "spel_trace_stability_"));

  const results = [];
  for (const ph of selected) {
    const idx = readJson(ph.index);
    const baseline = await runChecker({ indexPath: ph.index, profile: ph.profile });

    const tempRoot = path.join(tmp, ph.profile);
    fs.mkdirSync(tempRoot, { recursive: true });
    const idxTemp = rewriteIndexForTemp(idx);
    const idxTempPath = path.join(tempRoot, "index.temp.json");
    writeJson(idxTempPath, idxTemp);
    const perturbed = await runChecker({ indexPath: idxTempPath, profile: ph.profile });

    const ok = sameSnapshot(baseline, perturbed);
    results.push({ profile: ph.profile, ok, baseline, perturbed });

    if (!ok) {
      die(
        `trace instability detected for ${ph.profile}:\n` +
          `  baseline.trace=${baseline.trace_hash_sha256}\n` +
          `  perturbed.trace=${perturbed.trace_hash_sha256}\n` +
          `  baseline.system_kappa_hashes=${JSON.stringify(baseline.system_kappa_hashes)}\n` +
          `  perturbed.system_kappa_hashes=${JSON.stringify(perturbed.system_kappa_hashes)}\n` +
          `  baseline.system_obligations_hashes=${JSON.stringify(baseline.system_obligations_hashes)}\n` +
          `  perturbed.system_obligations_hashes=${JSON.stringify(perturbed.system_obligations_hashes)}`
      );
    }
  }

  return { ok: true, cases: results };
}
