/**
 * Libraries SPEL module (v1)
 *
 * This is the source-of-truth “capability selection” module.
 *
 * - Deterministic text output (no timestamps)
 * - Round-trippable parse → normalize → emit
 * - Chips-only UI emits these IDs (no free-text requirements)
 */

export type ParseLibrariesResult =
  | { ok: true; library_ids: string[]; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

export function normalizeLibraryIds(ids: string[]): string[] {
  const cleaned = (Array.isArray(ids) ? ids : [])
    .map((x) => String(x || "").trim())
    .filter((x) => x.length > 0)
    .filter((x) => /^[a-zA-Z0-9_\-.]+$/.test(x));
  const set = new Set(cleaned);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function librariesSddlText(opts: { library_ids: string[] }): string {
  const ids = normalizeLibraryIds(opts.library_ids);
  const lines: string[] = [];
  lines.push("spel_version: 1");
  lines.push("module: kindred.libraries.v1");
  lines.push("");
  lines.push("libraries:");
  if (ids.length === 0) {
    lines.push("  # (none selected)");
  } else {
    for (const id of ids) lines.push(`  - ${id}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parseLibrariesSddl(text: string): ParseLibrariesResult {
  const warnings: string[] = [];
  const raw = String(text || "").replace(/\r/g, "");
  if (!raw.trim()) return { ok: true, library_ids: [], warnings };

  const lines = raw.split("\n");
  let inLibraries = false;
  const ids: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!inLibraries) {
      if (trimmed === "libraries:" || trimmed.startsWith("libraries:")) {
        inLibraries = true;
      }
      continue;
    }

    // End libraries section on next top-level key.
    if (trimmed && !line.startsWith(" ") && !line.startsWith("\t") && !trimmed.startsWith("#")) {
      break;
    }

    if (!trimmed || trimmed.startsWith("#")) continue;

    const m = trimmed.match(/^-\s*([a-zA-Z0-9_\-.]+)\s*$/);
    if (!m) {
      warnings.push(`Unrecognized libraries entry at line ${i + 1}`);
      continue;
    }
    ids.push(m[1]);
  }

  return { ok: true, library_ids: normalizeLibraryIds(ids), warnings };
}
