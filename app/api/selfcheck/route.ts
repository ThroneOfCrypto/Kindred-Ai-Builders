import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowUtc(): string {
  return new Date().toISOString();
}

function isProdLike(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL) || Boolean(process.env.NOW_REGION);
}

function aiMode(): string {
  return String(process.env.AI_MODE || "offline").trim() || "offline";
}

function aiRequiredEnvMissing(mode: string): string[] {
  const miss: string[] = [];
  if (mode === "hosted") {
    if (!String(process.env.OPENAI_API_KEY || "").trim()) miss.push("OPENAI_API_KEY");
    if (!String(process.env.OPENAI_MODEL || "").trim()) miss.push("OPENAI_MODEL");
  }
  if (mode === "local") {
    if (!String(process.env.OPENAI_BASE_URL || "").trim()) miss.push("OPENAI_BASE_URL");
    // AI_API_KEY is optional in local mode.
    if (!String(process.env.AI_MODEL || "").trim()) miss.push("AI_MODEL");
  }
  return miss;
}

export async function GET() {
  const mode = aiMode();
  const missing = aiRequiredEnvMissing(mode);

  return NextResponse.json(
    {
      ok: true,
      checked_at_utc: nowUtc(),
      env: {
        node_env: process.env.NODE_ENV || "",
        vercel: Boolean(process.env.VERCEL),
        prod_like: isProdLike(),
        node_version: process.version,
      },
      app: {
        // This is intentionally lightweight; full app version is served by /api/runtime-meta.
        ai_mode: mode,
        ai_ready: mode === "offline" ? true : missing.length === 0,
        ai_missing_env: missing,
      },
      hints:
        mode === "offline"
          ? ["AI is OFF (offline). This is the safest default."]
          : missing.length
            ? ["AI mode is enabled but required env vars are missing.", "Set server-side env vars and redeploy, then re-check."]
            : ["AI wiring looks present. Test /ai/ping next."],
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
