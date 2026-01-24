"use client";

import { RepoPack } from "./repo_pack_io";
import { stableJsonText } from "./stable_json";

export type BrownfieldSignal = {
  key: string;
  value: string;
  severity: "info" | "warn" | "risk";
};

export type BrownfieldReportV1 = {
  schema: "kindred.brownfield_report.v1";
  created_utc: string;
  totals: { file_count: number; total_bytes: number };
  languages: Array<{ ext: string; files: number }>; // sorted
  frameworks: string[]; // sorted unique
  tooling: string[]; // sorted unique
  signals: BrownfieldSignal[]; // sorted by severity+key
};

const ZIP_MTIME_UTC = "1980-01-01T00:00:00.000Z";

function toText(bytes: Uint8Array, maxBytes = 200_000): string {
  const slice = bytes.length > maxBytes ? bytes.slice(0, maxBytes) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } catch {
    // fallback
    let out = "";
    for (let i = 0; i < slice.length; i++) out += String.fromCharCode(slice[i]);
    return out;
  }
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function uniqSorted(xs: string[]): string[] {
  return Array.from(new Set(xs.filter(Boolean).map((x) => String(x).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function severityRank(s: BrownfieldSignal["severity"]): number {
  return s === "risk" ? 0 : s === "warn" ? 1 : 2;
}

export function brownfieldScanFromRepoPack(pack: RepoPack): BrownfieldReportV1 {
  const exts = new Map<string, number>();
  const frameworks: string[] = [];
  const tooling: string[] = [];
  const signals: BrownfieldSignal[] = [];

  // Language counts
  for (const f of pack.files) {
    const parts = f.path.split("/");
    const name = parts[parts.length - 1] || "";
    const m = name.toLowerCase().match(/\.([a-z0-9]+)$/i);
    const ext = m ? m[1] : "";
    if (!ext) continue;
    exts.set(ext, (exts.get(ext) || 0) + 1);
  }

  // Presence signals
  const has = (p: string) => pack.fileMap.has(p);

  const lockfiles = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"].filter(has);
  if (lockfiles.length === 0) {
    signals.push({ key: "lockfile", value: "No JS lockfile detected (npm/yarn/pnpm/bun)", severity: "warn" });
  } else if (lockfiles.length > 1) {
    signals.push({ key: "lockfile", value: `Multiple JS lockfiles detected: ${lockfiles.join(", ")}`, severity: "warn" });
  } else {
    signals.push({ key: "lockfile", value: `Lockfile detected: ${lockfiles[0]}`, severity: "info" });
  }

  if (has(".env")) signals.push({ key: "dotenv", value: "A .env file is present (may contain secrets)", severity: "risk" });
  if (has(".env.local")) signals.push({ key: "dotenv_local", value: "A .env.local file is present (may contain secrets)", severity: "risk" });
  if (has("vercel.json")) tooling.push("vercel");
  if (has("docker-compose.yml") || has("docker-compose.yaml")) tooling.push("docker-compose");
  if (has("Dockerfile")) tooling.push("docker");
  if (has("turbo.json")) tooling.push("turborepo");
  if (has("nx.json")) tooling.push("nx");
  if (has("lerna.json")) tooling.push("lerna");
  if (has("pnpm-workspace.yaml")) tooling.push("pnpm-workspaces");

  // Framework detection via package.json
  const pkgFile = pack.fileMap.get("package.json");
  if (pkgFile && pkgFile.is_text) {
    const json = safeJsonParse(toText(pkgFile.bytes));
    const deps = { ...(json?.dependencies || {}), ...(json?.devDependencies || {}) };
    const depNames = Object.keys(deps || {});

    const addIf = (name: string, tag: string) => {
      if (depNames.includes(name)) frameworks.push(tag);
    };

    addIf("next", "nextjs");
    addIf("react", "react");
    addIf("vue", "vue");
    addIf("svelte", "svelte");
    addIf("@angular/core", "angular");
    addIf("express", "express");
    addIf("fastify", "fastify");
    addIf("nest", "nestjs");

    if (json?.workspaces) tooling.push("workspaces");

    const engines = json?.engines;
    if (!engines?.node) {
      signals.push({ key: "engines.node", value: "package.json has no engines.node (executor drift risk)", severity: "warn" });
    }
  } else {
    signals.push({ key: "package.json", value: "No package.json at repo root (not a JS/Node root project, or monorepo/subdir)", severity: "info" });
  }

  // Basic secret heuristics (safe, non-OCR, text-only)
  const secretRegexes: Array<{ re: RegExp; label: string }>= [
    { re: /-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----/m, label: "private_key" },
    { re: /AKIA[0-9A-Z]{16}/m, label: "aws_access_key" },
    { re: /xox[baprs]-[0-9A-Za-z-]{10,48}/m, label: "slack_token" },
  ];
  let secretHits = 0;
  for (const f of pack.files) {
    if (!f.is_text) continue;
    // Only scan smallish files (avoid massive bundles)
    if (f.size > 200_000) continue;
    const text = toText(f.bytes);
    for (const s of secretRegexes) {
      if (s.re.test(text)) {
        secretHits += 1;
        signals.push({ key: `secret:${s.label}`, value: `Possible ${s.label} pattern found in ${f.path}`, severity: "risk" });
      }
    }
    if (secretHits >= 6) break;
  }

  const languages = Array.from(exts.entries())
    .map(([ext, files]) => ({ ext, files }))
    .sort((a, b) => (b.files - a.files) || a.ext.localeCompare(b.ext))
    .slice(0, 24);

  const report: BrownfieldReportV1 = {
    schema: "kindred.brownfield_report.v1",
    created_utc: ZIP_MTIME_UTC,
    totals: {
      file_count: pack.manifest.totals.file_count,
      total_bytes: pack.manifest.totals.total_bytes,
    },
    languages,
    frameworks: uniqSorted(frameworks),
    tooling: uniqSorted(tooling),
    signals: signals
      .slice()
      .sort((a, b) => (severityRank(a.severity) - severityRank(b.severity)) || a.key.localeCompare(b.key) || a.value.localeCompare(b.value)),
  };

  return report;
}

export function brownfieldReportText(r: BrownfieldReportV1): string {
  return stableJsonText(r, 2);
}
