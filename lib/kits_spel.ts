/**
 * Kits SPEL module (v1)
 *
 * Kits are optional bindings that introduce provider / product specifics
 * (repo seed templates, verify adapters, hosting hooks, wallet/auth adapters, etc.).
 *
 * Core rule:
 * - The Kindred kernel stays provider-neutral.
 * - Provider specifics are expressed only through Kits.
 *
 * Properties:
 * - Deterministic text output (no timestamps)
 * - Round-trippable parse → normalize → emit
 * - Catalog-driven UI emits kit IDs (no free-text requirement entry)
 */

export type ParseKitsResult =
  | { ok: true; kit_ids: string[]; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

export function normalizeKitIds(ids: string[]): string[] {
  const cleaned = (Array.isArray(ids) ? ids : [])
    .map((x) => String(x || "").trim())
    .filter((x) => x.length > 0)
    .filter((x) => /^[a-zA-Z0-9_\-.]+$/.test(x));
  const set = new Set(cleaned);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function kitsSddlText(opts: { kit_ids: string[] }): string {
  const ids = normalizeKitIds(opts.kit_ids);
  const lines: string[] = [];
  lines.push("spel_version: 1");
  lines.push("module: kindred.kits.v1");
  lines.push("");
  lines.push("kits:");
  if (ids.length === 0) {
    lines.push("  # (none selected)");
  } else {
    for (const id of ids) lines.push(`  - ${id}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parseKitsSddl(text: string): ParseKitsResult {
  const warnings: string[] = [];
  const raw = String(text || "").replace(/\r/g, "");
  if (!raw.trim()) return { ok: true, kit_ids: [], warnings };

  const lines = raw.split("\n");
  let inKits = false;
  const ids: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inKits) {
      if (trimmed === "kits:" || trimmed.startsWith("kits:")) {
        inKits = true;
      }
      continue;
    }

    // End kits section on next top-level key.
    if (trimmed && !line.startsWith(" ") && !line.startsWith("\t") && !trimmed.startsWith("#")) {
      break;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;

    const m = trimmed.match(/^-\s*([a-zA-Z0-9_\-.]+)\s*$/);
    if (!m) {
      warnings.push(`Unrecognized kits entry at line ${i + 1}`);
      continue;
    }
    ids.push(m[1]);
  }

  return { ok: true, kit_ids: normalizeKitIds(ids), warnings };
}
