export const runtime = "nodejs";

import JSZip from "jszip";

type Tradeoffs = Record<string, number>;
type Actor = { id: string; label: string };
type Scene = { id: string; label: string; actor_id: string };

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  return "";
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

  const created_at_utc = new Date().toISOString();

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

    design: {
      actors,
      scenes
    },

    ai: {
      mode: ai_mode,
      hosted: ai_mode === "hosted" ? { model: hosted_model } : undefined,
      local: ai_mode === "local" ? { base_url: local_base_url, model: local_model } : undefined,
      secrets_note:
        ai_mode === "hosted"
          ? "Set OPENAI_API_KEY (or compatible) as an environment variable on your server or platform."
          : undefined
    }
  };

  const zip = new JSZip();

  zip.file("manifest.json", JSON.stringify({
    schema: "sdde.spec_pack_manifest.v1",
    created_at_utc,
    files: [
      "blueprint/spec_pack.json",
      "blueprint/secrets_instructions.md"
    ]
  }, null, 2));

  zip.folder("blueprint")?.file("spec_pack.json", JSON.stringify(blueprint, null, 2));
  zip.folder("blueprint")?.file(
    "secrets_instructions.md",
    [
      "# Secrets instructions",
      "",
      "This Spec Pack never contains secrets.",
      "",
      "## Hosted mode",
      "- Set OPENAI_API_KEY in your hosting provider (Vercel / server env vars).",
      "",
      "## Local mode",
      "- Ensure your local OpenAI-compatible endpoint is reachable from the runtime.",
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
