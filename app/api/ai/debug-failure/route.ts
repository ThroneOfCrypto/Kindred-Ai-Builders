export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { readJsonWithLimit } from "../../../../lib/server/api_guard";
import { getAiMode, chatCompletions } from "../../../../lib/server/ai_client";
import { proposalOnlySystemGuard } from "../../../../lib/server/ai_posture";

type ReqBody = {
  project_id?: string;
  stage?: string;
  environment?: string;
  logs_text?: string;
  context?: {
    spec_locked_zip_sha256?: string;
    repo_locked_zip_sha256?: string;
    blueprint_pack_sha256?: string;
    kits?: string[];
  };
};

function deterministicFallback(body: ReqBody): { text: string } {
  const stage = String(body.stage || "build");
  const env = String(body.environment || "deploy");
  return {
    text:
      [
        `1) Reproduce the failure in the most similar environment you can (stage=${stage}, env=${env}).`,
        "2) Confirm required environment variables exist (build-time vs runtime).",
        "3) If it's a dependency error: reinstall under the intended Node version and confirm lockfile consistency.",
        "4) If it's a Next.js page-data error: ensure runtime-only code is not evaluated during build.",
        "5) Capture the full log and store it as a failure record (keep the first failure; don't overwrite).",
      ].join("\n") +
      "\n\nNote: This is an offline fallback. Enable hosted/local AI mode for tailored suggestions.",
  };
}

function redactSecrets(input: string): { text: string; redacted: boolean } {
  let out = String(input || "");
  let changed = false;

  const rules: Array<[RegExp, string]> = [
    [/sk-[A-Za-z0-9]{20,}/g, "sk-[REDACTED]"],
    [/AKIA[0-9A-Z]{16}/g, "AKIA[REDACTED]"],
    [/(Bearer|Token)\s+[A-Za-z0-9\-\._~\+\/]+=*/gi, "$1 [REDACTED]"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  ];

  for (const [re, repl] of rules) {
    const next = out.replace(re, repl);
    if (next !== out) changed = true;
    out = next;
  }

  return { text: out, redacted: changed };
}

export async function POST(req: Request) {
  const mode = getAiMode();
  const parsed = await readJsonWithLimit<ReqBody>(req, { maxBytes: 200_000 });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, hint: parsed.hint }, { status: parsed.status });
  }
  const body: ReqBody = (parsed.value || {}) as ReqBody;


  const logsRaw = String(body.logs_text || "").slice(0, 60_000); // avoid huge payloads
  const redacted = redactSecrets(logsRaw);
  const logs = redacted.text;
  const stage = String(body.stage || "build");
  const environment = String(body.environment || "other");
  const kits = Array.isArray(body.context?.kits) ? body.context?.kits : [];

  // Offline-only mode: return deterministic fallback.
  if (mode === "offline") {
    return NextResponse.json({ ok: true, mode, redacted: redacted.redacted, ...deterministicFallback(body) });
  }

  const system = proposalOnlySystemGuard("Return plain text with a numbered list and short section headings.");

  const user =
    [
      "TASK: Debug this failure and propose safe next steps. Output plain text.",
      "",
      `stage=${stage}`,
      `environment=${environment}`,
      kits.length ? `kits=${kits.join(", ")}` : "kits=(none)",
      "",
      "LOGS (truncated):",
      logs,
      "",
      "CONTEXT SHAS:",
      `spec_locked_zip_sha256=${String(body.context?.spec_locked_zip_sha256 || "")}`,
      `repo_locked_zip_sha256=${String(body.context?.repo_locked_zip_sha256 || "")}`,
      `blueprint_pack_sha256=${String(body.context?.blueprint_pack_sha256 || "")}`,
    ].join("\n");

  const r = await chatCompletions({
    mode,
    system,
    user,
    temperature: 0.2,
  });

  if (!r.ok) {
    return NextResponse.json({ ok: true, mode, redacted: redacted.redacted, ...deterministicFallback(body), warning: "ai_unavailable" });
  }

  return NextResponse.json({ ok: true, mode, redacted: redacted.redacted, text: r.text });
}
