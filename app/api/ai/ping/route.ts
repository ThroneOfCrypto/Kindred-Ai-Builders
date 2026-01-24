import { NextResponse } from "next/server";

import { getAiMode } from "../../../../lib/server/ai_client";

export const runtime = "nodejs";

type PingResp =
  | {
      ok: true;
      mode: "offline" | "hosted" | "local";
      has_key: boolean;
      base_url: string;
      model: string;
      warnings: string[];
    }
  | {
      ok: false;
      mode: "offline" | "hosted" | "local";
      has_key: boolean;
      base_url: string;
      model: string;
      warnings: string[];
      error: string;
    };

function baseUrlForMode(mode: "offline" | "hosted" | "local"): string {
  if (mode === "hosted") return "https://api.openai.com/v1";
  if (mode === "local") return (process.env.AI_BASE_URL || "http://localhost:11434/v1").replace(/\/+$/, "");
  return "";
}

function modelForMode(mode: "offline" | "hosted" | "local"): string {
  return process.env.OPENAI_MODEL || process.env.AI_MODEL || (mode === "local" ? "gpt-4.1-mini" : "gpt-4.1-mini");
}

function hasKeyForMode(mode: "offline" | "hosted" | "local"): boolean {
  if (mode === "offline") return false;
  if (mode === "hosted") return Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  return Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "");
}

export async function GET() {
  const mode = getAiMode();
  const has_key = hasKeyForMode(mode);
  const base_url = baseUrlForMode(mode);
  const model = modelForMode(mode);

  const warnings: string[] = [];

  if (mode === "hosted" && !has_key) warnings.push("OPENAI_API_KEY missing (hosted mode requires a server-side key).");
  if (mode === "local" && !base_url) warnings.push("AI_BASE_URL missing (local mode expects an OpenAI-compatible endpoint).");

  const resp: PingResp =
    mode === "hosted" && !has_key
      ? {
          ok: false,
          mode,
          has_key,
          base_url,
          model,
          warnings,
          error: "Hosted mode configured but OPENAI_API_KEY is not set.",
        }
      : { ok: true, mode, has_key, base_url, model, warnings };

  return NextResponse.json(resp, { status: resp.ok ? 200 : 400 });
}
