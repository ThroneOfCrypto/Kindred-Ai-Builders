import { NextResponse } from "next/server";

function pickEnv(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  return String(v);
}

// Deliberately returns only non-sensitive, diagnostic fields.
export async function GET() {
  const meta = {
    vercel: {
      env: pickEnv("VERCEL_ENV"),
      url: pickEnv("VERCEL_URL"),
      region: pickEnv("VERCEL_REGION"),
      git_commit_sha: pickEnv("VERCEL_GIT_COMMIT_SHA"),
      git_commit_ref: pickEnv("VERCEL_GIT_COMMIT_REF"),
    },
    node: {
      version: process.version,
    },
    time_utc: new Date().toISOString(),
  };

  return NextResponse.json(meta, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
