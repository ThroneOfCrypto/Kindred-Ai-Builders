"use client";

import { strToU8 } from "fflate";

import { sha256Hex } from "./hash";
import { stableJsonText } from "./stable_json";
import { APP_VERSION, REPO_PACK_VERSION, VALIDATOR_VERSION } from "./version";
import type { RepoPack } from "./repo_pack_io";
import type { RepoPackPatchV1 } from "./repo_pack_patch";
import { applyRepoPatchToPack } from "./repo_pack_workbench";
import { setLockedRepoPackBytes } from "./repo_pack_bytes_store";
import { appendEvidenceCard } from "./evidence_ledger";

// ---------------------------------------------------------------------------
// Repo Pack governance v1: Adopt + Lock (truth control) for Repo Packs.
//
// IMPORTANT: governance is scoped per project (just like Spec Pack governance).
// ---------------------------------------------------------------------------

export const REPO_GOVERNANCE_KEY_PREFIX = "kindred_repo_pack_governance_v1:";
export const LOCKED_REPO_PACK_B64_KEY_PREFIX = "kindred_locked_repo_pack_b64_v1:";

export function repoPackGovernanceKeyForProject(projectId: string): string {
  return `${REPO_GOVERNANCE_KEY_PREFIX}${projectId}`;
}

export function lockedRepoPackB64KeyForProject(projectId: string): string {
  return `${LOCKED_REPO_PACK_B64_KEY_PREFIX}${projectId}`;
}

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

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

export type LockedRepoPackSnapshotV1 = {
  schema: "kindred.locked_repo_pack_snapshot.v1";
  locked_at_utc: string;
  repo_id: string;
  pack_sha256: string;
  files: { path: string; sha256: string; size: number; is_text: boolean }[];
  provenance: {
    base_pack_sha256?: string;
    proposal_pack_sha256?: string;
    patch_ops_sha256?: string;
    locked_pack_sha256?: string;
    app_version?: string;
    validator_version?: string;
    repo_pack_version?: string;
  };
};

export type RepoPackGovernanceV1 = {
  schema: "kindred.repo_pack_governance_state.v1";
  status: "unlocked" | "locked";
  last_locked?: LockedRepoPackSnapshotV1;
  history: {
    at_utc: string;
    event: "lock" | "unlock";
    locked_pack_sha256?: string;
  }[];
};

export function getRepoPackGovernance(projectId: string): RepoPackGovernanceV1 | null {
  try {
    const raw = localStorage.getItem(repoPackGovernanceKeyForProject(projectId));
    if (!raw) return null;
    const parsed = safeJsonParse<any>(raw);
    if (!parsed || parsed.schema !== "kindred.repo_pack_governance_state.v1") return null;
    if (parsed.status !== "locked" && parsed.status !== "unlocked") return null;
    const history = Array.isArray(parsed.history) ? parsed.history : [];
    return { ...parsed, history } as RepoPackGovernanceV1;
  } catch {
    return null;
  }
}

export function isRepoPackLocked(projectId: string): boolean {
  const gov = getRepoPackGovernance(projectId);
  return Boolean(gov && gov.status === "locked");
}

export function setRepoPackGovernance(projectId: string, gov: RepoPackGovernanceV1) {
  try {
    localStorage.setItem(repoPackGovernanceKeyForProject(projectId), JSON.stringify(gov));
  } catch {
    // ignore
  }
  dispatch("kindred_repo_governance_changed");
}

// NOTE: Repo Pack ZIP bytes are stored in IndexedDB (see repo_pack_bytes_store.ts).
// We keep the legacy localStorage b64 key only for back-compat migration.

export function unlockRepoPack(projectId: string): RepoPackGovernanceV1 {
  const prev = getRepoPackGovernance(projectId);
  const now = utcNow();
  const fromLocked = prev?.last_locked?.pack_sha256;
  const next: RepoPackGovernanceV1 = {
    schema: "kindred.repo_pack_governance_state.v1",
    status: "unlocked",
    last_locked: prev?.last_locked,
    history: [...(prev?.history || []), { at_utc: now, event: "unlock", locked_pack_sha256: fromLocked }],
  };
  setRepoPackGovernance(projectId, next);

  try {
    appendEvidenceCard({
      project_id: projectId,
      kind: "repo_unlock",
      title: "Repo Pack unlocked",
      summary: fromLocked ? `Unlocked (from locked sha ${fromLocked.slice(0, 12)}…)` : "Unlocked",
      data: { locked_pack_sha256: fromLocked || "" },
    });
  } catch {
    // ignore
  }
  return next;
}

export async function computeRepoPatchOpsHash(patch: RepoPackPatchV1): Promise<string> {
  const canonical = stableJsonText({ schema: patch.schema, stats: patch.stats, ops: patch.ops }, 0);
  return await sha256Hex(strToU8(canonical));
}

