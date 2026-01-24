"use client";

import { decodeBase64 } from "./spec_pack";
import { idbDel, idbGetBytes, idbSetBytes } from "./idb_kv";
import {
  repoWorkbenchBaseB64KeyForProject,
  repoWorkbenchBaseNameKeyForProject,
  repoWorkbenchProposalB64KeyForProject,
  repoWorkbenchProposalNameKeyForProject,
} from "./repo_workbench_state";
import { lockedRepoPackB64KeyForProject } from "./repo_pack_governance";

// ---------------------------------------------------------------------------
// Repo Pack byte storage (IndexedDB) + small metadata (localStorage).
//
// Why:
// - Repo Pack ZIP bytes are often far larger than localStorage quotas.
// - We keep only small UX metadata in localStorage for fast rendering.
//
// Back-compat:
// - v1.0.7 stored base/proposal Repo Pack ZIP bytes in localStorage as base64.
// - v1.0.7 stored locked Repo Pack ZIP bytes in localStorage as base64.
// - We migrate those into IndexedDB on first load per project.
// ---------------------------------------------------------------------------

export type RepoWorkbenchSide = "base" | "proposal";

export type RepoWorkbenchPackMetaV1 = {
  schema: "kindred.repo_workbench_pack_meta.v1";
  side: RepoWorkbenchSide;
  name: string;
  repo_id?: string;
  pack_sha256?: string;
  total_bytes?: number;
  file_count?: number;
  stored_at_utc: string;
};

const IDB_WB_PREFIX = "kindred_repo_workbench_pack_zip_v1:";
const IDB_LOCKED_PREFIX = "kindred_locked_repo_pack_zip_v1:";

const LS_WB_META_PREFIX = "kindred_repo_workbench_pack_meta_v1:";

function utcNow(): string {
  return new Date().toISOString();
}

