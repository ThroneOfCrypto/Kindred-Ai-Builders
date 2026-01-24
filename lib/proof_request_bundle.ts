"use client";

import { zipDeterministic } from "./deterministic_zip";
import { stableJsonText } from "./stable_json";
import { APP_VERSION } from "./version";
import { sha256Hex } from "./hash";

export type ProofRequestIntent = "proof" | "draft";

export type ProofStepV1 = {
  id: string;
  title: string;
  cmd: string;
  required: boolean;
};

export type ProofRequestV1 = {
  schema: "kindred.proof_request.v1";
  created_at_utc: string;
  app_version: string;
  intent: ProofRequestIntent;
  project_id: string;
  project_name: string;
  rigor_level: string;
  executor_contract: {
    node: "24.x";
    notes: string[];
  };
  inputs: {
    publish_ready_bundle_sha256: string;
    publish_ready_overall: string;
    publish_ready_included_paths: number;
    library_lock_sha256?: string;
    library_lock_entries?: number;
  };
  proof_steps: ProofStepV1[];
  tighten_later?: string[];
};

export type ProofRequestBundleArgs = {
  projectId: string;
  projectName: string;
  rigor: string;
  publishReadyZipBytes: Uint8Array;
  publishReadyMeta?: { overall?: string; included_paths?: string[] };
  libraryLockJsonBytes?: Uint8Array;
  libraryLockEntries?: number;
};

function utcNow(): string {
  return new Date().toISOString();
}

function buildReadme(request: ProofRequestV1): string {
  const steps = request.proof_steps
    .map((s) => `- ${s.required ? "[REQ]" : "[OPT]"} ${s.title}: ${s.cmd}`)
    .join("\n");

  return [
    "# Proof Request bundle",
    "",
    "This bundle was exported from the Kindred Director website.",
    "It is meant to be executed in a physics-compliant Proof Lane (CI or local).",
    "",
    `- project_id: ${request.project_id}`,
    `- project_name: ${request.project_name}`,
    `- rigor: ${request.rigor_level}`,
    `- node_required: ${request.executor_contract.node}`,
    "",
    "## Files",
    "- proof_request.json  (the contract and the steps)",
    "- publish_ready_bundle.zip (exported packs, ledger, and local reports)",
    request.inputs.library_lock_sha256 ? "- library.lock.json (optional marketplace lockfile)" : "- library.lock.json (optional marketplace lockfile; not included)",
    "",
    "## Run",
    "From the repo root that contains the runner tool:",
    "",
    "```bash",
    "node tools/run_proof_request_bundle.mjs path/to/proof_request_bundle__*.zip",
    "```",
    "",
    "The runner will:",
    "1) unzip this bundle",
    "2) unzip publish_ready_bundle.zip",
    "3) extract repo_pack.zip into a temporary workdir",
    request.inputs.library_lock_sha256 ? "4) if library.lock.json exists, apply it to the extracted repo (library_apply)" : "4) (optional) apply library.lock.json if present",
    "5) run the proof steps below in that repo",
    "6) write logs and reports under dist/evidence/ in the current repo",
    "",
    "## Proof steps",
    steps || "(none)",
    "",
  ].join("\n");
}

export async function buildProofRequestBundleZip(args: ProofRequestBundleArgs): Promise<{ zipBytes: Uint8Array; request: ProofRequestV1 }> {
  const publishSha = await sha256Hex(args.publishReadyZipBytes);
  const libLockSha = args.libraryLockJsonBytes ? await sha256Hex(args.libraryLockJsonBytes) : undefined;

  const steps: ProofStepV1[] = [
    { id: "npm_ci", title: "Install (deterministic)", cmd: "npm ci", required: true },
    { id: "lint", title: "Lint", cmd: "npm run lint", required: true },
    { id: "typecheck", title: "Typecheck", cmd: "npm run typecheck", required: true },
    { id: "build", title: "Build", cmd: "npm run build", required: true },
    { id: "governance_check", title: "Governance check", cmd: "npm run governance_check", required: true },
    { id: "publish_ready", title: "Publish-ready evidence", cmd: "npm run publish_ready", required: false },
  ];

  const request: ProofRequestV1 = {
    schema: "kindred.proof_request.v1",
    created_at_utc: utcNow(),
    app_version: APP_VERSION,
    intent: "proof",
    project_id: String(args.projectId || "default"),
    project_name: String(args.projectName || "project"),
    rigor_level: String(args.rigor || "safe"),
    executor_contract: {
      node: "24.x",
      notes: [
        "Proof Lane must use Node 24.x (per repo engines + .nvmrc).",
        "Linux executor preferred (case-sensitive paths).",
        "Network access required for npm registry (or approved mirror/cache).",
        "Deploy Lane (Vercel) is not Proof Lane.",
      ],
    },
    inputs: {
      publish_ready_bundle_sha256: publishSha,
      publish_ready_overall: String(args.publishReadyMeta?.overall || "unknown"),
      publish_ready_included_paths: Array.isArray(args.publishReadyMeta?.included_paths)
        ? args.publishReadyMeta!.included_paths!.length
        : 0,
      ...(libLockSha ? { library_lock_sha256: libLockSha, library_lock_entries: Number(args.libraryLockEntries || 0) } : {}),
    },
    proof_steps: steps,
    tighten_later: [
      "Treat browser exports as draft evidence; only CI/local proof logs are authoritative.",
      "If Proof Lane is frequently failing due to dependency volatility, add a vetted npm cache/mirror.",
    ],
  };

  const files: Record<string, Uint8Array> = {};
  files["proof_request.json"] = new TextEncoder().encode(stableJsonText(request, 2));
  files["publish_ready_bundle.zip"] = args.publishReadyZipBytes;
  files["README.md"] = new TextEncoder().encode(buildReadme(request));
  files["meta/publish_ready_bundle_sha256.txt"] = new TextEncoder().encode(publishSha + "\n");
  if (args.libraryLockJsonBytes && libLockSha) {
    files["library.lock.json"] = args.libraryLockJsonBytes;
    files["meta/library_lock_sha256.txt"] = new TextEncoder().encode(libLockSha + "\n");
  }

  const zipBytes = zipDeterministic(files);
  return { zipBytes, request };
}