export async function lockCurrentBaseRepoPack(opts: {
  projectId: string;
  basePack: RepoPack;
  baseZipBytes: Uint8Array;
}): Promise<{ ok: true; governance: RepoPackGovernanceV1; snapshot: LockedRepoPackSnapshotV1 } | { ok: false; error: string }> {
  const { projectId, basePack, baseZipBytes } = opts;

  const baseZipSha = await sha256Hex(baseZipBytes);
  const lockedZipSha = baseZipSha;
  const files = basePack.files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({
      path: f.path,
      sha256: f.sha256,
      size: f.size,
      is_text: f.is_text,
    }));

  const snapshot: LockedRepoPackSnapshotV1 = {
    schema: "kindred.locked_repo_pack_snapshot.v1",
    locked_at_utc: utcNow(),
    repo_id: basePack.manifest.repo_id,
    pack_sha256: basePack.pack_sha256,
    files,
    provenance: {
      base_pack_sha256: baseZipSha,
      locked_pack_sha256: lockedZipSha,
      app_version: APP_VERSION,
      validator_version: VALIDATOR_VERSION,
      repo_pack_version: REPO_PACK_VERSION,
    },
  };

  await setLockedRepoPackBytes(projectId, baseZipBytes);

  const prev = getRepoPackGovernance(projectId);
  const next: RepoPackGovernanceV1 = {
    schema: "kindred.repo_pack_governance_state.v1",
    status: "locked",
    last_locked: snapshot,
    history: [...(prev?.history || []), { at_utc: snapshot.locked_at_utc, event: "lock", locked_pack_sha256: snapshot.pack_sha256 }],
  };
  setRepoPackGovernance(projectId, next);

  try {
    appendEvidenceCard({
      project_id: projectId,
      kind: "repo_lock",
      title: "Repo Pack locked",
      summary: `Locked repo pack sha ${snapshot.pack_sha256.slice(0, 12)}…`,
      data: {
        pack_sha256: snapshot.pack_sha256,
        locked_zip_sha256: snapshot.provenance?.locked_pack_sha256 || "",
        repo_pack_version: snapshot.provenance?.repo_pack_version || "",
      },
    });
  } catch {
    // ignore
  }
  return { ok: true, governance: next, snapshot };
}

export async function lockFromApplyableRepoPatch(opts: {
  projectId: string;
  basePack: RepoPack;
  baseZipBytes: Uint8Array;
  proposalZipBytes?: Uint8Array;
  patch: RepoPackPatchV1;
}): Promise<
  | { ok: true; governance: RepoPackGovernanceV1; mergedZip: Uint8Array; mergedPack: RepoPack; snapshot: LockedRepoPackSnapshotV1 }
  | { ok: false; error: string; details?: string[] }
> {
  const { projectId, basePack, baseZipBytes, proposalZipBytes, patch } = opts;
  const applied = await applyRepoPatchToPack(basePack, patch);
  if (!applied.ok) return { ok: false, error: applied.error, details: applied.details };

  const baseZipSha = await sha256Hex(baseZipBytes);
  const proposalZipSha = proposalZipBytes ? await sha256Hex(proposalZipBytes) : undefined;
  const patchOpsSha = await computeRepoPatchOpsHash(patch);
  const lockedZipSha = await sha256Hex(applied.mergedZip);

  const files = applied.mergedPack.files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({ path: f.path, sha256: f.sha256, size: f.size, is_text: f.is_text }));

  const snapshot: LockedRepoPackSnapshotV1 = {
    schema: "kindred.locked_repo_pack_snapshot.v1",
    locked_at_utc: utcNow(),
    repo_id: applied.mergedPack.manifest.repo_id,
    pack_sha256: applied.mergedPack.pack_sha256,
    files,
    provenance: {
      base_pack_sha256: baseZipSha,
      proposal_pack_sha256: proposalZipSha,
      patch_ops_sha256: patchOpsSha,
      locked_pack_sha256: lockedZipSha,
      app_version: APP_VERSION,
      validator_version: VALIDATOR_VERSION,
      repo_pack_version: REPO_PACK_VERSION,
    },
  };

  await setLockedRepoPackBytes(projectId, applied.mergedZip);

  const prev = getRepoPackGovernance(projectId);
  const next: RepoPackGovernanceV1 = {
    schema: "kindred.repo_pack_governance_state.v1",
    status: "locked",
    last_locked: snapshot,
    history: [...(prev?.history || []), { at_utc: snapshot.locked_at_utc, event: "lock", locked_pack_sha256: snapshot.pack_sha256 }],
  };
  setRepoPackGovernance(projectId, next);

  try {
    appendEvidenceCard({
      project_id: projectId,
      kind: "repo_lock",
      title: "Repo Pack locked",
      summary: `Locked repo pack sha ${snapshot.pack_sha256.slice(0, 12)}…`,
      data: {
        pack_sha256: snapshot.pack_sha256,
        locked_zip_sha256: snapshot.provenance?.locked_pack_sha256 || "",
        repo_pack_version: snapshot.provenance?.repo_pack_version || "",
      },
    });
  } catch {
    // ignore
  }
  return { ok: true, governance: next, mergedZip: applied.mergedZip, mergedPack: applied.mergedPack, snapshot };
}
