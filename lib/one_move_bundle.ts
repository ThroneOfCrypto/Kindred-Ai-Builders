"use client";

import { strToU8 } from "fflate";

import { zipDeterministic } from "./deterministic_zip";
import { stableJsonText } from "./stable_json";
import { sha256Hex } from "./hash";

export type OneMoveBundleMetaV1 = {
  schema: "kindred.one_move_bundle_meta.v1";
  created_at_utc: string;
  project_id: string;
  project_name: string;
  contents: {
    locked_repo_pack_zip_sha256: string;
    deployment_pack_zip_sha256: string;
  };
  notes: string[];
};

function nowUtc(): string {
  return new Date().toISOString();
}

export function buildOneMoveDeployBundleZipV1(args: {
  project_id: string;
  project_name: string;
  locked_repo_pack_zip: Uint8Array;
  deployment_pack_zip: Uint8Array;
}): { zipBytes: Uint8Array; meta: OneMoveBundleMetaV1 } {
  const pid = String(args.project_id || "").trim() || "default";
  const name = String(args.project_name || "").trim() || pid;

  const repoSha = sha256Hex(args.locked_repo_pack_zip);
  const depSha = sha256Hex(args.deployment_pack_zip);

  const meta: OneMoveBundleMetaV1 = {
    schema: "kindred.one_move_bundle_meta.v1",
    created_at_utc: nowUtc(),
    project_id: pid,
    project_name: name,
    contents: {
      locked_repo_pack_zip_sha256: repoSha,
      deployment_pack_zip_sha256: depSha,
    },
    notes: [
      "This bundle is non-custodial. It contains NO persisted secrets by default.",
      "Deploy checklist and env.example are included in DEPLOYMENT/*.", 
      "After deploy, open /api/selfcheck to verify runtime + AI wiring.",
    ],
  };

  const readme =
    `# One-Move Deploy Bundle — ${name}\n\n` +
    `This ZIP contains exactly two deploy artefacts:\n\n` +
    `1) **ONE_MOVE/locked_repo_pack.zip** — the locked Repo Pack you deploy\n` +
    `2) **ONE_MOVE/deployment_pack.zip** — env.example + deploy checklist\n\n` +
    `## Fast path (Vercel)\n\n` +
    `1. Unzip **ONE_MOVE/locked_repo_pack.zip** to a folder\n` +
    `2. Push that folder to GitHub (or upload via GitHub web UI)\n` +
    `3. Import into Vercel and deploy\n` +
    `4. If enabling AI: use **ONE_MOVE/deployment_pack.zip → DEPLOYMENT/env.example** to set server env vars\n` +
    `5. Post-deploy: visit **/api/selfcheck** and **/ai**\n\n` +
    `## Proof Lane reminder\n\n` +
    `To reduce Vercel back-and-forth, run these locally (Node 24) *before* pushing:\n\n` +
    `- npm ci\n- npm run lint\n- npm run typecheck\n- npm run build\n- npm run vercel_preflight\n\n` +
    `Bundle meta is in ONE_MOVE/meta.json (sha256s included).\n`;

  const files: Record<string, Uint8Array> = {
    "ONE_MOVE/README.md": strToU8(readme),
    "ONE_MOVE/meta.json": strToU8(stableJsonText(meta, 2)),
    "ONE_MOVE/locked_repo_pack.zip": args.locked_repo_pack_zip,
    "ONE_MOVE/deployment_pack.zip": args.deployment_pack_zip,
  };

  return { zipBytes: zipDeterministic(files, { level: 6 }), meta };
}
