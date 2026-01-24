"use client";

import { SpecPack, SpecPackFile } from "./spec_pack";

export type ParsedSPELv1 = {
  palettes: string[];
  actors: { id: string; display_name: string }[];
  scenes: { id: string; title: string; entry: boolean; actors: string[] }[];
  flows: { id: string; scenes: string[] }[];
  warnings: string[];
};

export type CompileSPELResult =
  | { ok: true; mergedPack: SpecPack; warnings: string[] }
  | { ok: false; error: string; warnings: string[] };

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function stripComments(line: string): string {
  // Only strip YAML-style comments when they are not inside quotes.
  let inQuotes = false;
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && ch === "#") break;
    out += ch;
  }
  return out;
}

function parseYamlScalar(raw: string): string {
  const s = raw.trim();
  if (s === "") return "";
  if (s.startsWith('"') || s.startsWith("'")) {
    // Prefer JSON.parse when possible.
    try {
      if (s.startsWith('"')) return JSON.parse(s);
    } catch {
      // fall through
    }
    // naive single-quote unwrap
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  }
  return s;
}

function parseYamlInlineList(raw: string): string[] {
  const s = raw.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return [];
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  // Split by commas that are not inside quotes.
  const parts: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && ch === ",") {
      parts.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.map(parseYamlScalar).filter((x) => x !== "");
}

