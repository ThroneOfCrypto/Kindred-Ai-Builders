import { NextResponse } from "next/server";

/**
 * Publish-ready evidence generation is Proof Lane only.
 *
 * Deploy Lane must never run build/lint/test tooling.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      kind: "proof_lane_only",
      message: "Publish-ready generation is disabled on Deploy Lane. Run tools/publish_ready.mjs locally.",
    },
    { status: 410 },
  );
}
