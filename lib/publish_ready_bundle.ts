"use client";

import { zipDeterministic } from "./deterministic_zip";
import { stableJsonText } from "./stable_json";
import { decodeBase64, tryReadZip, type SpecPack } from "./spec_pack";
import { validateSpecPack, type ValidationReport } from "./validation";
import { buildDeterminismReport, type DeterminismReportV1 } from "./determinism_report";
import { getPackGovernance, getLockedPackB64, isPackLocked } from "./pack_governance";
import { getRepoPackGovernance, isRepoPackLocked } from "./repo_pack_governance";
import { getLockedRepoPackBytes } from "./repo_pack_bytes_store";
import { lastBasePackKeyForProject, lastProposalPackKeyForProject, LEGACY_LAST_BASE_PACK_KEY, LEGACY_LAST_PROPOSAL_PACK_KEY } from "./state";
import { getLatestVerifyReport, type VerifyReport } from "./verify";
import { loadEvidenceLedger, type EvidenceLedgerV1 } from "./evidence_ledger";
import { listFailureRecordsV1, type FailureRecordV1 } from "./failure_records";
import { getDogfoodReport, type DogfoodReportV1 } from "./dogfood";
import { getBackupHistory, type BackupHistoryV1 } from "./backup_history";
import { getLatestBlueprintPackJson, getBlueprintPackMeta, type BlueprintPackStoreMetaV1 } from "./blueprint_pack_store";
import { sha256Hex } from "./hash";
import { APP_VERSION, VALIDATOR_VERSION } from "./version";

export type ReleaseTri = "pass" | "warn" | "fail";

export type PublishReadyBundleMetaV1 = {
  schema: "kindred.publish_ready_bundle_meta.v1";
  created_at_utc: string;
  app_version: string;
  validator_version: string;
  project_id: string;
  overall: ReleaseTri;
  notes?: string[];
  included_paths: string[];
  inputs?: {
    spec_base_zip_sha256?: string;
    spec_proposal_zip_sha256?: string;
    spec_locked_zip_sha256?: string;
    repo_locked_zip_sha256?: string;
  };
};

export type SchemaValidationPackStatusV1 = {
  present: boolean;
  zip_sha256?: string;
  manifest_issues?: string[];
  validation?: ValidationReport;
  parse_errors?: string[];
};

export type SchemaValidationReportV1 = {
  schema: "kindred.schema_validation_report.v1";
  generated_at_utc: string;
  app_version: string;
  validator_version: string;
  project_id: string;
  packs: {
    base?: SchemaValidationPackStatusV1;
    proposal?: SchemaValidationPackStatusV1;
    locked?: SchemaValidationPackStatusV1;
  };
  checks: {
    ok: boolean;
    warnings: string[];
    errors: string[];
  };
};

export type GoldenPathStepV1 = {
  id: string;
  title: string;
  required: boolean;
  status: ReleaseTri;
  notes?: string[];
};

export type GoldenPathReportV1 = {
  schema: "kindred.golden_path_report.v1";
  captured_at_utc: string;
  project_id: string;
  overall: ReleaseTri;
  steps: GoldenPathStepV1[];
  notes?: string[];
};

export type ReleaseChecklistReportV1 = {
  schema: "kindred.release_checklist_report.v1";
  captured_at_utc: string;
  project_id: string;
  overall: ReleaseTri;
  checks: Array<{
    id: string;
    title: string;
    status: ReleaseTri;
    notes?: string[];
  }>;
};

export type PublishReadyBundleResult =
  | { ok: true; zipBytes: Uint8Array; meta: PublishReadyBundleMetaV1 }
  | { ok: false; error: string; details?: string[] };