function titleFromId(id: string): string {
  const cleaned = String(id || "").replace(/[_\-]+/g, " ").trim();
  if (!cleaned) return "Untitled";
  return cleaned
    .split(/\s+/g)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function parseSPELv1(text: string): { ok: true; value: ParsedSPELv1 } | { ok: false; error: string; warnings: string[] } {
  const warnings: string[] = [];
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(stripComments);

  let section: "palettes" | "actors" | "scenes" | "flows" | null = null;
  let curActorId: string | null = null;
  let curSceneId: string | null = null;
  let curFlowIndex: number = -1;

  const palettes: string[] = [];
  const actors: Record<string, { id: string; display_name: string }> = {};
  const scenes: Record<string, { id: string; title: string; entry: boolean; actors: string[] }> = {};
  const flows: { id: string; scenes: string[] }[] = [];

  function flushContext() {
    curActorId = null;
    curSceneId = null;
    curFlowIndex = -1;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (isBlank(raw)) continue;
    const indent = raw.match(/^\s*/)?.[0]?.length || 0;
    const line = raw.trimEnd();

    if (indent === 0) {
      flushContext();
      if (line.startsWith("palettes:")) {
        section = "palettes";
        continue;
      }
      if (line.startsWith("actors:")) {
        section = "actors";
        continue;
      }
      if (line.startsWith("scenes:")) {
        section = "scenes";
        continue;
      }
      if (line.startsWith("flows:")) {
        section = "flows";
        continue;
      }
      // Ignore other top-level keys.
      section = null;
      continue;
    }

    if (section === "palettes") {
      const m = line.match(/^\s*-\s*(.+)$/);
      if (!m) continue;
      const value = parseYamlScalar(m[1]);
      if (value) palettes.push(value);
      continue;
    }

    if (section === "actors") {
      const actorHeader = line.match(/^\s{2}([A-Za-z0-9_\-]+):\s*$/);
      if (actorHeader) {
        curActorId = actorHeader[1];
        if (!actors[curActorId]) actors[curActorId] = { id: curActorId, display_name: titleFromId(curActorId) };
        continue;
      }

      const actorField = line.match(/^\s{4}display_name:\s*(.*)$/);
      if (actorField && curActorId) {
        actors[curActorId].display_name = parseYamlScalar(actorField[1]);
        continue;
      }
      continue;
    }

    if (section === "scenes") {
      const sceneHeader = line.match(/^\s{2}([A-Za-z0-9_\-]+):\s*$/);
      if (sceneHeader) {
        curSceneId = sceneHeader[1];
        if (!scenes[curSceneId]) scenes[curSceneId] = { id: curSceneId, title: titleFromId(curSceneId), entry: false, actors: [] };
        continue;
      }

      const titleField = line.match(/^\s{4}title:\s*(.*)$/);
      if (titleField && curSceneId) {
        scenes[curSceneId].title = parseYamlScalar(titleField[1]) || scenes[curSceneId].title;
        continue;
      }

      const entryField = line.match(/^\s{4}entry:\s*(.*)$/);
      if (entryField && curSceneId) {
        const v = parseYamlScalar(entryField[1]).toLowerCase();
        scenes[curSceneId].entry = v === "true" || v === "yes" || v === "1";
        continue;
      }

      const actorsField = line.match(/^\s{4}actors:\s*(.*)$/);
      if (actorsField && curSceneId) {
        const list = parseYamlInlineList(actorsField[1]);
        scenes[curSceneId].actors = list;
        continue;
      }
      continue;
    }

    if (section === "flows") {
      const flowIdHeader = line.match(/^\s{2}-\s+id:\s*(.*)$/);
      if (flowIdHeader) {
        const id = parseYamlScalar(flowIdHeader[1]);
        const next = { id: id || `flow_${flows.length + 1}`, scenes: [] as string[] };
        flows.push(next);
        curFlowIndex = flows.length - 1;
        continue;
      }

      const flowScenes = line.match(/^\s{4}scenes:\s*(.*)$/);
      if (flowScenes && curFlowIndex >= 0) {
        flows[curFlowIndex].scenes = parseYamlInlineList(flowScenes[1]);
        continue;
      }
      continue;
    }
  }

  const actorList = Object.values(actors);
  const sceneList = Object.values(scenes);

  if (actorList.length === 0) {
    warnings.push("No actors found in SPEL; using visitor.");
    actorList.push({ id: "visitor", display_name: "Visitor" });
  }
  if (sceneList.length === 0) {
    warnings.push("No scenes found in SPEL; using home entry scene.");
    sceneList.push({ id: "home", title: "Home", entry: true, actors: [actorList[0].id] });
  }

  // Ensure exactly one entry scene.
  const entries = sceneList.filter((s) => s.entry);
  if (entries.length === 0) {
    sceneList[0].entry = true;
    warnings.push("No entry scene marked; first scene set as entry.");
  } else if (entries.length > 1) {
    const keep = entries[0].id;
    for (const s of sceneList) s.entry = s.id === keep;
    warnings.push(`Multiple entry scenes found; keeping only: ${keep}`);
  }

  // Fill missing actors list for scenes: default to all actors.
  for (const s of sceneList) {
    if (!Array.isArray(s.actors) || s.actors.length === 0) {
      s.actors = actorList.map((a) => a.id);
      warnings.push(`Scene ${s.id} had no actors; defaulting to all actors.`);
    }
  }

  // Ensure at least one flow.
  if (flows.length === 0) {
    const entry = sceneList.find((s) => s.entry)?.id || sceneList[0].id;
    flows.push({ id: "primary", scenes: [entry] });
    warnings.push("No flows found; created primary flow.");
  }

  return {
    ok: true,
    value: {
      palettes,
      actors: actorList,
      scenes: sceneList,
      flows,
      warnings,
    },
  };
}

function prettyJson(obj: any): string {
  return JSON.stringify(obj, null, 2) + "\n";
}

function u8FromText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function replaceFilesInPack(pack: SpecPack, replacements: Record<string, Uint8Array>): SpecPack {
  const repl = new Map<string, Uint8Array>(Object.entries(replacements));
  const files: SpecPackFile[] = pack.files.map((f) => {
    const r = repl.get(f.path);
    if (!r) return f;
    repl.delete(f.path);
    return { path: f.path, bytes: r, size: r.byteLength };
  });
  for (const [path, bytes] of repl.entries()) {
    files.push({ path, bytes, size: bytes.byteLength });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const fileMap: Map<string, SpecPackFile> = new Map();
  for (const f of files) fileMap.set(f.path, f);
  return { files, fileMap };
}

function normalizePaletteToken(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function paletteLabelToId(raw: string): string | null {
  const token = normalizePaletteToken(raw);
  const known: Record<string, string> = {
    identity_access: "identity_access",
    identity_access_: "identity_access",
    identity___access: "identity_access",
    communication_social: "communication_social",
    communication_social_surfaces: "communication_social",
    content_media: "content_media",
    knowledge_learning: "knowledge_learning",
    search_navigation_discovery: "search_navigation",
    search_navigation: "search_navigation",
    matching_recommendation: "matching_recommendation",
    collaboration_work: "collaboration_work",
    commerce_value_exchange: "commerce_value",
    commerce_value: "commerce_value",
    governance_rules_policy: "governance_policy",
    governance_policy: "governance_policy",
    reputation_trust_safety: "reputation_safety",
    reputation_safety: "reputation_safety",
    game_incentive_mechanics: "game_incentives",
    game_incentives: "game_incentives",
    automation_agents_workflows: "automation_workflows",
    automation_workflows: "automation_workflows",
    infrastructure_data_files: "infrastructure_data_files",
    connection_integration: "connection_integration",
  };
  if (known[token]) return known[token];
  // If the token already looks like an ID, accept it.
  if (/^(identity_access|communication_social|content_media|knowledge_learning|search_navigation|matching_recommendation|collaboration_work|commerce_value|governance_policy|reputation_safety|game_incentives|automation_workflows|infrastructure_data_files|connection_integration)$/.test(token)) {
    return token;
  }
  return null;
}

export function compileSPELToProposalPack(args: { basePack: SpecPack; spelText: string }): CompileSPELResult {
  const warnings: string[] = [];
  const parsed = parseSPELv1(args.spelText);
  if (!parsed.ok) return { ok: false, error: parsed.error, warnings: parsed.warnings };
  warnings.push(...parsed.value.warnings);

  // Attempt to map palette labels to ids.
  const paletteIds = parsed.value.palettes
    .map((p) => paletteLabelToId(p))
    .filter((x): x is string => Boolean(x));
  if (parsed.value.palettes.length > 0 && paletteIds.length === 0) {
    warnings.push("SPEL palettes did not match known palette IDs; palettes left unchanged.");
  }

  // Preserve existing scene titles where possible (best-effort).
  let existingScenes: Record<string, { title: string }> = {};
  try {
    const f = args.basePack.fileMap.get("kernel_min/scenes.json") || args.basePack.fileMap.get("ux/scenes.json");
    if (f) {
      const j = JSON.parse(new TextDecoder().decode(f.bytes));
      const list = Array.isArray(j?.scenes) ? j.scenes : [];
      for (const s of list) {
        if (s && typeof s.id === "string" && typeof s.title === "string") existingScenes[s.id] = { title: s.title };
      }
    }
  } catch {
    // ignore
  }

  const actorsJson = { actors: parsed.value.actors.map((a) => ({ id: a.id, display_name: a.display_name })) };
  const scenesJson = {
    scenes: parsed.value.scenes.map((s) => ({
      id: s.id,
      title: s.title || existingScenes[s.id]?.title || titleFromId(s.id),
      entry: s.entry ? true : undefined,
    })),
  };
  const flowsJson = { flows: parsed.value.flows.map((f) => ({ id: f.id, scenes: f.scenes })) };

  const replacements: Record<string, Uint8Array> = {
    "kernel_min/actors.json": u8FromText(prettyJson(actorsJson)),
    "kernel_min/scenes.json": u8FromText(prettyJson(scenesJson)),
    "kernel_min/flows.json": u8FromText(prettyJson(flowsJson)),
    "ux/actors.json": u8FromText(prettyJson(actorsJson)),
    "ux/scenes.json": u8FromText(prettyJson(scenesJson)),
    "ux/flows.json": u8FromText(prettyJson(flowsJson)),
    "blueprint/hello.spel": u8FromText(String(args.spelText || "").replace(/\r/g, "").trimEnd() + "\n"),
  };

  if (paletteIds.length > 0) {
    replacements["intent/palettes.json"] = u8FromText(prettyJson({ palettes: paletteIds }));
  }

  const merged = replaceFilesInPack(args.basePack, replacements);
  return { ok: true, mergedPack: merged, warnings };
}
