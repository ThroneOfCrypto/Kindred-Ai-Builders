"use client";

import { strToU8 } from "fflate";
import { encodeBase64, decodeBase64, readZip, SpecPack } from "./spec_pack";
import { applyPatchToPack, sha256Hex, SpecPackPatchV1 } from "./spec_pack_patch";
import { APP_VERSION, VALIDATOR_VERSION, SPEC_PACK_VERSION } from "./version";
import { appendEvidenceCard } from "./evidence_ledger";

// ---------------------------------------------------------------------------
// Pack governance v1: Adopt + Lock (truth control) for Spec Packs.
// ---------------------------------------------------------------------------

export const PACK_GOVERNANCE_KEY_PREFIX = "kindred_pack_governance_v1:";
export const LOCKED_PACK_B64_KEY_PREFIX = "kindred_locked_pack_b64_v1:";

export function packGovernanceKeyForProject(projectId: string): string {
  return `${PACK_GOVERNANCE_KEY_PREFIX}${projectId}`;
}

export function lockedPackB64KeyForProject(projectId: string): string {
  return `${LOCKED_PACK_B64_KEY_PREFIX}${projectId}`;
}

function utcNow(): string {
  return new Date().toISOString();
}

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export type LockedPackSnapshotV1 = {
  schema: "kindred.locked_pack_snapshot.v1";
  locked_at_utc: string;
  // Content hashes
  pack_sha256: string;
  files: { path: string; sha256: string; size: number }[];
  // Provenance
  provenance: {
    base_zip_sha256?: string;
    proposal_zip_sha256?: string;
    patch_ops_sha256?: string;
    locked_zip_sha256?: string;
    app_version?: string;
    validator_version?: string;
    spec_pack_version?: string;
  };
};

export type PackGovernanceV1 = {
  schema: "kindred.pack_governance.v1";
  status: "unlocked" | "locked";
  last_locked?: LockedPackSnapshotV1;
  working?: {
    working_copy_id: string;
    unlocked_at_utc?: string;
    from_locked_pack_sha256?: string;
  };
  history: {
    at_utc: string;
    event: "lock" | "unlock";
    locked_pack_sha256?: string;
  }[];
};

export function getPackGovernance(projectId: string): PackGovernanceV1 | null {
  try {
    const raw = localStorage.getItem(packGovernanceKeyForProject(projectId));
    if (!raw) return null;
    const parsed = safeJsonParse<any>(raw);
    if (!parsed || parsed.schema !== "kindred.pack_governance.v1") return null;
    if (parsed.status !== "locked" && parsed.status !== "unlocked") return null;
    const history = Array.isArray(parsed.history) ? parsed.history : [];
    return { ...parsed, history } as PackGovernanceV1;
  } catch {
    return null;
  }
}

export function isPackLocked(projectId: string): boolean {
  const gov = getPackGovernance(projectId);
  return Boolean(gov && gov.status === "locked");
}

export function getLockedPackB64(projectId: string): string {
  try {
    return localStorage.getItem(lockedPackB64KeyForProject(projectId)) || "";
  } catch {
    return "";
  }
}

export function setLockedPackB64(projectId: string, b64: string) {
  try {
    if (!b64) localStorage.removeItem(lockedPackB64KeyForProject(projectId));
    else localStorage.setItem(lockedPackB64KeyForProject(projectId), b64);
  } catch {
    // ignore
  }
}

export function setPackGovernance(projectId: string, gov: PackGovernanceV1) {
  try {
    localStorage.setItem(packGovernanceKeyForProject(projectId), JSON.stringify(gov));
  } catch {
    // ignore
  }
  dispatch("kindred_governance_changed");
}

