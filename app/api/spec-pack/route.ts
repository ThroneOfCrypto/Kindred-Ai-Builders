import JSZip from "jszip";
import launchPaths from "@/sdde/contracts/launch_paths.json";

export const runtime = "nodejs";

type Tradeoffs = {
  speedVsQuality: number;     // -2..2
  simplicityVsPower: number;  // -2..2
  safetyVsFreedom: number;    // -2..2
};

type LaunchPathDef = {
  id: string;
  category: string;
  label: string;
  desc: string;
  recommendedPalettes: string[];
  defaultTradeoffs: Tradeoffs;
};

type Actor = { id: string; label: string };
type Scene = { id: string; label: string; kind: "page" | "state" };

type AiConnector = {
  mode: "offline" | "hosted" | "local";
  hosted?: { base_url: string; default_model: string };
  local?: { base_url: string; default_model: string };
  policy?: { confirm_before_spend: boolean; daily_spend_cap_usd: number | null };
};

type Payload = {
  launchPath: string;
  productName: string;
  oneLiner: string;
  palettes: string[];
  tradeoffs: Tradeoffs;
  actors: Actor[];
  scenes: Scene[];
  ai: AiConnector;
};

const CATALOG = (launchPaths as unknown as LaunchPathDef[]);
const DEFAULT_LAUNCH_PATH = CATALOG.length > 0 ? CATALOG[0].id : "quick_saas_v1";
const ALLOWED_LAUNCH_PATHS = new Set(CATALOG.map((lp) => lp.id));

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  const xi = Math.round(x);
  return Math.max(min, Math.min(max, xi));
}

function asString(x: unknown, fallback = ""): string {
  return typeof x === "string" ? x : fallback;
}

function asBool(x: unknown, fallback = false): boolean {
  return typeof x === "boolean" ? x : fallback;
}

function asNumberOrNull(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return null;
  return n;
}

function asStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((v) => typeof v === "string") as string[];
}

function normalizeId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function asActorsSafe(x: unknown): Actor[] {
  if (!Array.isArray(x)) return [];
  const out: Actor[] = [];
  const seen = new Set<string>();
  for (const v of x) {
    if (!v || typeof v !== "object") continue;
    const o = v as any;
    const id = normalizeId(asString(o.id));
    const label = asString(o.label).trim();
    if (!id || !label) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label });
  }
  return out.slice(0, 20);
}

function asScenesSafe(x: unknown): Scene[] {
  if (!Array.isArray(x)) return [];
  const out: Scene[] = [];
  const seen = new Set<string>();
  for (const v of x) {
    if (!v || typeof v !== "object") continue;
    const o = v as any;
    const id = normalizeId(asString(o.id));
    const label = asString(o.label).trim();
    const kindRaw = asString(o.kind, "page");
    const kind: Scene["kind"] = kindRaw === "state" ? "state" : "page";
    if (!id || !label) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label, kind });
  }
  return out.slice(0, 50);
}

