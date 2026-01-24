export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

function evidenceApiEnabled(): boolean {
  // Local-first convenience.
  // In production-like runtimes (including Vercel), this endpoint is OFF unless explicitly enabled.
  const prodLike = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  const enabled = process.env.SDDE_ENABLE_EVIDENCE_API === "1";
  return prodLike ? enabled : true;
}

function readJsonIfExists(p: string): any | null {
  try {
    if (!fs.existsSync(p)) return null;
    const text = fs.readFileSync(p, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Evidence status (local/proof lane convenience)
 *
 * - Reads dist/proof_status.json (or public/dist/proof_status.json)
 * - Never claims success without evidence
 */
export async function GET() {
  if (!evidenceApiEnabled()) {
    return NextResponse.json({ ok: false, error: "Evidence API disabled" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const repoRoot = process.cwd();
  const p1 = path.join(repoRoot, "public", "dist", "proof_status.json");
  const p2 = path.join(repoRoot, "dist", "proof_status.json");
  const data = readJsonIfExists(p1) || readJsonIfExists(p2);

  if (!data) {
    return NextResponse.json(
      {
        ok: false,
        hint: "No proof_status.json found. Run: npm run proof:gate (hard) or npm run proof:loop (evidence-only).",
      },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({ ok: true, ...data }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
