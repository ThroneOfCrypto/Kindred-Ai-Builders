"use client";

import {
  getCurrentProjectId,
  LEGACY_LAST_BASE_PACK_KEY,
  LEGACY_LAST_PROPOSAL_PACK_KEY,
  lastBasePackKeyForProject,
  lastProposalPackKeyForProject,
  loadProjectStateById,
  saveProjectStateById,
} from "./state";
import {
  deletePackGovernance,
  getLockedPackB64,
  getPackGovernance,
  setLockedPackB64,
  setPackGovernance,
  type PackGovernanceV1,
} from "./pack_governance";

// ---------------------------------------------------------------------------
// Snapshots v1 (local-only): operator safety for destructive actions.
// A snapshot captures enough local state to restore after mistakes:
// - project builder state
// - cached Base/Proposal pack ZIPs (b64)
// - governance + locked bytes (if any)
// ---------------------------------------------------------------------------

const SNAPSHOT_KEY_PREFIX = "kindred_snapshots_v1:";
const MAX_DEFAULT = 12;

export type SnapshotV1 = {
  schema: "kindred.snapshot.v1";
  id: string;
  project_id: string;
  created_at_utc: string;
  label: string;
  reason: string;
  project_state_json?: string;
  base_pack_b64?: string;
  proposal_pack_b64?: string;
  pack_governance_json?: string;
  locked_pack_b64?: string;
};

function utcNow(): string {
  return new Date().toISOString();
}