export function unlockPack(projectId: string): PackGovernanceV1 {
  const prev = getPackGovernance(projectId);
  const now = utcNow();
  const fromLocked = prev?.last_locked?.pack_sha256;
  const workingCopyId = `w_${Math.random().toString(16).slice(2)}_${Date.now().toString(36)}`;

  const next: PackGovernanceV1 = {
    schema: "kindred.pack_governance.v1",
    status: "unlocked",
    last_locked: prev?.last_locked,
    working: {
      working_copy_id: workingCopyId,
      unlocked_at_utc: now,
      from_locked_pack_sha256: fromLocked,
    },
    history: [...(prev?.history || []), { at_utc: now, event: "unlock", locked_pack_sha256: fromLocked }],
  };

  setPackGovernance(projectId, next);

  try {
    appendEvidenceCard({
      project_id: projectId,
      kind: "spec_unlock",
      title: "Spec Pack unlocked",
      summary: fromLocked ? `Unlocked (from locked sha ${fromLocked.slice(0, 12)}…)` : "Unlocked",
      data: { locked_pack_sha256: fromLocked || "" },
    });
  } catch {
    // ignore
  }

  return next;
}

export type PackHashReport = {
  pack_sha256: string;
  files: { path: string; sha256: string; size: number }[];
};

// Deterministic pack hash: sha256 over canonical JSON of per-file sha256 list.
export async function computePackHash(pack: SpecPack): Promise<PackHashReport> {
  const files = [...pack.files].sort((a, b) => a.path.localeCompare(b.path));
  const hashes: { path: string; sha256: string; size: number }[] = [];
  for (const f of files) {
    const sha = await sha256Hex(f.bytes);
    hashes.push({ path: f.path, sha256: sha, size: f.size });
  }
  const canonical = JSON.stringify({ files: hashes });
  const packSha = await sha256Hex(strToU8(canonical));
  return { pack_sha256: packSha, files: hashes };
}

export async function computePatchOpsHash(patch: SpecPackPatchV1): Promise<string> {
  // Only hash the operations & stats (provenance) to keep it stable.
  const canonical = JSON.stringify({ schema: patch.schema, stats: patch.stats, ops: patch.ops });
  return await sha256Hex(strToU8(canonical));
}

export async function lockFromApplyablePatch(opts: {
  projectId: string;
  basePack: SpecPack;
  baseZipBytes: Uint8Array;
  proposalZipBytes?: Uint8Array;
  patch: SpecPackPatchV1;
}): Promise<
  | { ok: true; governance: PackGovernanceV1; mergedZip: Uint8Array; mergedPack: SpecPack; snapshot: LockedPackSnapshotV1 }
  | { ok: false; error: string; details?: string[] }
> {
  const { projectId, basePack, baseZipBytes, proposalZipBytes, patch } = opts;

  const applied = await applyPatchToPack(basePack, patch);
  if (!applied.ok) {
    return { ok: false, error: applied.error, details: applied.details };
  }

  const packHash = await computePackHash(applied.mergedPack);
  const baseZipSha = await sha256Hex(baseZipBytes);
  const proposalZipSha = proposalZipBytes ? await sha256Hex(proposalZipBytes) : undefined;
  const patchOpsSha = await computePatchOpsHash(patch);
  const lockedZipSha = await sha256Hex(applied.mergedZip);

  const snapshot: LockedPackSnapshotV1 = {
    schema: "kindred.locked_pack_snapshot.v1",
    locked_at_utc: utcNow(),
    pack_sha256: packHash.pack_sha256,
    files: packHash.files,
    provenance: {
      base_zip_sha256: baseZipSha,
      proposal_zip_sha256: proposalZipSha,
      patch_ops_sha256: patchOpsSha,
      locked_zip_sha256: lockedZipSha,
      app_version: APP_VERSION,
      validator_version: VALIDATOR_VERSION,
      spec_pack_version: SPEC_PACK_VERSION,
    },
  };

  // Persist locked bytes separately.
  setLockedPackB64(projectId, encodeBase64(applied.mergedZip));

  const prev = getPackGovernance(projectId);
  const next: PackGovernanceV1 = {
    schema: "kindred.pack_governance.v1",
    status: "locked",
    last_locked: snapshot,
    working: prev?.working,
    history: [...(prev?.history || []), { at_utc: snapshot.locked_at_utc, event: "lock", locked_pack_sha256: snapshot.pack_sha256 }],
  };

  setPackGovernance(projectId, next);

  try {
    appendEvidenceCard({
      project_id: projectId,
      kind: "spec_lock",
      title: "Spec Pack locked",
      summary: `Locked spec pack sha ${snapshot.pack_sha256.slice(0, 12)}…` ,
      data: {
        pack_sha256: snapshot.pack_sha256,
        locked_zip_sha256: snapshot.provenance?.locked_zip_sha256 || "",
        spec_pack_version: snapshot.provenance?.spec_pack_version || "",
      },
    });
  } catch {
    // ignore
  }

  return { ok: true, governance: next, mergedZip: applied.mergedZip, mergedPack: applied.mergedPack, snapshot };
}

