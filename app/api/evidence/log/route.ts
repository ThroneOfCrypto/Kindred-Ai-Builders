export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

function evidenceApiEnabled(): boolean {
  // Local-first convenience.
  // Deploy Lane posture: log access is NEVER enabled in production-like runtimes (including Vercel).
  const prodLike = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  return prodLike ? false : true;
}

function safeName(x: string): string {
  const v = String(x || "").trim();
  if (!v) return "";
  if (!/^[a-zA-Z0-9._-]+$/.test(v)) return "";
  // Avoid path traversal via .. segments
  if (v.includes("..")) return "";
  return v;
}

/**
 * Evidence log fetcher.
 *
 * Default posture:
 * - Enabled in dev (NODE_ENV != production).
 * - Disabled in prod/Vercel (hard-off, no override).
 *
 * Query:
 * - f=<filename inside dist/evidence>
 */
export async function GET(req: Request) {
  if (!evidenceApiEnabled()) {
    return NextResponse.json({ ok: false, error: "Evidence API disabled" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const url = new URL(req.url);
  const f = safeName(url.searchParams.get("f") || "");
  if (!f) {
    return NextResponse.json({ ok: false, error: "Missing or invalid 'f'" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const repoRoot = process.cwd();
  const evdir = path.resolve(repoRoot, "dist", "evidence");
  const p = path.resolve(evdir, f);

  // Enforce containment (avoid edge cases with prefix matches).
  const evPrefix = evdir.endsWith(path.sep) ? evdir : evdir + path.sep;
  if (!p.startsWith(evPrefix)) {
    return NextResponse.json({ ok: false, error: "Invalid path" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    if (!fs.existsSync(p)) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const text = fs.readFileSync(p, "utf8");
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e || "Failed") }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
