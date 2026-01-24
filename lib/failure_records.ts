"use client";

import { idbGet, idbSet } from "./idb_kv";
import { sha256Hex } from "./hash";
import { stableJsonText } from "./stable_json";
import { diagnoseFailureV1, type FailureDiagnosisV1 } from "./failure_rules";
import { getPackGovernance } from "./pack_governance";
import { getRepoPackGovernance } from "./repo_pack_governance";
import { getBlueprintPackMeta } from "./blueprint_pack_store";
import { appendEvidenceCard } from "./evidence_ledger";

export type FailureStageV1 = "build" | "deploy" | "runtime" | "other";
export type FailureEnvironmentV1 = "vercel" | "codespaces" | "local" | "other";

export type FailureRecordV1 = {
  schema: "kindred.failure_record.v1";
  id: string;
  project_id: string;
  created_at_utc: string;
  stage: FailureStageV1;
  environment: FailureEnvironmentV1;

  summary: string;
  logs_sha256: string;
  logs_text: string;

  diagnosis_offline: FailureDiagnosisV1;

  // Context fingerprints (best-effort; used for provenance and reproducibility).
  spec_locked_zip_sha256?: string;
  repo_locked_zip_sha256?: string;
  blueprint_pack_sha256?: string;

  // Optional AI diagnosis (proposal-only, never auto-applied).
  diagnosis_ai_text?: string;
  diagnosis_ai_generated_at_utc?: string;

  status: "open" | "resolved";
  resolved_at_utc?: string;
};

const IDB_PREFIX = "kindred_failure_record_v1:";
const INDEX_KEY_PREFIX = "kindred_failure_index_v1:";

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

function indexKeyForProject(projectId: string): string {
  return `${INDEX_KEY_PREFIX}${String(projectId || "").trim()}`;
}

function recordKey(projectId: string, failureId: string): string {
  return `${IDB_PREFIX}${String(projectId || "").trim()}:${String(failureId || "").trim()}`;
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function readIndex(projectId: string): string[] {
  const pid = String(projectId || "").trim();
  if (!pid) return [];
  try {
    const raw = localStorage.getItem(indexKeyForProject(pid));
    if (!raw) return [];
    const parsed = safeJsonParse<any>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === "string") as string[];
  } catch {
    return [];
  }
}

function writeIndex(projectId: string, ids: string[]): void {
  const pid = String(projectId || "").trim();
  if (!pid) return;
  try {
    localStorage.setItem(indexKeyForProject(pid), stableJsonText(ids));
  } catch {
    // ignore
  }
}

function newId(): string {
  // Deterministic enough for UX; not used for security.
  // Use a timestamp prefix to keep lexicographic order.
  const t = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const rand = Math.random().toString(16).slice(2, 10);
  return `f_${t}_${rand}`;
}

function summarizeLogs(logsText: string): string {
  const lines = String(logsText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const head = lines.slice(0, 8).join(" | ");
  if (!head) return "Failure record";
  return head.length > 120 ? `${head.slice(0, 117)}…` : head;
}

export async function createFailureRecordV1(args: {
  project_id: string;
  stage: FailureStageV1;
  environment: FailureEnvironmentV1;
  logs_text: string;
}): Promise<FailureRecordV1> {
  const pid = String(args.project_id || "").trim() || "default";
  const logsText = String(args.logs_text || "");
  const logsSha = await sha256Hex(logsText);

  const specGov = getPackGovernance(pid);
  const repoGov = getRepoPackGovernance(pid);
  const bpMeta = getBlueprintPackMeta(pid);

  const rec: FailureRecordV1 = {
    schema: "kindred.failure_record.v1",
    id: newId(),
    project_id: pid,
    created_at_utc: new Date().toISOString(),
    stage: args.stage,
    environment: args.environment,
    summary: summarizeLogs(logsText),
    logs_sha256: logsSha,
    logs_text: logsText,
    diagnosis_offline: diagnoseFailureV1(logsText),
    spec_locked_zip_sha256: String(specGov?.last_locked?.provenance?.locked_zip_sha256 || "").trim() || undefined,
    repo_locked_zip_sha256: String(repoGov?.last_locked?.provenance?.locked_zip_sha256 || "").trim() || undefined,
    blueprint_pack_sha256: String(bpMeta?.blueprint_pack_sha256 || "").trim() || undefined,
    status: "open",
  };

  await idbSet(recordKey(pid, rec.id), rec);

  const ids = readIndex(pid);
  const next = [rec.id, ...ids.filter((x) => x !== rec.id)].slice(0, 50);
  writeIndex(pid, next);

  dispatch("kindred_failure_records_changed");
  try {
    appendEvidenceCard({
      project_id: pid,
      kind: "failure_saved",
      title: "Failure Record saved",
      summary: `${rec.stage}/${rec.environment}: ${rec.summary}`,
      data: {
        failure_id: rec.id,
        logs_sha256: rec.logs_sha256,
        spec_locked_zip_sha256: rec.spec_locked_zip_sha256 || "",
        repo_locked_zip_sha256: rec.repo_locked_zip_sha256 || "",
        blueprint_pack_sha256: rec.blueprint_pack_sha256 || "",
      },
    });
  } catch {
    // ignore
  }
  return rec;
}

export async function updateFailureRecordV1(projectId: string, rec: FailureRecordV1): Promise<void> {
  const pid = String(projectId || "").trim() || "default";
  if (!rec || rec.schema !== "kindred.failure_record.v1") return;
  await idbSet(recordKey(pid, rec.id), rec);
  dispatch("kindred_failure_records_changed");
}

export async function listFailureRecordsV1(projectId: string, limit: number = 20): Promise<FailureRecordV1[]> {
  const pid = String(projectId || "").trim() || "default";
  const ids = readIndex(pid).slice(0, Math.max(1, Math.min(50, limit)));
  const out: FailureRecordV1[] = [];
  for (const id of ids) {
    const rec = await idbGet<FailureRecordV1>(recordKey(pid, id));
    if (rec && rec.schema === "kindred.failure_record.v1") out.push(rec);
  }
  return out;
}

export async function getFailureRecordV1(projectId: string, failureId: string): Promise<FailureRecordV1 | null> {
  const pid = String(projectId || "").trim() || "default";
  const id = String(failureId || "").trim();
  if (!id) return null;
  const rec = await idbGet<FailureRecordV1>(recordKey(pid, id));
  if (!rec || rec.schema !== "kindred.failure_record.v1") return null;
  return rec;
}

export async function markFailureResolvedV1(projectId: string, failureId: string): Promise<void> {
  const pid = String(projectId || "").trim() || "default";
  const rec = await getFailureRecordV1(pid, failureId);
  if (!rec) return;
  rec.status = "resolved";
  rec.resolved_at_utc = new Date().toISOString();
  await updateFailureRecordV1(pid, rec);
  try {
    appendEvidenceCard({
      project_id: pid,
      kind: "failure_resolved",
      title: "Failure Record resolved",
      summary: `Resolved ${rec.id}`,
      data: { failure_id: rec.id, logs_sha256: rec.logs_sha256 },
    });
  } catch {
    // ignore
  }
}

export async function setFailureAiDiagnosisV1(projectId: string, failureId: string, text: string): Promise<void> {
  const pid = String(projectId || "").trim() || "default";
  const rec = await getFailureRecordV1(pid, failureId);
  if (!rec) return;
  rec.diagnosis_ai_text = String(text || "");
  rec.diagnosis_ai_generated_at_utc = new Date().toISOString();
  await updateFailureRecordV1(pid, rec);
}
