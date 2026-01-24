"use client";

import { stableJsonText } from "./stable_json";
import { sha256Hex } from "./hash";
import type { ProjectBackupMetaV2 } from "./project_backup";

export type BackupHistoryV1 = {
  schema: "kindred.backup_history.v1";
  project_id: string;
  last_backup_at_utc: string;
  backup_zip_sha256: string;
  meta?: ProjectBackupMetaV2;
};

const KEY_PREFIX = "kindred_backup_history_v1:";

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function backupHistoryKeyForProject(projectId: string): string {
  return `${KEY_PREFIX}${projectId}`;
}

export function getBackupHistory(projectId: string): BackupHistoryV1 | null {
  const pid = String(projectId || "").trim();
  if (!pid) return null;
  try {
    const raw = localStorage.getItem(backupHistoryKeyForProject(pid)) || "";
    if (!raw) return null;
    const parsed = safeJsonParse<any>(raw);
    if (!parsed || parsed.schema !== "kindred.backup_history.v1") return null;
    if (typeof parsed.project_id !== "string" || parsed.project_id !== pid) return null;
    if (typeof parsed.last_backup_at_utc !== "string") return null;
    if (typeof parsed.backup_zip_sha256 !== "string") return null;
    return parsed as BackupHistoryV1;
  } catch {
    return null;
  }
}

export function setBackupHistory(projectId: string, history: BackupHistoryV1): void {
  const pid = String(projectId || "").trim();
  if (!pid) return;
  try {
    localStorage.setItem(backupHistoryKeyForProject(pid), stableJsonText(history, 2));
  } catch {
    // ignore
  }
  dispatch("kindred_backup_history_changed");
}

export async function recordBackupExport(opts: {
  projectId: string;
  zipBytes: Uint8Array;
  meta: ProjectBackupMetaV2;
}): Promise<BackupHistoryV1 | null> {
  const pid = String(opts.projectId || "").trim();
  if (!pid) return null;

  try {
    const sha = await sha256Hex(opts.zipBytes);
    const now = new Date().toISOString();

    const history: BackupHistoryV1 = {
      schema: "kindred.backup_history.v1",
      project_id: pid,
      last_backup_at_utc: now,
      backup_zip_sha256: sha,
      meta: opts.meta,
    };

    setBackupHistory(pid, history);
    return history;
  } catch {
    return null;
  }
}
