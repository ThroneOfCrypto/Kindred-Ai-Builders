import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeMode(value: string | undefined): "offline" | "hosted" | "local" {
  if (value === "hosted" || value === "local" || value === "offline") return value;
  return "offline";
}

export async function GET() {
  const mode = normalizeMode(process.env.AI_MODE);
  const hasHostedKey = Boolean(process.env.OPENAI_API_KEY);
  const hasLocalBaseUrl = Boolean(process.env.OPENAI_COMPAT_BASE_URL);

  return NextResponse.json(
    {
      schema: "kindred.ai_status.v1",
      mode,
      hosted: { has_key: hasHostedKey },
      local: { has_base_url: hasLocalBaseUrl },
      notes: [
        "This endpoint never calls external services.",
        "Set env vars in Vercel Project Settings if you want Hosted/Local.",
      ],
    },
    { status: 200 }
  );
}