function snapshotsKeyForProject(projectId: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${projectId}`;
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

function newId(): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return `s_${Date.now().toString(36)}_${rand}`;
}

function normalizeSnapshot(raw: any): SnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.schema !== "kindred.snapshot.v1") return null;
  const id = typeof raw.id === "string" ? raw.id : "";
  const project_id = typeof raw.project_id === "string" ? raw.project_id : "";
  const created_at_utc = typeof raw.created_at_utc === "string" ? raw.created_at_utc : "";
  const label = typeof raw.label === "string" ? raw.label : "";
  const reason = typeof raw.reason === "string" ? raw.reason : "";
  if (!id || !project_id || !created_at_utc || !label || !reason) return null;

  const project_state_json = typeof raw.project_state_json === "string" ? raw.project_state_json : undefined;
  const base_pack_b64 = typeof raw.base_pack_b64 === "string" ? raw.base_pack_b64 : undefined;
  const proposal_pack_b64 = typeof raw.proposal_pack_b64 === "string" ? raw.proposal_pack_b64 : undefined;
  const pack_governance_json = typeof raw.pack_governance_json === "string" ? raw.pack_governance_json : undefined;
  const locked_pack_b64 = typeof raw.locked_pack_b64 === "string" ? raw.locked_pack_b64 : undefined;

  return {
    schema: "kindred.snapshot.v1",
    id,
    project_id,
    created_at_utc,
    label,
    reason,
    project_state_json,
    base_pack_b64,
    proposal_pack_b64,
    pack_governance_json,
    locked_pack_b64,
  };
}

export function listSnapshots(projectId: string): SnapshotV1[] {
  try {
    const raw = localStorage.getItem(snapshotsKeyForProject(projectId));
    if (!raw) return [];
    const parsed = safeJsonParse<any>(raw);
    if (!Array.isArray(parsed)) return [];
    const snaps = parsed.map(normalizeSnapshot).filter((x): x is SnapshotV1 => Boolean(x));
    snaps.sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc));
    return snaps;
  } catch {
    return [];
  }
}

export function addSnapshot(projectId: string, snap: Omit<SnapshotV1, "schema" | "id" | "project_id" | "created_at_utc">, opts?: { max?: number }): SnapshotV1 {
  const max = typeof opts?.max === "number" && opts.max > 0 ? Math.floor(opts.max) : MAX_DEFAULT;

  const full: SnapshotV1 = {
    schema: "kindred.snapshot.v1",
    id: newId(),
    project_id: projectId,
    created_at_utc: utcNow(),
    label: snap.label,
    reason: snap.reason,
    project_state_json: snap.project_state_json,
    base_pack_b64: snap.base_pack_b64,
    proposal_pack_b64: snap.proposal_pack_b64,
    pack_governance_json: snap.pack_governance_json,
    locked_pack_b64: snap.locked_pack_b64,
  };

  const prev = listSnapshots(projectId);
  const next = [full, ...prev].slice(0, max);

  try {
    localStorage.setItem(snapshotsKeyForProject(projectId), JSON.stringify(next));
  } catch {
    // ignore
  }
  dispatch("kindred_snapshots_changed");

  return full;
}

export function deleteSnapshot(projectId: string, snapshotId: string): SnapshotV1[] {
  const prev = listSnapshots(projectId);
  const next = prev.filter((s) => s.id !== snapshotId);
  try {
    localStorage.setItem(snapshotsKeyForProject(projectId), JSON.stringify(next));
  } catch {
    // ignore
  }
  dispatch("kindred_snapshots_changed");
  return next;
}

export function getSnapshot(projectId: string, snapshotId: string): SnapshotV1 | null {
  const prev = listSnapshots(projectId);
  return prev.find((s) => s.id === snapshotId) || null;
}

export function clearSnapshots(projectId: string) {
  try {
    localStorage.removeItem(snapshotsKeyForProject(projectId));
  } catch {
    // ignore
  }
  dispatch("kindred_snapshots_changed");
}

/**
 * Replace all snapshots for a project.
 * Used by project backup restore.
 */
export function replaceSnapshots(projectId: string, snapshots: SnapshotV1[]): SnapshotV1[] {
  const normalized = Array.isArray(snapshots) ? snapshots.map(normalizeSnapshot).filter((x): x is SnapshotV1 => Boolean(x)) : [];
  normalized.sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc));
  try {
    localStorage.setItem(snapshotsKeyForProject(projectId), JSON.stringify(normalized));
  } catch {
    // ignore
  }
  dispatch("kindred_snapshots_changed");
  return normalized;
}

export function captureSnapshotForCurrentProject(args: {
  label: string;
  reason: string;
  base_pack_b64?: string;
  proposal_pack_b64?: string;
  pack_governance_json?: string;
  locked_pack_b64?: string;
  include_project_state?: boolean;
}): { ok: true; snapshot: SnapshotV1 } | { ok: false; error: string } {
  let projectId = "";
  try {
    projectId = getCurrentProjectId();
  } catch {
    projectId = "";
  }
  if (!projectId) return { ok: false, error: "No current project." };

  let project_state_json: string | undefined = undefined;
  if (args.include_project_state !== false) {
    try {
      const st = loadProjectStateById(projectId);
      project_state_json = JSON.stringify(st);
    } catch {
      project_state_json = undefined;
    }
  }

  // If not provided, capture current local caches (scoped key first, then legacy fallback).
  const base_pack_b64 = args.base_pack_b64 ?? readPackCache(projectId, "base");
  const proposal_pack_b64 = args.proposal_pack_b64 ?? readPackCache(projectId, "proposal");

  let pack_governance_json = args.pack_governance_json;
  if (pack_governance_json === undefined) {
    try {
      const g = getPackGovernance(projectId);
      pack_governance_json = g ? JSON.stringify(g) : "";
    } catch {
      pack_governance_json = "";
    }
  }

  let locked_pack_b64 = args.locked_pack_b64;
  if (locked_pack_b64 === undefined) {
    try {
      locked_pack_b64 = getLockedPackB64(projectId) || "";
    } catch {
      locked_pack_b64 = "";
    }
  }

  const snapshot = addSnapshot(projectId, {
    label: args.label,
    reason: args.reason,
    project_state_json,
    base_pack_b64: base_pack_b64 || undefined,
    proposal_pack_b64: proposal_pack_b64 || undefined,
    pack_governance_json: pack_governance_json || undefined,
    locked_pack_b64: locked_pack_b64 || undefined,
  });

  return { ok: true, snapshot };
}

function safeGetItem(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function readPackCache(projectId: string, kind: "base" | "proposal"): string {
  const scoped = kind === "base" ? lastBasePackKeyForProject(projectId) : lastProposalPackKeyForProject(projectId);
  const legacy = kind === "base" ? LEGACY_LAST_BASE_PACK_KEY : LEGACY_LAST_PROPOSAL_PACK_KEY;
  const s = safeGetItem(scoped);
  if (s) return s;
  return safeGetItem(legacy);
}

function safeSetItem(key: string, value: string) {
  try {
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function restoreSnapshotToProject(projectId: string, snapshotId: string): { ok: true } | { ok: false; error: string } {
  const snap = getSnapshot(projectId, snapshotId);
  if (!snap) return { ok: false, error: "Snapshot not found." };

  // Restore builder state.
  if (snap.project_state_json) {
    const parsed = safeJsonParse<any>(snap.project_state_json);
    if (parsed) {
      try {
        saveProjectStateById(projectId, parsed);
      } catch {
        // ignore
      }
    }
  }

  // Restore pack caches.
  if (snap.base_pack_b64 !== undefined) {
    safeSetItem(lastBasePackKeyForProject(projectId), snap.base_pack_b64);
    safeSetItem(LEGACY_LAST_BASE_PACK_KEY, snap.base_pack_b64);
  }
  if (snap.proposal_pack_b64 !== undefined) {
    safeSetItem(lastProposalPackKeyForProject(projectId), snap.proposal_pack_b64);
    safeSetItem(LEGACY_LAST_PROPOSAL_PACK_KEY, snap.proposal_pack_b64);
  }

  // Restore governance.
  if (snap.pack_governance_json) {
    const parsedGov = safeJsonParse<PackGovernanceV1>(snap.pack_governance_json);
    if (parsedGov) {
      try {
        setPackGovernance(projectId, parsedGov);
      } catch {
        // ignore
      }
    } else {
      deletePackGovernance(projectId);
    }
  } else {
    deletePackGovernance(projectId);
  }

  if (snap.locked_pack_b64 !== undefined) {
    try {
      setLockedPackB64(projectId, snap.locked_pack_b64 || "");
    } catch {
      // ignore
    }
  }

  dispatch("kindred_project_changed");
  dispatch("kindred_state_changed");
  dispatch("kindred_governance_changed");

  return { ok: true };
}
