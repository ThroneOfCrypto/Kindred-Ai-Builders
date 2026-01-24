export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { readJsonWithLimit, requireObject } from "../../../../lib/server/api_guard";
import { getAiMode, chatCompletions } from "../../../../lib/server/ai_client";
import { proposalOnlySystemGuard } from "../../../../lib/server/ai_posture";

function deterministicSuggestion(state: any): string {
  const brand = state?.design?.brand?.name || "your brand";
  const intent = state?.intent?.build_intent || "product";
  const palettes = Array.isArray(state?.intent?.palettes) ? state.intent.palettes : [];
  return [
    `1) Tighten the homepage promise for ${brand}.`,
    `2) For intent=${intent}, propose 3 landing-page variants (hero + features + proof) that still match palettes: ${
      palettes.join(", ") || "none"
    }.`,
    "3) Add one clear primary action per page; remove secondary actions until metrics justify them.",
    "4) Keep tokens consistent: pick one radius + one density level and commit.",
  ].join("\n");
}

export async function POST(req: Request) {
  const parsed = await readJsonWithLimit<any>(req, { maxBytes: 200_000 });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, hint: parsed.hint }, { status: parsed.status });
  }
  const body: any = parsed.value || {};
  const st = requireObject(body?.state, "state");
  const state = st.ok ? st.value : {};

  const mode = getAiMode();

  if (mode === "offline") {
    return NextResponse.json({ ok: true, mode: "offline", text: deterministicSuggestion(state) });
  }

  const prompt =
    `Given this project state JSON, propose 5 ranked improvements. ` +
    `Focus on IA, sections, tokens, and clarity. Output plain text.\n\nSTATE:\n${JSON.stringify(state, null, 2)}`;

  const r = await chatCompletions({
    mode,
    system: proposalOnlySystemGuard("You are a product design advisor. Give concise ranked suggestions. Do not invent capabilities."),
    user: prompt,
    temperature: 0.3,
  });

  if (!r.ok) {
    return NextResponse.json({ ok: true, mode, text: deterministicSuggestion(state), warning: "ai_unavailable" });
  }
  return NextResponse.json({ ok: true, mode, model: r.model, usage: r.usage, text: r.text });
}
