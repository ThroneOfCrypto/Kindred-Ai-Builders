export const runtime = "nodejs";

export async function GET() {
  const aiMode = process.env.AI_MODE ?? "offline";
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);
  const localBaseUrl = process.env.AI_LOCAL_BASE_URL ?? "";
  const hostedBaseUrl = process.env.AI_HOSTED_BASE_URL ?? "https://api.openai.com/v1";

  return Response.json({
    ok: true,
    ai_mode: aiMode,
    env: {
      has_openai_api_key: hasOpenAIKey,
      ai_local_base_url: localBaseUrl,
      ai_hosted_base_url: hostedBaseUrl
    },
    note: "Status only. This endpoint does not call any external service."
  });
}