function asAi(x: unknown): AiConnector {
  const o = (x && typeof x === "object") ? (x as any) : {};
  const modeRaw = asString(o.mode, "offline");
  const mode: AiConnector["mode"] = modeRaw === "hosted" || modeRaw === "local" ? modeRaw : "offline";

  const hosted = {
    base_url: asString(o.hosted?.base_url, "https://api.openai.com/v1").trim() || "https://api.openai.com/v1",
    default_model: asString(o.hosted?.default_model, "gpt-4.1-mini").trim() || "gpt-4.1-mini"
  };

  const local = {
    base_url: asString(o.local?.base_url, "http://localhost:11434/v1").trim() || "http://localhost:11434/v1",
    default_model: asString(o.local?.default_model, "llama3.1").trim() || "llama3.1"
  };

  const policy = {
    confirm_before_spend: asBool(o.policy?.confirm_before_spend, true),
    daily_spend_cap_usd: asNumberOrNull(o.policy?.daily_spend_cap_usd)
  };

  if (mode === "hosted") return { mode, hosted, policy };
  if (mode === "local") return { mode, local, policy };
  return { mode: "offline", policy };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body." }, null, 2), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const p = body as Partial<Payload>;

  const launchPathRaw = asString(p.launchPath, DEFAULT_LAUNCH_PATH).trim();
  const launchPath = ALLOWED_LAUNCH_PATHS.has(launchPathRaw) ? launchPathRaw : DEFAULT_LAUNCH_PATH;

  const productName = asString(p.productName).trim();
  const oneLiner = asString(p.oneLiner).trim();
  const palettes = asStringArray(p.palettes);

  if (!productName) {
    return new Response(JSON.stringify({ ok: false, error: "productName is required." }, null, 2), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const tradeoffs: Tradeoffs = {
    speedVsQuality: clampInt(p.tradeoffs?.speedVsQuality, -2, 2, 0),
    simplicityVsPower: clampInt(p.tradeoffs?.simplicityVsPower, -2, 2, 0),
    safetyVsFreedom: clampInt(p.tradeoffs?.safetyVsFreedom, -2, 2, 0)
  };

  const actors = asActorsSafe(p.actors);
  const scenes = asScenesSafe(p.scenes);
  const ai = asAi(p.ai);

  const createdAt = new Date().toISOString();

  const intake = {
    schema: "sdde.intake.v1",
    created_at_utc: createdAt,
    product: { name: productName, one_liner: oneLiner || "" },
    launch_path: launchPath,
    surfaces: ["web"],
    ai: { mode: ai.mode }
  };

  const palettesDoc = { schema: "sdde.palettes.selected.v1", selected: palettes };

  const tradeoffsDoc = {
    schema: "sdde.tradeoffs.v1",
    scale: { min: -2, max: 2, meaning: "-2 = left, 0 = neutral, +2 = right" },
    axes: {
      speed_vs_quality: tradeoffs.speedVsQuality,
      simplicity_vs_power: tradeoffs.simplicityVsPower,
      safety_vs_freedom: tradeoffs.safetyVsFreedom
    }
  };

  const actorsDoc = { schema: "sdde.actors.v1", actors };
  const scenesDoc = { schema: "sdde.scenes.v1", scenes };

  const aiConnectorDoc = {
    schema: "sdde.ai_connector.v1",
    ...ai
  };

  const secretsInstructions = `# Secrets placement (never stored in repo files)

This project intentionally does NOT store API keys in JSON files.

## Codespaces
In the terminal:
- export AI_MODE=hosted
- export OPENAI_API_KEY="YOUR_KEY"

Or set it via GitHub repository secrets for Codespaces.

## Vercel
Project → Settings → Environment Variables:
- AI_MODE=hosted
- OPENAI_API_KEY=...

For Local:
- AI_MODE=local
- AI_LOCAL_BASE_URL=http://localhost:11434/v1
`;

  const readme = `# SDDE Spec Pack (Offline-first)

Generated by Kindred AI Builders.

## Launch path
- ${launchPath}

## Included
- blueprint/intake.json
- blueprint/palettes.json
- blueprint/tradeoffs.json
- blueprint/actors.json
- blueprint/scenes.json
- blueprint/ai_connector.json
- blueprint/secrets_instructions.md
- manifest.json
`;

  const manifest = {
    schema: "sdde.spec_pack.manifest.v1",
    created_at_utc: createdAt,
    generator: "kindred-ai-builders",
    contents: [
      "blueprint/intake.json",
      "blueprint/palettes.json",
      "blueprint/tradeoffs.json",
      "blueprint/actors.json",
      "blueprint/scenes.json",
      "blueprint/ai_connector.json",
      "blueprint/secrets_instructions.md",
      "README.md",
      "manifest.json"
    ]
  };

  const zip = new JSZip();
  zip.file("blueprint/intake.json", JSON.stringify(intake, null, 2));
  zip.file("blueprint/palettes.json", JSON.stringify(palettesDoc, null, 2));
  zip.file("blueprint/tradeoffs.json", JSON.stringify(tradeoffsDoc, null, 2));
  zip.file("blueprint/actors.json", JSON.stringify(actorsDoc, null, 2));
  zip.file("blueprint/scenes.json", JSON.stringify(scenesDoc, null, 2));
  zip.file("blueprint/ai_connector.json", JSON.stringify(aiConnectorDoc, null, 2));
  zip.file("blueprint/secrets_instructions.md", secretsInstructions);
  zip.file("README.md", readme);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  const blob = new Blob([bytes], { type: "application/zip" });

  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=\"sdde_spec_pack.zip\"",
      "Cache-Control": "no-store"
    }
  });
}
