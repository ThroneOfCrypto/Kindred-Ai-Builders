import { NextResponse } from "next/server";

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
  var __sddeLocalProofChildPid: number | null | undefined;
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

export async function POST() {
  if (!localExecEnabled()) {
    return NextResponse.json(
      { ok: false, error: "local_executor_disabled", hint: "Local executor is disabled." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const pid = globalThis.__sddeLocalProofChildPid;
  if (!pid) {
    return NextResponse.json({ ok: true, stopped: false, hint: "No running proof process found." }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "kill_failed", hint: String(e?.message || e) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  globalThis.__sddeLocalProofChildPid = null;
  if (globalThis.__sddeLocalProofRun && globalThis.__sddeLocalProofRun.status === "running") {
    globalThis.__sddeLocalProofRun.status = "done";
    globalThis.__sddeLocalProofRun.signal = "SIGTERM";
  }

  return NextResponse.json({ ok: true, stopped: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
