export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { APP_VERSION } from "../../../lib/version";
import { getAiMode } from "../../../lib/server/ai_client";

/**
 * Health endpoint (non-custodial, no secrets).
 *
 * Intended for:
 * - Vercel preview smoke checks
 * - CI/runtime sanity checks
 * - Debugging deploy provenance (commit/ref)
 */
export async function GET() {
  const now = new Date().toISOString();

  const info = {
    ok: true,
    now_utc: now,
    app_version: APP_VERSION,
    ai_mode: getAiMode(),
    vercel: {
      env: process.env.VERCEL_ENV || null,
      url: process.env.VERCEL_URL || null,
      git_commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      git_commit_ref: process.env.VERCEL_GIT_COMMIT_REF || null,
      git_repo_slug: process.env.VERCEL_GIT_REPO_SLUG || null,
    },
  };

  return NextResponse.json(info, { status: 200, headers: { "Cache-Control": "no-store" } });
}
