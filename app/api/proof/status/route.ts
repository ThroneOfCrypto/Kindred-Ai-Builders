import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RunState = {
  run_id: string;
  started_at_utc: string;
  finished_at_utc?: string;
  status: "running" | "done";
  exit_code?: number;
  signal?: string;
  log_file: string;
  command: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __sddeLocalProofRun: RunState | null | undefined;
}

function isProdLike(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL) || Boolean(process.env.NOW_REGION);
}

function localExecEnabled(): boolean {
  if (isProdLike()) return false;
  return process.env.KINDRED_ALLOW_SERVER_EXEC === "1";
}

function readJsonIfExists(fp: string): any | null {
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const enabled = localExecEnabled();
  const repoRoot = process.cwd();
  const fp = path.join(repoRoot, "dist", "evidence", "local_proof_run_status.json");

  const st = globalThis.__sddeLocalProofRun || readJsonIfExists(fp);

  return NextResponse.json(
    {
      ok: true,
      enabled,
      run: st || null,
      hint: enabled
        ? "Local executor enabled (dev-only)."
        : "Local executor disabled. Set KINDRED_ALLOW_SERVER_EXEC=1 (local/dev only). On Vercel, proof runs in CI.",
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
