export const runtime = "nodejs";

type Payload = {
  mode: "offline" | "hosted" | "local";
  baseUrl?: string;
};

function asString(x: unknown, fallback = ""): string {
  return typeof x === "string" ? x : fallback;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const p = body as Partial<Payload>;
  const mode: Payload["mode"] = p.mode === "hosted" || p.mode === "local" ? p.mode : "offline";

  if (mode === "offline") {
    return Response.json({ ok: true, mode: "offline", message: "Offline mode: no network calls." });
  }

  const baseUrl = asString(p.baseUrl).trim();
  if (!baseUrl) {
    return Response.json({ ok: false, error: "baseUrl is required for hosted/local test." }, { status: 400 });
  }

  const url = baseUrl.replace(/\/+$/, "") + "/models";

  try {
    const headers: Record<string, string> = {};
    if (mode === "hosted") {
      const apiKey = process.env.OPENAI_API_KEY ?? "";
      if (!apiKey) {
        return Response.json({ ok: false, error: "OPENAI_API_KEY is missing in environment." }, { status: 400 });
      }
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, { method: "GET", headers });
    const text = await res.text();

    return Response.json({
      ok: res.ok,
      mode,
      url,
      status: res.status,
      body_preview: text.slice(0, 500)
    });
  } catch (e: any) {
    return Response.json({ ok: false, mode, url, error: e?.message ?? String(e) }, { status: 500 });
  }
}
