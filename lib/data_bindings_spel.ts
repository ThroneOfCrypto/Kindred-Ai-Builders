/**
 * Data Bindings SPEL module (v1)
 *
 * Describes how data enters and leaves selected patterns.
 *
 * - Deterministic text output (no timestamps)
 * - Round-trippable parse → normalize → emit
 * - Stays provider-neutral; provider specifics belong in Kits.
 */

export type DataBindingsV1 = {
  source_id: string;
  sink_ids: string[];
  trigger_id: string;
};

export type ParseDataBindingsResult =
  | { ok: true; bindings: DataBindingsV1; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

function normId(x: any): string {
  const s = String(x || "").trim();
  if (!s) return "";
  if (!/^[a-zA-Z0-9_\-.]+$/.test(s)) return "";
  return s;
}

export function normalizeDataBindings(b: Partial<DataBindingsV1> | null | undefined): DataBindingsV1 {
  const source_id = normId((b as any)?.source_id) || "";
  const trigger_id = normId((b as any)?.trigger_id) || "";
  const sink_ids = Array.isArray((b as any)?.sink_ids)
    ? (b as any).sink_ids.map(normId).filter((x: string) => x.length > 0)
    : [];
  const uniqSinks = Array.from(new Set(sink_ids)).sort((a, b) => a.localeCompare(b));
  return { source_id, sink_ids: uniqSinks, trigger_id };
}

export function dataBindingsSddlText(opts: { bindings: DataBindingsV1 }): string {
  const b = normalizeDataBindings(opts.bindings);
  const lines: string[] = [];
  lines.push("spel_version: 1");
  lines.push("module: kindred.data_bindings.v1");
  lines.push("");
  lines.push("data_bindings:");
  lines.push(`  source: ${b.source_id || "(unset)"}`);
  lines.push(`  trigger: ${b.trigger_id || "(unset)"}`);
  lines.push("  sinks:");
  if (b.sink_ids.length === 0) {
    lines.push("    # (none selected)");
  } else {
    for (const id of b.sink_ids) lines.push(`    - ${id}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function parseDataBindingsSddl(text: string): ParseDataBindingsResult {
  const warnings: string[] = [];
  const raw = String(text || "").replace(/\r/g, "");
  if (!raw.trim()) {
    return { ok: true, bindings: { source_id: "", sink_ids: [], trigger_id: "" }, warnings };
  }

  const lines = raw.split("\n");
  let inRoot = false;
  let inSinks = false;
  const out: any = { source_id: "", sink_ids: [], trigger_id: "" };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (!inRoot) {
      if (trimmed === "data_bindings:" || trimmed.startsWith("data_bindings:")) {
        inRoot = true;
      }
      continue;
    }

    // End on next top-level key
    if (trimmed && !line.startsWith(" ") && !line.startsWith("\t") && !trimmed.startsWith("#") && trimmed !== "data_bindings:") {
      break;
    }

    if (trimmed.startsWith("source:")) {
      out.source_id = normId(trimmed.replace(/^source:\s*/, ""));
      inSinks = false;
      continue;
    }
    if (trimmed.startsWith("trigger:")) {
      out.trigger_id = normId(trimmed.replace(/^trigger:\s*/, ""));
      inSinks = false;
      continue;
    }
    if (trimmed.startsWith("sinks:")) {
      inSinks = true;
      continue;
    }

    if (inSinks) {
      const m = trimmed.match(/^-(?:\s*)([a-zA-Z0-9_\-.]+)\s*$/);
      if (m) {
        out.sink_ids.push(m[1]);
      } else {
        warnings.push(`Unrecognized sink entry at line ${i + 1}`);
      }
    }
  }

  return { ok: true, bindings: normalizeDataBindings(out), warnings };
}