function utcNow(): string {
  return new Date().toISOString();
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function safeLsGet(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

async function fetchText(pathname: string): Promise<string | null> {
  const p = String(pathname || "").trim();
  if (!p) return null;
  try {
    const res = await fetch(p, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function maybeSha(bytes?: Uint8Array | null): Promise<string | undefined> {
  if (!bytes) return undefined;
  try {
    return await sha256Hex(bytes);
  } catch {
    return undefined;
  }
}

function computeOverall(steps: Array<{ required: boolean; status: ReleaseTri }>): ReleaseTri {
  for (const s of steps) {
    if (s.required && s.status === "fail") return "fail";
  }
  for (const s of steps) {
    if (s.required && s.status === "warn") return "warn";
  }
  for (const s of steps) {
    if (!s.required && (s.status === "warn" || s.status === "fail")) return "warn";
  }
  return "pass";
}

function packStatusFromValidation(args: {
  present: boolean;
  zipBytes?: Uint8Array;
  pack?: SpecPack;
  parseErrors?: string[];
}): SchemaValidationPackStatusV1 {
  const manifestIssues: string[] = [];
  if (!args.present) {
    return { present: false, parse_errors: args.parseErrors };
  }
  if (!args.zipBytes) {
    return { present: true, parse_errors: ["Zip bytes missing."] };
  }

  if (!args.pack) {
    return { present: true, parse_errors: (args.parseErrors || []).length ? args.parseErrors : ["Failed to parse pack."] };
  }

  // Manifest sanity checks (very basic)
  const m: any = (args.pack as any).manifest;
  if (!m || typeof m !== "object") manifestIssues.push("manifest missing or invalid");
  if (!m?.schema || typeof m.schema !== "string") manifestIssues.push("manifest.schema missing");
  if (!m?.spec_pack_version || typeof m.spec_pack_version !== "string") manifestIssues.push("manifest.spec_pack_version missing");

  let validation: ValidationReport | undefined;
  try {
    validation = validateSpecPack(args.pack);
  } catch {
    validation = undefined;
  }

  return {
    present: true,
    zip_sha256: undefined,
    manifest_issues: manifestIssues.length ? manifestIssues : undefined,
    validation,
    parse_errors: (args.parseErrors || []).length ? args.parseErrors : undefined,
  };
}

async function parsePackFromB64(label: string, b64: string): Promise<{ ok: boolean; zipBytes?: Uint8Array; pack?: SpecPack; errors: string[] }> {
  const errors: string[] = [];
  const trimmed = String(b64 || "").trim();
  if (!trimmed) return { ok: false, errors: [`${label}: missing`], zipBytes: undefined, pack: undefined };

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(trimmed);
  } catch {
    return { ok: false, errors: [`${label}: base64 decode failed`], zipBytes: undefined, pack: undefined };
  }

  try {
    const parsed = await tryReadZip(bytes);
    if (!parsed.ok || !parsed.pack) {
      errors.push(`${label}: zip read failed`);
      return { ok: false, zipBytes: bytes, pack: undefined, errors };
    }
    return { ok: true, zipBytes: bytes, pack: parsed.pack, errors };
  } catch {
    errors.push(`${label}: zip read threw`);
    return { ok: false, zipBytes: bytes, pack: undefined, errors };
  }
}

function mdTemplateReleaseNotes(): string {
  return [
    "# Release Notes",
    "",
    "## Summary",
    "-",
    "",
    "## Changes",
    "-",
    "",
    "## Risk",
    "-",
    "",
    "## Rollback",
    "-",
    "",
  ].join("\n");
}

function mdTemplateSecurity(): string {
  return [
    "# Security Report",
    "",
    "## Data storage",
    "-",
    "",
    "## Threat model notes",
    "-",
    "",
    "## Dependency posture",
    "-",
    "",
    "## Known risks",
    "-",
    "",
  ].join("\n");
}

function mdTemplateAccessibility(): string {
  return [
    "# Accessibility Report",
    "",
    "## Keyboard navigation",
    "-",
    "",
    "## Contrast",
    "-",
    "",
    "## Screen reader",
    "-",
    "",
    "## Known issues",
    "-",
    "",
  ].join("\n");
}

function mdTemplatePerformance(): string {
  return [
    "# Performance Report",
    "",
    "## Build output",
    "-",
    "",
    "## Web vitals",
    "-",
    "",
    "## Known hot paths",
    "-",
    "",
  ].join("\n");
}

function buildPublishReadyReportMd(args: {
  projectId: string;
  overall: ReleaseTri;
  checks: ReleaseChecklistReportV1["checks"];
  determinism: DeterminismReportV1;
  schemaValidation: SchemaValidationReportV1;
  goldenPath: GoldenPathReportV1;
  verifyReport: VerifyReport | null;
}): string {
  const lines: string[] = [];
  lines.push("# Publish-ready proof report");
  lines.push("");
  lines.push(`Project: ${args.projectId}`);
  lines.push(`Captured at: ${utcNow()}`);
  lines.push(`Overall: ${args.overall.toUpperCase()}`);
  lines.push("");
  lines.push("## Checklist summary");
  for (const c of args.checks) {
    lines.push(`- ${c.status.toUpperCase()}: ${c.title}${c.notes && c.notes.length ? ` (${c.notes.join("; ")})` : ""}`);
  }
  lines.push("");
  lines.push("## Required reports included in this bundle");
  lines.push("- dist/publish_ready_report.md");
  lines.push("- dist/schema_validation_report.json");
  lines.push("- dist/determinism_report.json");
  lines.push("- dist/golden_path_report.json");
  lines.push("- dist/sdde_verify_report.json");
  lines.push("- dist/release_notes.md");
  lines.push("- dist/security_report.md");
  lines.push("- dist/accessibility_report.md");
  lines.push("- dist/performance_report.md");
  lines.push("");
  lines.push("## Determinism report notes");
  lines.push(`- determinism.checks.ok: ${args.determinism.checks.ok}`);
  if (args.determinism.checks.warnings.length) {
    for (const w of args.determinism.checks.warnings) lines.push(`- WARN: ${w}`);
  }
  lines.push("");
  lines.push("## Schema validation notes");
  lines.push(`- schema_validation.checks.ok: ${args.schemaValidation.checks.ok}`);
  if (args.schemaValidation.checks.errors.length) {
    for (const e of args.schemaValidation.checks.errors) lines.push(`- ERROR: ${e}`);
  }
  if (args.schemaValidation.checks.warnings.length) {
    for (const w of args.schemaValidation.checks.warnings) lines.push(`- WARN: ${w}`);
  }
  lines.push("");
  lines.push("## Golden path notes");
  lines.push(`- golden_path.overall: ${args.goldenPath.overall}`);
  if (args.goldenPath.notes && args.goldenPath.notes.length) {
    for (const n of args.goldenPath.notes) lines.push(`- NOTE: ${n}`);
  }
  lines.push("");
  lines.push("## Latest Verify report");
  if (args.verifyReport) {
    lines.push(`- overall: ${args.verifyReport.overall}`);
    lines.push(`- plan: ${args.verifyReport.plan_id} (${args.verifyReport.plan_version})`);
    lines.push(`- captured_at_utc: ${args.verifyReport.captured_at_utc}`);
  } else {
    lines.push("- missing (WARN)");
  }
  lines.push("");
  return lines.join("\n");
}

export async function buildPublishReadyProofBundleZip(projectId: string): Promise<PublishReadyBundleResult> {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, error: "Missing project id." };

  const notes: string[] = [];

  // Read Spec pack caches (base/proposal) and locked snapshot.
  const baseB64 = safeLsGet(lastBasePackKeyForProject(pid)) || safeLsGet(LEGACY_LAST_BASE_PACK_KEY);
  const proposalB64 = safeLsGet(lastProposalPackKeyForProject(pid)) || safeLsGet(LEGACY_LAST_PROPOSAL_PACK_KEY);
  const lockedB64 = getLockedPackB64(pid) || "";

  const baseParsed = await parsePackFromB64("Base", baseB64);
  const proposalParsed = await parsePackFromB64("Proposal", proposalB64);
  const lockedParsed = await parsePackFromB64("Locked", lockedB64);

  const baseZipSha = await maybeSha(baseParsed.zipBytes);
  const proposalZipSha = await maybeSha(proposalParsed.zipBytes);
  const lockedZipSha = await maybeSha(lockedParsed.zipBytes);

  // Schema validation report
  const svWarnings: string[] = [];
  const svErrors: string[] = [];

  const baseStatus = packStatusFromValidation({
    present: Boolean(baseParsed.zipBytes),
    zipBytes: baseParsed.zipBytes,
    pack: baseParsed.pack,
    parseErrors: baseParsed.errors,
  });
  baseStatus.zip_sha256 = baseZipSha;

  const proposalStatus = packStatusFromValidation({
    present: Boolean(proposalParsed.zipBytes),
    zipBytes: proposalParsed.zipBytes,
    pack: proposalParsed.pack,
    parseErrors: proposalParsed.errors,
  });
  proposalStatus.zip_sha256 = proposalZipSha;

  const lockedStatus = packStatusFromValidation({
    present: Boolean(lockedParsed.zipBytes),
    zipBytes: lockedParsed.zipBytes,
    pack: lockedParsed.pack,
    parseErrors: lockedParsed.errors,
  });
  lockedStatus.zip_sha256 = lockedZipSha;

  if (!baseParsed.ok) svErrors.push("Base Spec Pack missing or unreadable.");
  if (!proposalParsed.ok) svWarnings.push("Proposal Spec Pack missing or unreadable.");

  const schemaValidation: SchemaValidationReportV1 = {
    schema: "kindred.schema_validation_report.v1",
    generated_at_utc: utcNow(),
    app_version: APP_VERSION,
    validator_version: VALIDATOR_VERSION,
    project_id: pid,
    packs: {
      base: baseStatus,
      proposal: proposalStatus,
      locked: lockedStatus.present ? lockedStatus : undefined,
    },
    checks: {
      ok: svErrors.length === 0,
      warnings: svWarnings,
      errors: svErrors,
    },
  };

  // Determinism report (base + proposal + governance lineage)
  let determinism: DeterminismReportV1;
  try {
    determinism = await buildDeterminismReport({
      projectId: pid,
      base: { zipBytes: baseParsed.zipBytes, pack: baseParsed.pack },
      proposal: { zipBytes: proposalParsed.zipBytes, pack: proposalParsed.pack },
      patch: null,
    });
  } catch {
    determinism = {
      schema: "kindred.determinism_report.v1",
      generated_at_utc: utcNow(),
      app_version: APP_VERSION,
      validator_version: VALIDATOR_VERSION,
      spec_pack_version: "unknown",
      project_id: pid,
      packs: {},
      checks: { ok: false, warnings: ["Failed to build determinism report."] },
    };
  }

  // Evidence and failure records
  let evidence: EvidenceLedgerV1 | null = null;
  try {
    evidence = loadEvidenceLedger(pid);
  } catch {
    evidence = null;
  }

  let failures: FailureRecordV1[] = [];
  try {
    failures = await listFailureRecordsV1(pid, 200);
  } catch {
    failures = [];
  }

  // Repo Pack (locked)
  let lockedRepoBytes: Uint8Array | null = null;
  try {
    lockedRepoBytes = await getLockedRepoPackBytes(pid);
  } catch {
    lockedRepoBytes = null;
  }
  const lockedRepoZipSha = await maybeSha(lockedRepoBytes);

  // Optional: blueprint pack
  let blueprintMeta: BlueprintPackStoreMetaV1 | null = null;
  let blueprintJson: string | null = null;
  try {
    blueprintMeta = getBlueprintPackMeta(pid);
  } catch {
    blueprintMeta = null;
  }
  try {
    blueprintJson = await getLatestBlueprintPackJson(pid);
  } catch {
    blueprintJson = null;
  }

  // Optional: verify report
  let verify: VerifyReport | null = null;
  try {
    verify = getLatestVerifyReport(pid);
  } catch {
    verify = null;
  }

  // Optional: dogfood report
  let dogfood: DogfoodReportV1 | null = null;
  try {
    dogfood = getDogfoodReport(pid);
  } catch {
    dogfood = null;
  }

  // Optional: backup history
  let backups: BackupHistoryV1 | null = null;
  try {
    backups = getBackupHistory(pid);
  } catch {
    backups = null;
  }

  // Release readiness checks
  const checks: ReleaseChecklistReportV1["checks"] = [];

  const specLocked = isPackLocked(pid);
  checks.push({
    id: "spec_locked",
    title: "Spec Pack is locked",
    status: specLocked ? "pass" : "fail",
    notes: specLocked ? undefined : ["Lock Spec Pack in /director/ship."]
  });

  const repoLocked = isRepoPackLocked(pid);
  checks.push({
    id: "repo_locked",
    title: "Repo Pack is locked",
    status: repoLocked ? "pass" : "warn",
    notes: repoLocked ? undefined : ["Lock Repo Pack in /director/ship (if using repo workflow)."]
  });

  checks.push({
    id: "spec_base_present",
    title: "Base Spec Pack exists",
    status: baseParsed.ok ? "pass" : "fail",
    notes: baseParsed.ok ? undefined : baseParsed.errors
  });

  checks.push({
    id: "schema_validation",
    title: "Schema validation report generated",
    status: schemaValidation.checks.ok ? "pass" : "fail",
    notes: schemaValidation.checks.ok ? undefined : schemaValidation.checks.errors
  });

  checks.push({
    id: "determinism_report",
    title: "Determinism report generated",
    status: determinism.checks.ok ? "pass" : "warn",
    notes: determinism.checks.warnings.length ? determinism.checks.warnings : undefined
  });

  const verifyStatus: ReleaseTri = verify ? (verify.overall === "fail" ? "fail" : verify.overall === "warn" ? "warn" : "pass") : "warn";
  checks.push({
    id: "verify_report",
    title: "Latest Verify report present",
    status: verifyStatus,
    notes: verify ? undefined : ["Run a Verify plan locally and upload the report in /verify."]
  });

  const evidenceOk = evidence && Array.isArray((evidence as any).cards);
  checks.push({
    id: "evidence_ledger",
    title: "Evidence ledger present",
    status: evidenceOk ? "pass" : "warn",
    notes: evidenceOk ? undefined : ["Add evidence cards in /director/ship (Evidence panel)."],
  });

  const failureOk = Array.isArray(failures) && failures.length > 0;
  checks.push({
    id: "failure_records",
    title: "Failure records captured",
    status: failureOk ? "pass" : "warn",
    notes: failureOk ? undefined : ["Optional: capture failures via the Failure Capture panel."],
  });

  const backupOk = backups && Array.isArray((backups as any).entries) && (backups as any).entries.length > 0;
  checks.push({
    id: "backups",
    title: "Backup history present",
    status: backupOk ? "pass" : "warn",
    notes: backupOk ? undefined : ["Optional: create a project backup in /backup."],
  });

  const REQUIRED_CHECK_IDS = new Set<string>([
    "spec_locked",
    "spec_base_present",
    "schema_validation",
    "determinism_report",
    "verify_report",
  ]);

  const overall = computeOverall(checks.map((c) => ({ required: REQUIRED_CHECK_IDS.has(c.id), status: c.status })));

  const releaseChecklist: ReleaseChecklistReportV1 = {
    schema: "kindred.release_checklist_report.v1",
    captured_at_utc: utcNow(),
    project_id: pid,
    overall,
    checks,
  };

  // Golden path report (minimal)
  const gpSteps: GoldenPathStepV1[] = [];
  gpSteps.push({
    id: "director_flow",
    title: "Director flow completed (brief → proposals → ship)",
    required: true,
    status: specLocked ? "pass" : "warn",
    notes: specLocked ? undefined : ["Complete Director flow and lock Spec Pack."],
  });
  gpSteps.push({
    id: "verify",
    title: "Local verification captured",
    required: true,
    status: verifyStatus,
    notes: verify ? undefined : ["Run and upload Verify report."],
  });
  gpSteps.push({
    id: "dogfood",
    title: "Dogfood proof (optional)",
    required: false,
    status: dogfood ? "pass" : "warn",
    notes: dogfood ? undefined : ["Optional: run Dogfood mode to generate a self-evolution proof."],
  });
  gpSteps.push({
    id: "backup",
    title: "Project backup captured (optional)",
    required: false,
    status: backupOk ? "pass" : "warn",
    notes: backupOk ? undefined : ["Optional: create and export a project backup."],
  });

  const goldenPath: GoldenPathReportV1 = {
    schema: "kindred.golden_path_report.v1",
    captured_at_utc: utcNow(),
    project_id: pid,
    overall: computeOverall(gpSteps.map((s) => ({ required: s.required, status: s.status }))),
    steps: gpSteps,
    notes: [],
  };

  const publishReadyMd = buildPublishReadyReportMd({
    projectId: pid,
    overall,
    checks,
    determinism,
    schemaValidation,
    goldenPath,
    verifyReport: verify,
  });

  // Build the zip contents.
  const files: Record<string, Uint8Array> = {};

  // Required dist reports
  files["dist/publish_ready_report.md"] = new TextEncoder().encode(publishReadyMd);
  files["dist/schema_validation_report.json"] = new TextEncoder().encode(stableJsonText(schemaValidation, 2));
  files["dist/determinism_report.json"] = new TextEncoder().encode(stableJsonText(determinism, 2));
  files["dist/golden_path_report.json"] = new TextEncoder().encode(stableJsonText(goldenPath, 2));
  files["dist/sdde_verify_report.json"] = new TextEncoder().encode(stableJsonText(verify || { schema: "kindred.verify_report.v1", captured_at_utc: utcNow(), plan_id: "missing", plan_version: "missing", overall: "warn", steps: [], notes: ["Missing verify report."], provenance: { app_version: APP_VERSION } }, 2));

  files["dist/release_checklist_report.json"] = new TextEncoder().encode(stableJsonText(releaseChecklist, 2));
  files["dist/release_notes.md"] = new TextEncoder().encode(mdTemplateReleaseNotes());
  files["dist/security_report.md"] = new TextEncoder().encode(mdTemplateSecurity());
  files["dist/accessibility_report.md"] = new TextEncoder().encode(mdTemplateAccessibility());
  files["dist/performance_report.md"] = new TextEncoder().encode(mdTemplatePerformance());

  // Packs + governance
  const packGov = safeJsonParse<any>(safeLsGet("kindred_pack_governance:" + pid)) || getPackGovernance(pid);
  if (packGov) files["governance/spec/pack_governance.json"] = new TextEncoder().encode(stableJsonText(packGov, 2));
  const repoGov = getRepoPackGovernance(pid);
  if (repoGov) files["governance/repo/repo_pack_governance.json"] = new TextEncoder().encode(stableJsonText(repoGov, 2));

  if (baseParsed.zipBytes) files["packs/spec/base.zip"] = baseParsed.zipBytes;
  if (proposalParsed.zipBytes) files["packs/spec/proposal.zip"] = proposalParsed.zipBytes;
  if (lockedParsed.zipBytes) {
    files["packs/spec/locked.zip"] = lockedParsed.zipBytes;
    // Friendly alias matching governance docs.
    files["spec_pack.zip"] = lockedParsed.zipBytes;
  }

  if (lockedRepoBytes) {
    files["packs/repo/locked_repo_pack.zip"] = lockedRepoBytes;
    // Friendly alias matching governance docs.
    files["repo_pack.zip"] = lockedRepoBytes;
  }

  // Evidence
  if (evidence) {
    const evBytes = new TextEncoder().encode(stableJsonText(evidence, 2));
    files["evidence/evidence_ledger.json"] = evBytes;
    // Friendly alias matching governance docs.
    files["evidence/ledger.json"] = evBytes;
  }
  if (failures && failures.length) files["evidence/failure_records.json"] = new TextEncoder().encode(stableJsonText({ schema: "kindred.failure_records_export.v1", project_id: pid, exported_at_utc: utcNow(), records: failures }, 2));

  // Optional packs
  if (blueprintJson) files["packs/blueprint/blueprint_pack.json"] = new TextEncoder().encode(blueprintJson);
  if (blueprintMeta) files["packs/blueprint/blueprint_pack_meta.json"] = new TextEncoder().encode(stableJsonText(blueprintMeta, 2));

  if (dogfood) files["proofs/dogfood_report.json"] = new TextEncoder().encode(stableJsonText(dogfood, 2));
  if (backups) files["proofs/backup_history.json"] = new TextEncoder().encode(stableJsonText(backups, 2));

  // Include governance docs for standalone review.
  // These are served from /public/governance/* so the client can fetch them offline.
  const thresholdMd = await fetchText("/governance/PUBLISH_READY_THRESHOLD_V1.md");
  if (thresholdMd) {
    files["governance/docs/PUBLISH_READY_THRESHOLD_V1.md"] = new TextEncoder().encode(thresholdMd);
  } else {
    notes.push("WARN: Could not fetch /governance/PUBLISH_READY_THRESHOLD_V1.md; included placeholder pointer instead.");
    files["governance/docs/PUBLISH_READY_THRESHOLD_V1.md"] = new TextEncoder().encode(
      "See repo: contracts/governance/PUBLISH_READY_THRESHOLD_V1.md\n",
    );
  }

  const contractMd = await fetchText("/governance/ENGINEERING_SPEC_AND_CONTRIBUTOR_CONTRACT.md");
  if (contractMd) {
    files["governance/docs/ENGINEERING_SPEC_AND_CONTRIBUTOR_CONTRACT.md"] = new TextEncoder().encode(contractMd);
  } else {
    notes.push(
      "WARN: Could not fetch /governance/ENGINEERING_SPEC_AND_CONTRIBUTOR_CONTRACT.md; included placeholder pointer instead.",
    );
    files["governance/docs/ENGINEERING_SPEC_AND_CONTRIBUTOR_CONTRACT.md"] = new TextEncoder().encode(
      "See repo: contracts/governance/ENGINEERING_SPEC_AND_CONTRIBUTOR_CONTRACT.md\n",
    );
  }

  // Proof bundle manifest: sha256 per path.
  const manifestEntries: Array<{ path: string; sha256: string; bytes: number }> = [];
  for (const p of Object.keys(files).sort()) {
    const b = files[p];
    const h = await sha256Hex(b);
    manifestEntries.push({ path: p, sha256: h, bytes: b.length });
  }

  const proofManifest = {
    schema: "kindred.proof_bundle_manifest.v1",
    generated_at_utc: utcNow(),
    project_id: pid,
    entries: manifestEntries,
  };
  files["meta/proof_bundle_manifest.json"] = new TextEncoder().encode(stableJsonText(proofManifest, 2));

  // Bundle meta (paths exclude the meta file itself to avoid recursion).
  const included_paths = Object.keys(files).sort();

  const meta: PublishReadyBundleMetaV1 = {
    schema: "kindred.publish_ready_bundle_meta.v1",
    created_at_utc: utcNow(),
    app_version: APP_VERSION,
    validator_version: VALIDATOR_VERSION,
    project_id: pid,
    overall,
    notes: notes.length ? notes : undefined,
    included_paths,
    inputs: {
      spec_base_zip_sha256: baseZipSha,
      spec_proposal_zip_sha256: proposalZipSha,
      spec_locked_zip_sha256: lockedZipSha,
      repo_locked_zip_sha256: lockedRepoZipSha,
    },
  };

  files["meta/bundle_meta.json"] = new TextEncoder().encode(stableJsonText(meta, 2));

  // Deterministic zip.
  const zipBytes = zipDeterministic(files);
  return { ok: true, zipBytes, meta };
}
