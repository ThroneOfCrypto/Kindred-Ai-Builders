export type AiMode = "offline" | "hosted" | "local";

export function getAiMode(): AiMode {
  const raw = (process.env.AI_MODE || "offline").toLowerCase().trim();
  if (raw === "hosted") return "hosted";
  if (raw === "local") return "local";
  return "offline";
}

function baseUrlForMode(mode: AiMode): string {
  if (mode === "hosted") return "https://api.openai.com/v1";
  // local
  const u = process.env.AI_BASE_URL || "http://localhost:11434/v1";
  return u.replace(/\/+$/, "");
}

function apiKeyForMode(mode: AiMode): string {
  // hosted must use OPENAI_API_KEY (or AI_API_KEY as a synonym)
  // local may be unauthenticated, but support AI_API_KEY/OPENAI_API_KEY.
  if (mode === "hosted") return process.env.OPENAI_API_KEY || process.env.AI_API_KEY || "";
  return process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
}

function modelForMode(mode: AiMode): string {
  // Keep the default small and fast; operators can override.
  return process.env.OPENAI_MODEL || process.env.AI_MODEL || (mode === "local" ? "gpt-4.1-mini" : "gpt-4.1-mini");
}

export async function chatCompletions(args: {
  mode: AiMode;
  system: string;
  user: string;
  temperature?: number;
}): Promise<
  | { ok: true; text: string; model: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }
  | { ok: false; error: string }
> {
  const { mode, system, user, temperature } = args;

  if (mode === "offline") {
    return { ok: false, error: "AI_MODE=offline" };
  }

  const baseUrl = baseUrlForMode(mode);
  const key = apiKeyForMode(mode);
  const url = `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers["authorization"] = `Bearer ${key}`;

  try {
    const model = modelForMode(mode);
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: typeof temperature === "number" ? temperature : 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return { ok: false, error: `AI request failed (${resp.status}): ${body.slice(0, 500)}` };
    }
    const data: any = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") return { ok: false, error: "AI response missing message content" };
    const usageRaw = data?.usage && typeof data.usage === "object" ? data.usage : {};
    const usage = {
      prompt_tokens: typeof usageRaw.prompt_tokens === "number" ? usageRaw.prompt_tokens : undefined,
      completion_tokens: typeof usageRaw.completion_tokens === "number" ? usageRaw.completion_tokens : undefined,
      total_tokens: typeof usageRaw.total_tokens === "number" ? usageRaw.total_tokens : undefined,
    };
    return { ok: true, text, model: String(data?.model || model), usage };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
