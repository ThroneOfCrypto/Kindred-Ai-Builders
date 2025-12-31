export const runtime = "nodejs";

import JSZip from "jszip";

type Tradeoffs = Record<string, number>;
type Actor = { id: string; label: string };
type Scene = { id: string; label: string; actor_id: string };

type GateStatus = "pass" | "warn" | "fail";
type Gate = { id: string; status: GateStatus; message: string };
type GateReport = {
  schema: "sdde.gate_report.v1";
  created_at_utc: string;
  failures: number;
  warnings: number;
  passes: number;
  ok: boolean;
  gates: Gate[];
};

function nowUtcIso(): string {
  return new Date().toISOString();
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string") as string[];
}

function asRecordNumber(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof val === "number" ? val : parseInt(String(val), 10);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

function asActors(v: unknown): Actor[] {
  if (!Array.isArray(v)) return [];
  const out: Actor[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const id = asString((item as any).id);
    const label = asString((item as any).label);
    if (id && label) out.push({ id, label });
  }
  return out;
}

function asScenes(v: unknown): Scene[] {
  if (!Array.isArray(v)) return [];
  const out: Scene[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const id = asString((item as any).id);
    const label = asString((item as any).label);
    const actor_id = asString((item as any).actor_id);
    if (id && label && actor_id) out.push({ id, label, actor_id });
  }
  return out;
}

function isBrownfieldLaunchPath(launchPathId: string): boolean {
  return (
    launchPathId.includes("brownfield") ||
    launchPathId.includes("upgrade") ||
    launchPathId.includes("rebuild") ||
    launchPathId.startsWith("website_")
  );
}

function computeGateReport(input: {
  launchPathId: string;
  productName: string;
  oneLiner: string;
  palettes: string[];
  actors: Actor[];
  scenes: Scene[];
  ai_mode: string;
  brownfieldRepoUrl: string;
}): GateReport {
  const gates: Gate[] = [];
  const add = (id: string, status: GateStatus, message: string) => gates.push({ id, status, message });

  if (input.launchPathId.trim()) add("launch_path_selected", "pass", "Launch path selected.");
  else add("launch_path_selected", "fail", "Choose a launch path.");

  if (input.productName.trim()) add("product_name", "pass", "Product name set.");
  else add("product_name", "fail", "Set a product name.");

  if (input.oneLiner.trim()) add("one_liner", "pass", "One-liner set.");
  else add("one_liner", "fail", "Set a one-liner.");

  if (input.palettes.length > 0) add("palettes_selected", "pass", "At least one palette selected.");
  else add("palettes_selected", "fail", "Select at least one palette.");

  const actorIds = new Set(input.actors.map((a) => a.id));
  if (input.actors.length > 0) add("actors_present", "pass", "At least one actor defined.");
  else add("actors_present", "fail", "Add at least one actor.");

  if (input.scenes.length > 0) add("scenes_present", "pass", "At least one scene defined.");
  else add("scenes_present", "fail", "Add at least one scene.");

  const badSceneRefs = input.scenes.filter((s) => !actorIds.has(s.actor_id));
  if (badSceneRefs.length === 0) add("scene_actor_refs", "pass", "All scenes reference valid actors.");
  else add("scene_actor_refs", "fail", "Some scenes reference missing actors.");

  if (input.ai_mode === "offline" || input.ai_mode === "hosted" || input.ai_mode === "local") add("ai_mode_valid", "pass", "AI mode is valid.");
  else add("ai_mode_valid", "fail", "AI mode is invalid.");

  if (isBrownfieldLaunchPath(input.launchPathId)) {
    if (input.brownfieldRepoUrl.trim()) add("brownfield_target", "pass", "Brownfield repo URL provided.");
    else add("brownfield_target", "warn", "Brownfield selected: repo URL not provided yet.");
  } else {
    add("brownfield_target", "pass", "Not a brownfield launch path.");
  }

  const failures = gates.filter((g) => g.status === "fail").length;
  const warnings = gates.filter((g) => g.status === "warn").length;
  const passes = gates.filter((g) => g.status === "pass").length;

  return {
    schema: "sdde.gate_report.v1",
    created_at_utc: nowUtcIso(),
    failures,
    warnings,
    passes,
    ok: failures === 0,
    gates
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const launchPathId = asString((body as any).launchPathId) || "quick_saas_v1";
  const productName = asString((body as any).productName).trim();
  const oneLiner = asString((body as any).oneLiner).trim();

  const palettes = asStringArray((body as any).palettes);
  const tradeoffs: Tradeoffs = asRecordNumber((body as any).tradeoffs);

  const actors = asActors((body as any).actors);
  const scenes = asScenes((body as any).scenes);

  const ai = (body as any).ai ?? {};
  const ai_mode = asString(ai.mode) || "offline";
  const hosted_model = asString(ai.hosted_model) || "gpt-4.1-mini";
  const local_base_url = asString(ai.local_base_url) || "http://localhost:11434/v1";
  const local_model = asString(ai.local_model) || "llama3.1:8b";

  const brownfieldRepoUrl = asString((body as any).brownfieldRepoUrl).trim();

  const created_at_utc = nowUtcIso();

  const gateReport = computeGateReport({
    launchPathId,
    productName,
    oneLiner,
    palettes,
    actors,
    scenes,
    ai_mode,
    brownfieldRepoUrl
  });

  const blueprint = {
    schema: "sdde.spec_pack.v1",
    created_at_utc,

    launch_path_id: launchPathId,

    intake: {
      product_name: productName,
      one_liner: oneLiner,
      brownfield: brownfieldRepoUrl ? { repo_url: brownfieldRepoUrl } : undefined
    },

    palettes,
    tradeoffs,

    design: { actors, scenes },

    ai: {
      mode: ai_mode,
      hosted: ai_mode === "hosted" ? { model: hosted_model } : undefined,
      local: ai_mode === "local" ? { base_url: local_base_url, model: local_model } : undefined,
      secrets_note: ai_mode === "hosted" ? "Set OPENAI_API_KEY (or compatible) as an environment variable." : undefined
    }
  };

  const zip = new JSZip();

  zip.file("manifest.json", JSON.stringify({
    schema: "sdde.spec_pack_manifest.v1",
    created_at_utc,
    files: [
      "blueprint/spec_pack.json",
      "gates/gate_report.json",
      "blueprint/secrets_instructions.md"
    ]
  }, null, 2));

  zip.folder("blueprint")?.file("spec_pack.json", JSON.stringify(blueprint, null, 2));
  zip.folder("gates")?.file("gate_report.json", JSON.stringify(gateReport, null, 2));

  zip.folder("blueprint")?.file(
    "secrets_instructions.md",
    [
      "# Secrets instructions",
      "",
      "This Spec Pack never contains secrets.",
      "",
      "## Hosted mode",
      "- Set OPENAI_API_KEY in your hosting provider environment variables.",
      "",
      "## Local mode",
      "- Ensure your local OpenAI-compatible endpoint is reachable.",
      "",
      "Created at: " + created_at_utc,
      ""
    ].join("\n")
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);

  return new Response(ab, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="sdde_spec_pack.zip"'
    }
  });
}
