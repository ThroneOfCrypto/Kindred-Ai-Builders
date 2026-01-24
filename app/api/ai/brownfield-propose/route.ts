import { NextResponse } from "next/server";

import type { BrownfieldReportV1 } from "../../../../lib/brownfield_scan";
import type { BrownfieldRouteMapV1 } from "../../../../lib/brownfield_routes";
import { getAiMode, chatCompletions } from "../../../../lib/server/ai_client";
import { brownfieldHeuristicInferenceV1 } from "../../../../lib/brownfield_infer";

export const runtime = "nodejs";

type ReqBody = {
  report: BrownfieldReportV1;
  route_map: BrownfieldRouteMapV1;
};

type RespBody =
  | {
      ok: true;
      mode: "offline" | "hosted" | "local";
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      created_utc: string;
      palettes: string[];
      spel: string;
      notes_md: string;
      warnings: string[];
    }
  | { ok: false; mode: "offline" | "hosted" | "local"; error: string; warnings: string[] };

function safeJsonSize(x: any): number {
  try {
    return Buffer.byteLength(JSON.stringify(x));
  } catch {
    return 0;
  }
}

function stripToMax(s: string, max: number): string {
  const x = String(s || "");
  if (x.length <= max) return x;
  return x.slice(0, max);
}

export async function POST(req: Request) {
  const mode = getAiMode();
  const warnings: string[] = [];

  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, mode, error: "Invalid JSON", warnings } satisfies RespBody, { status: 400 });
  }

  // Hard cap payload size to avoid accidental abuse.
  const approx = safeJsonSize(body);
  if (approx > 500_000) {
    return NextResponse.json(
      { ok: false, mode, error: "Payload too large", warnings: ["Reduce the Base repo pack or omit extra fields before proposing."] } satisfies RespBody,
      { status: 413 },
    );
  }

  // Deterministic baseline (always produced)
  const base = brownfieldHeuristicInferenceV1({ report: body.report, route_map: body.route_map });

  if (mode === "offline") {
    return NextResponse.json(
      {
        ok: true,
        mode,
        created_utc: base.created_utc,
        palettes: base.palettes,
        spel: base.spel,
        notes_md: base.notes_md,
        warnings: ["AI_MODE=offline: heuristic-only module."],
      } satisfies RespBody,
      { status: 200 },
    );
  }

  // Hosted/local: attempt refinement, but never skip the baseline.
  const system =
    "You are generating a PROPOSAL-ONLY SPEL module for a brownfield repo scan. " +
    "You must output STRICT JSON with keys: spel (string), notes_md (string), warnings (array of strings). " +
    "Do not include any secrets. Do not claim certainty. Keep it minimal.";

  const user =
    "Inputs (truncated):\n" +
    JSON.stringify({ report: body.report, route_map: body.route_map }, null, 2).slice(0, 40_000) +
    "\n\nBaseline heuristic module:\n" +
    stripToMax(base.spel, 20_000) +
    "\n\nTask: Improve the baseline by adding missing actors/scenes/flows only when supported by the routes and report. " +
    "Return JSON only.";

  const r = await chatCompletions({ mode, system, user, temperature: 0.2 });
  if (!r.ok) {
    return NextResponse.json(
      {
        ok: true,
        mode,
        created_utc: base.created_utc,
        palettes: base.palettes,
        spel: base.spel,
        notes_md: base.notes_md + "\n\n---\n\n## AI refinement failed\n\n" + r.error,
        warnings: ["AI refinement failed; returned heuristic baseline.", r.error],
      } satisfies RespBody,
      { status: 200 },
    );
  }

  try {
    const parsed = JSON.parse(r.text);
    const spel = typeof parsed?.spel === "string" ? parsed.spel : base.spel;
    const notes_md = typeof parsed?.notes_md === "string" ? parsed.notes_md : base.notes_md;
    const extra = Array.isArray(parsed?.warnings) ? parsed.warnings.map((x: any) => String(x)) : [];
    return NextResponse.json(
      {
        ok: true,
        mode,
        model: r.model,
        usage: r.usage,
        created_utc: base.created_utc,
        palettes: base.palettes,
        spel,
        notes_md,
        warnings: extra.length ? extra.slice(0, 20) : ["AI refinement succeeded (proposal only)."],
      } satisfies RespBody,
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: true,
        mode,
        created_utc: base.created_utc,
        palettes: base.palettes,
        spel: base.spel,
        notes_md: base.notes_md + "\n\n---\n\n## AI refinement parse failed\n\nModel returned non-JSON output.",
        warnings: ["AI refinement parse failed; returned heuristic baseline."],
      } satisfies RespBody,
      { status: 200 },
    );
  }
}
