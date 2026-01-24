/**
 * Patterns SPEL module (v1)
 *
 * Patterns are reusable feature blueprints that compose Libraries into product behaviours.
 *
 * - Deterministic text output (no timestamps)
 * - Round-trippable parse → normalize → emit
 * - Catalog-driven UI emits IDs (no free-text requirement entry)
 */

export type ParsePatternsResult =
  | { ok: true; pattern_ids: string[]; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

export function normalizePatternIds(ids: string[]): string[] {
  const cleaned = (Array.isArray(ids) ? ids : [])
    .map((x) => String(x || "").trim())
    .filter((x) => x.length > 0)
    .filter((x) => /^[a-zA-Z0-9_\-.]+$/.test(x));
  const set = new Set(cleaned);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function patternsSddlText(opts: { pattern_ids: string[] }): string {
  const ids = normalizePatternIds(opts.pattern_ids);
  const lines: string[] = [];
  lines.push("spel_version: 1");
  lines.push("module: kindred.patterns.v1");
  lines.push("");
  lines.push("patterns:");
  if (ids.length === 0) {
    lines.push("  # (none selected)");
  } else {
    for (const id of ids) lines.push(`  - ${id}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parsePatternsSddl(text: string): ParsePatternsResult {
  const warnings: string[] = [];
  const raw = String(text || "").replace(/\r/g, "");
  if (!raw.trim()) return { ok: true, pattern_ids: [], warnings };

  const lines = raw.split("\n");
  let inPatterns = false;
  const ids: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inPatterns) {
      if (trimmed === "patterns:" || trimmed.startsWith("patterns:")) {
        inPatterns = true;
      }
      continue;
    }

    // End patterns section on next top-level key.
    if (trimmed && !line.startsWith(" ") && !line.startsWith("\t") && !trimmed.startsWith("#")) {
      break;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;

    const m = trimmed.match(/^-\s*([a-zA-Z0-9_\-.]+)\s*$/);
    if (!m) {
      warnings.push(`Unrecognized patterns entry at line ${i + 1}`);
      continue;
    }
    ids.push(m[1]);
  }

  return { ok: true, pattern_ids: normalizePatternIds(ids), warnings };
}