export async function lockCurrentBasePack(opts: {
  projectId: string;
  basePack: SpecPack;
  baseZipBytes: Uint8Array;
}): Promise<{ ok: true; governance: PackGovernanceV1; snapshot: LockedPackSnapshotV1 } | { ok: false; error: string }> {
  const { projectId, basePack, baseZipBytes } = opts;
  const packHash = await computePackHash(basePack);
  const baseZipSha = await sha256Hex(baseZipBytes);
  const lockedZipSha = await sha256Hex(baseZipBytes);
  const snapshot: LockedPackSnapshotV1 = {
    schema: "kindred.locked_pack_snapshot.v1",
    locked_at_utc: utcNow(),
    pack_sha256: packHash.pack_sha256,
    files: packHash.files,
    provenance: {
      base_zip_sha256: baseZipSha,
      locked_zip_sha256: lockedZipSha,
      app_version: APP_VERSION,
      validator_version: VALIDATOR_VERSION,
      spec_pack_version: SPEC_PACK_VERSION,
    },
  };

  setLockedPackB64(projectId, encodeBase64(baseZipBytes));

  const prev = getPackGovernance(projectId);
  const next: PackGovernanceV1 = {
    schema: "kindred.pack_governance.v1",
    status: "locked",
    last_locked: snapshot,
    working: prev?.working,
    history: [...(prev?.history || []), { at_utc: snapshot.locked_at_utc, event: "lock", locked_pack_sha256: snapshot.pack_sha256 }],
  };
  setPackGovernance(projectId, next);

  try {
    appendEvidenceCard({
      project_id: projectId,
      kind: "spec_lock",
      title: "Spec Pack locked",
      summary: `Locked spec pack sha ${snapshot.pack_sha256.slice(0, 12)}…` ,
      data: {
        pack_sha256: snapshot.pack_sha256,
        locked_zip_sha256: snapshot.provenance?.locked_zip_sha256 || "",
        spec_pack_version: snapshot.provenance?.spec_pack_version || "",
      },
    });
  } catch {
    // ignore
  }

  return { ok: true, governance: next, snapshot };
}

export function deletePackGovernance(projectId: string) {
  try {
    localStorage.removeItem(packGovernanceKeyForProject(projectId));
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(lockedPackB64KeyForProject(projectId));
  } catch {
    // ignore
  }
  dispatch("kindred_governance_changed");
}

export function duplicatePackGovernance(sourceProjectId: string, targetProjectId: string) {
  try {
    const raw = localStorage.getItem(packGovernanceKeyForProject(sourceProjectId)) || "";
    if (raw) localStorage.setItem(packGovernanceKeyForProject(targetProjectId), raw);
  } catch {
    // ignore
  }
  try {
    const b64 = getLockedPackB64(sourceProjectId);
    if (b64) setLockedPackB64(targetProjectId, b64);
  } catch {
    // ignore
  }
}

export function decodeLockedPack(projectId: string): SpecPack | null {
  const b64 = getLockedPackB64(projectId);
  if (!b64) return null;
  try {
    const bytes = decodeBase64(b64);
    return readZip(bytes);
  } catch {
    return null;
  }
}
