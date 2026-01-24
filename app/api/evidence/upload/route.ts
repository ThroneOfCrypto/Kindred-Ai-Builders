import { NextRequest, NextResponse } from "next/server";
import { readJsonWithLimit } from "../../../../lib/server/api_guard";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

function isProdLike(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.VERCEL || !!process.env.NOW_REGION;
}

function mapKindToFilename(kind: string): string {
  if (kind === "golden_path_export") return "golden_path_export.json";
  if (kind === "ux_walkthrough_notes") return "ux_walkthrough_notes.json";
  if (kind === "failure_record") return "failure_record.json";
  if (kind === "telemetry_assertion") return "telemetry_assertion.json";
  if (kind === "policy_reality_assertion") return "policy_reality_assertion.json";
  if (kind === "vercel_deploy_checklist") return "vercel_deploy_checklist.json";
  if (kind === "ai_posture_assertion") return "ai_posture_assertion.json";
  if (kind === "pack_determinism_assertion") return "pack_determinism_assertion.json";
  if (kind === "validator_smoke_assertion") return "validator_smoke_assertion.json";
  if (kind === "backup_restore_assertion") return "backup_restore_assertion.json";
  if (kind === "publish_ready_signoff") return "publish_ready_signoff.json";
  return "";
}

export async function POST(req: NextRequest) {
  // Serverless platforms (Vercel) have a read-only filesystem (except /tmp). Even with env misconfig,
  // we refuse to write in prod-like environments. Proof lane is CI; deploy lane is Vercel.
  if (isProdLike()) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_write_disabled",
        hint: "Evidence writes are disabled in production/Vercel. Use CI proof lane (publish_ready artifacts) or run locally with KINDRED_ALLOW_SERVER_EXEC=1.",
      },
      { status: 403 }
    );
  }

  if (process.env.KINDRED_ALLOW_SERVER_EXEC !== "1") {
    return NextResponse.json(
      { ok: false, error: "server_write_disabled", hint: "Set KINDRED_ALLOW_SERVER_EXEC=1 (local/dev only) to write evidence files." },
      { status: 403 }
    );
  }

  const parsed = await readJsonWithLimit<any>(req, { maxBytes: 200_000 });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, hint: parsed.hint }, { status: parsed.status });
  }

  const body: any = parsed.value;
  const kind = String(body?.kind || "");
  const payload = body?.payload;

  if (!kind || payload == null) {
    return NextResponse.json({ ok: false, error: "invalid_request", hint: "Expected { kind, payload }" }, { status: 400 });
  }

  const filename = mapKindToFilename(kind);
  if (!filename) {
    return NextResponse.json({ ok: false, error: "invalid_request", hint: "Unsupported kind" }, { status: 400 });
  }

  const repoRoot = process.cwd();
  const distDir = path.join(repoRoot, "dist");
  const publicDist = path.join(repoRoot, "public", "dist");

  // Local/dev convenience: write to dist/ + public/dist so the UI can read it.
  fs.mkdirSync(distDir, { recursive: true });
  fs.mkdirSync(publicDist, { recursive: true });

  const text = JSON.stringify(payload, null, 2) + "\n";
  fs.writeFileSync(path.join(distDir, filename), text, "utf8");
  fs.writeFileSync(path.join(publicDist, filename), text, "utf8");

  // Make it explicit where writes went, and remind humans that production is different.
  return NextResponse.json({
    ok: true,
    wrote: [`dist/${filename}`, `public/dist/${filename}`],
    note: "Writes are blocked in prod/Vercel; use CI artifacts",
  });
}
