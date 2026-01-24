"use client";

import { stableJsonText } from "./stable_json";

// ---------------------------------------------------------------------------
// Evidence ledger v1 (local-first)
//
// Why:
// - Make "proof" first-class: locks, verify reports, backups, failures.
// - Keep it offline-safe: stored locally (localStorage + tiny index).
// - Never mutates artefacts automatically; just records what happened.
// ---------------------------------------------------------------------------

export type EvidenceKindV1 =
  | "spec_lock"
  | "spec_unlock"
  | "repo_lock"
  | "repo_unlock"
  | "verify_report_added"
  | "verify_report_removed"
  | "backup_exported"
  | "failure_saved"
  | "failure_record"
  | "golden_path_export"
  | "ux_walkthrough_notes"
  | "telemetry_assertion"
  | "policy_reality_assertion"
  | "vercel_deploy_checklist"
  | "ai_posture_assertion"
  | "pack_determinism_assertion"
  | "validator_smoke_assertion"
  | "backup_restore_assertion"
  | "publish_ready_signoff"
  | "failure_resolved";

export type EvidenceCardV1 = {
  schema: "kindred.evidence_card.v1";
  id: string;
  project_id: string;
  created_at_utc: string;
  kind: EvidenceKindV1;
  title: string;
  summary: string;
  // A small payload for provenance (hashes, ids, etc). Keep it JSON-serializable.
  data?: Record<string, any>;
};

export type EvidenceLedgerV1 = {
  schema: "kindred.evidence_ledger.v1";
  project_id: string;
  cards: EvidenceCardV1[];
};

const KEY_PREFIX = "kindred_evidence_ledger_v1:";

function keyForProject(projectId: string): string {
  return `${KEY_PREFIX}${String(projectId || "").trim() || "default"}`;
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

function newId(prefix: string): string {
  const t = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const rand = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${t}_${rand}`;
}

export function loadEvidenceLedger(projectId: string): EvidenceLedgerV1 {
  const pid = String(projectId || "").trim() || "default";
  try {
    const raw = localStorage.getItem(keyForProject(pid));
    if (!raw) return { schema: "kindred.evidence_ledger.v1", project_id: pid, cards: [] };
    const parsed = safeJsonParse<any>(raw);
    if (!parsed || parsed.schema !== "kindred.evidence_ledger.v1") {
      return { schema: "kindred.evidence_ledger.v1", project_id: pid, cards: [] };
    }
    const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
    const cleaned: EvidenceCardV1[] = cards
      .filter((c: any) => c && c.schema === "kindred.evidence_card.v1")
      .map((c: any) => ({
        schema: "kindred.evidence_card.v1",
        id: String(c.id || ""),
        project_id: pid,
        created_at_utc: typeof c.created_at_utc === "string" ? c.created_at_utc : new Date().toISOString(),
        kind: String(c.kind || "") as EvidenceKindV1,
        title: String(c.title || ""),
        summary: String(c.summary || ""),
        data: c.data && typeof c.data === "object" ? (c.data as any) : undefined,
      }));
    return { schema: "kindred.evidence_ledger.v1", project_id: pid, cards: cleaned.slice(0, 250) };
  } catch {
    return { schema: "kindred.evidence_ledger.v1", project_id: pid, cards: [] };
  }
}

export function saveEvidenceLedger(ledger: EvidenceLedgerV1): void {
  const pid = String(ledger?.project_id || "").trim() || "default";
  try {
    localStorage.setItem(keyForProject(pid), stableJsonText(ledger));
  } catch {
    // ignore
  }
}

export function appendEvidenceCard(args: {
  project_id: string;
  kind: EvidenceKindV1;
  title: string;
  summary: string;
  data?: Record<string, any>;
  max_cards?: number;
}): EvidenceCardV1 {
  const pid = String(args.project_id || "").trim() || "default";
  const ledger = loadEvidenceLedger(pid);
  const card: EvidenceCardV1 = {
    schema: "kindred.evidence_card.v1",
    id: newId("ev"),
    project_id: pid,
    created_at_utc: new Date().toISOString(),
    kind: args.kind,
    title: String(args.title || "Evidence"),
    summary: String(args.summary || ""),
    data: args.data && typeof args.data === "object" ? args.data : undefined,
  };
  const max = Math.max(20, Math.min(500, Number(args.max_cards || 250)));
  const next: EvidenceLedgerV1 = {
    schema: "kindred.evidence_ledger.v1",
    project_id: pid,
    cards: [card, ...ledger.cards].slice(0, max),
  };
  saveEvidenceLedger(next);
  dispatch("kindred_evidence_changed");
  return card;
}

export function clearEvidenceLedger(projectId: string): void {
  const pid = String(projectId || "").trim() || "default";
  try {
    localStorage.removeItem(keyForProject(pid));
  } catch {
    // ignore
  }
  dispatch("kindred_evidence_changed");
}
