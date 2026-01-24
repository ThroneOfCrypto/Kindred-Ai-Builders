import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "kindred-ai-builders", ts: new Date().toISOString() });
}