function lsGet(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function lsDel(key: string) {
  try {
    localStorage.removeItem(key);
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

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

export function repoWorkbenchPackBytesKey(projectId: string, side: RepoWorkbenchSide): string {
  return `${IDB_WB_PREFIX}${projectId}:${side}`;
}

export function lockedRepoPackBytesKey(projectId: string): string {
  return `${IDB_LOCKED_PREFIX}${projectId}`;
}

export function repoWorkbenchPackMetaKey(projectId: string, side: RepoWorkbenchSide): string {
  return `${LS_WB_META_PREFIX}${projectId}:${side}`;
}

export function getRepoWorkbenchPackMeta(projectId: string, side: RepoWorkbenchSide): RepoWorkbenchPackMetaV1 | null {
  const raw = lsGet(repoWorkbenchPackMetaKey(projectId, side));
  if (!raw) return null;
  const parsed = safeJsonParse<any>(raw);
  if (!parsed || parsed.schema !== "kindred.repo_workbench_pack_meta.v1") return null;
  if (parsed.side !== side) return null;
  return parsed as RepoWorkbenchPackMetaV1;
}

export function setRepoWorkbenchPackMeta(projectId: string, meta: RepoWorkbenchPackMetaV1) {
  lsSet(repoWorkbenchPackMetaKey(projectId, meta.side), JSON.stringify(meta));
  dispatch("kindred_repo_workbench_changed");
}

export async function getRepoWorkbenchPackBytes(projectId: string, side: RepoWorkbenchSide): Promise<Uint8Array | null> {
  return await idbGetBytes(repoWorkbenchPackBytesKey(projectId, side));
}

export async function setRepoWorkbenchPackBytes(
  projectId: string,
  side: RepoWorkbenchSide,
  zipBytes: Uint8Array,
  meta: Omit<RepoWorkbenchPackMetaV1, "schema" | "side" | "stored_at_utc">
): Promise<boolean> {
  const ok = await idbSetBytes(repoWorkbenchPackBytesKey(projectId, side), zipBytes);
  if (ok) {
    setRepoWorkbenchPackMeta(projectId, {
      schema: "kindred.repo_workbench_pack_meta.v1",
      side,
      stored_at_utc: utcNow(),
      ...meta,
    });
  }
  return ok;
}

export async function clearRepoWorkbenchPack(projectId: string, side: RepoWorkbenchSide): Promise<void> {
  await idbDel(repoWorkbenchPackBytesKey(projectId, side));
  lsDel(repoWorkbenchPackMetaKey(projectId, side));
  dispatch("kindred_repo_workbench_changed");
}

export async function clearAllRepoWorkbenchPacks(projectId: string): Promise<void> {
  await clearRepoWorkbenchPack(projectId, "base");
  await clearRepoWorkbenchPack(projectId, "proposal");
}

export async function getLockedRepoPackBytes(projectId: string): Promise<Uint8Array | null> {
  return await idbGetBytes(lockedRepoPackBytesKey(projectId));
}

export async function setLockedRepoPackBytes(projectId: string, bytes: Uint8Array): Promise<boolean> {
  // Also clear legacy localStorage b64 to avoid quota cliffs.
  const ok = await idbSetBytes(lockedRepoPackBytesKey(projectId), bytes);
  if (ok) {
    lsDel(lockedRepoPackB64KeyForProject(projectId));
    dispatch("kindred_repo_governance_bytes_changed");
  }
  return ok;
}

export async function clearLockedRepoPackBytes(projectId: string): Promise<void> {
  await idbDel(lockedRepoPackBytesKey(projectId));
  lsDel(lockedRepoPackB64KeyForProject(projectId));
  dispatch("kindred_repo_governance_bytes_changed");
}

export async function migrateRepoWorkbenchLocalStorageToIndexedDb(projectId: string): Promise<void> {
  // Migrate v1.0.7 project-scoped keys.
  try {
    const baseB64 = lsGet(repoWorkbenchBaseB64KeyForProject(projectId));
    const baseName = lsGet(repoWorkbenchBaseNameKeyForProject(projectId));
    if (baseB64) {
      const bytes = decodeBase64(baseB64);
      await idbSetBytes(repoWorkbenchPackBytesKey(projectId, "base"), bytes);
      if (baseName) {
        setRepoWorkbenchPackMeta(projectId, {
          schema: "kindred.repo_workbench_pack_meta.v1",
          side: "base",
          name: baseName,
          stored_at_utc: utcNow(),
        });
      }
      lsDel(repoWorkbenchBaseB64KeyForProject(projectId));
    }
  } catch {
    // ignore
  }

  try {
    const propB64 = lsGet(repoWorkbenchProposalB64KeyForProject(projectId));
    const propName = lsGet(repoWorkbenchProposalNameKeyForProject(projectId));
    if (propB64) {
      const bytes = decodeBase64(propB64);
      await idbSetBytes(repoWorkbenchPackBytesKey(projectId, "proposal"), bytes);
      if (propName) {
        setRepoWorkbenchPackMeta(projectId, {
          schema: "kindred.repo_workbench_pack_meta.v1",
          side: "proposal",
          name: propName,
          stored_at_utc: utcNow(),
        });
      }
      lsDel(repoWorkbenchProposalB64KeyForProject(projectId));
    }
  } catch {
    // ignore
  }

  // Migrate older unscoped keys (v1.0.6 and earlier).
  try {
    const legacyBaseB64 = lsGet("kindred.repo_workbench.base_pack_b64.v1");
    const legacyBaseName = lsGet("kindred.repo_workbench.base_pack_name.v1");
    const existing = await idbGetBytes(repoWorkbenchPackBytesKey(projectId, "base"));
    if (!existing && legacyBaseB64) {
      await idbSetBytes(repoWorkbenchPackBytesKey(projectId, "base"), decodeBase64(legacyBaseB64));
      if (legacyBaseName) {
        setRepoWorkbenchPackMeta(projectId, {
          schema: "kindred.repo_workbench_pack_meta.v1",
          side: "base",
          name: legacyBaseName,
          stored_at_utc: utcNow(),
        });
      }
      lsDel("kindred.repo_workbench.base_pack_b64.v1");
    }
  } catch {
    // ignore
  }

  try {
    const legacyPropB64 = lsGet("kindred.repo_workbench.proposal_pack_b64.v1");
    const legacyPropName = lsGet("kindred.repo_workbench.proposal_pack_name.v1");
    const existing = await idbGetBytes(repoWorkbenchPackBytesKey(projectId, "proposal"));
    if (!existing && legacyPropB64) {
      await idbSetBytes(repoWorkbenchPackBytesKey(projectId, "proposal"), decodeBase64(legacyPropB64));
      if (legacyPropName) {
        setRepoWorkbenchPackMeta(projectId, {
          schema: "kindred.repo_workbench_pack_meta.v1",
          side: "proposal",
          name: legacyPropName,
          stored_at_utc: utcNow(),
        });
      }
      lsDel("kindred.repo_workbench.proposal_pack_b64.v1");
    }
  } catch {
    // ignore
  }

  // Migrate locked repo pack (v1.0.7).
  try {
    const legacyLockedB64 = lsGet(lockedRepoPackB64KeyForProject(projectId));
    const existing = await idbGetBytes(lockedRepoPackBytesKey(projectId));
    if (!existing && legacyLockedB64) {
      await idbSetBytes(lockedRepoPackBytesKey(projectId), decodeBase64(legacyLockedB64));
      lsDel(lockedRepoPackB64KeyForProject(projectId));
    }
  } catch {
    // ignore
  }
}
