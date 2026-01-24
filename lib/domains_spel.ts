/**
 * Domains SPEL module (v1)
 *
 * Domains are the deterministic drill-down layer AFTER Palettes.
 * They compile into SPEL modules and proposal packs.
 */

import type { DomainId } from "./types";

export type ParseDomainsResult =
  | { ok: true; domain_ids: DomainId[]; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

export function normalizeDomainIds(ids: DomainId[]): DomainId[] {
  const cleaned = (Array.isArray(ids) ? ids : [])
    .map((x) => String(x || "").trim())
    .filter((x) => x.length > 0)
    .filter((x) => /^[a-zA-Z0-9_\-.]+$/.test(x));
  const set = new Set(cleaned);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function domainsSddlText(opts: { domain_ids: DomainId[] }): string {
  const ids = normalizeDomainIds(opts.domain_ids);
  const lines: string[] = [];
  lines.push("spel_version: 1");
  lines.push("module: kindred.domains.v1");
  lines.push("");
  lines.push("domains:");
  if (ids.length === 0) {
    lines.push("  # (none selected)");
  } else {
    for (const id of ids) lines.push(`  - ${id}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parseDomainsSddl(text: string): ParseDomainsResult {
  const warnings: string[] = [];
  const raw = String(text || "").replace(/\r/g, "");
  if (!raw.trim()) return { ok: true, domain_ids: [], warnings };

  const lines = raw.split("\n");
  let inDomains = false;
  const ids: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inDomains) {
      if (trimmed === "domains:" || trimmed.startsWith("domains:")) {
        inDomains = true;
      }
      continue;
    }

    // End section on next top-level key.
    if (trimmed && !line.startsWith(" ") && !line.startsWith("\t") && !trimmed.startsWith("#")) {
      break;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;

    const m = trimmed.match(/^-\s*([a-zA-Z0-9_\-.]+)\s*$/);
    if (!m) {
      warnings.push(`Unrecognized domains entry at line ${i + 1}`);
      continue;
    }
    ids.push(m[1]);
  }

  return { ok: true, domain_ids: normalizeDomainIds(ids), warnings };
}
