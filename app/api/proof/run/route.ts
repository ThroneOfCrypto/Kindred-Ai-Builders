import { NextResponse } from "next/server";

/**
 * Proof execution is Proof Lane only.
 * Deploy Lane (Vercel) must never spawn processes or run CI tooling.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      kind: "proof_lane_only",
      message: "Proof execution is disabled on Deploy Lane. Run proof:gate locally.",
    },
    { status: 410 },
  );
}
