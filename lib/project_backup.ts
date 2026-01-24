"use client";

import { stableJsonText } from "./stable_json";
import { sha256Hex } from "./hash";
import { zipDeterministic } from "./deterministic_zip";
import { asText, decodeBase64, encodeBase64, readZip, tryParseJson } from "./spec_pack";

import {
  loadProjectStateById,
  saveProjectStateById,
  setCurrentProjectId,
  lastBasePackKeyForProject,
  lastProposalPackKeyForProject,
} from "./state";

import {
  getLockedPackB64,
  getPackGovernance,
  setLockedPackB64,
  setPackGovernance,
  type PackGovernanceV1,
} from "./pack_governance";

import { listSnapshots, replaceSnapshots, type SnapshotV1 } from "./snapshots";

import {
  getRepoPackGovernance,
  setRepoPackGovernance,
  type RepoPackGovernanceV1,
} from "./repo_pack_governance";

import {
  getRepoWorkbenchPackBytes,
  getRepoWorkbenchPackMeta,
  getLockedRepoPackBytes,
  setRepoWorkbenchPackBytes,
  setLockedRepoPackBytes,
  type RepoWorkbenchPackMetaV1,
} from "./repo_pack_bytes_store";

import { getDogfoodReport, setDogfoodReport, type DogfoodReportV1 } from "./dogfood";
import { loadVerifyStore, saveVerifyStore, type VerifyStoreV1 } from "./verify";
import { loadEnabledKits, saveEnabledKits, type EnabledKitsV1 } from "./project_kits";
import { getRigorConfig, setRigorLevel, type RigorConfigV1 } from "./rigor";
import { loadEvidenceLedger, saveEvidenceLedger, type EvidenceLedgerV1 } from "./evidence_ledger";
import { APP_VERSION } from "./version";

export type ProjectBackupMetaV2 = {
  schema: "kindred.project_backup.v2";
  created_at_utc: string;
  app_version: string;
  project_id: string;
  project_name: string;
  includes: {
    project_state: boolean;
    snapshots: number;
    spec: {
      base: boolean;
      proposal: boolean;
      locked: boolean;
      governance: boolean;
    };
    repo: {
      base: boolean;
      proposal: boolean;
      locked: boolean;
      governance: boolean;
      base_meta: boolean;
      proposal_meta: boolean;
    };
    dogfood_report: boolean;
    verify_reports: number;
    enabled_kits: number;
    rigor_contract: boolean;
    evidence_cards: number;
  };
  hashes?: {
    spec_base_zip_sha256?: string;
    spec_proposal_zip_sha256?: string;
    spec_locked_zip_sha256?: string;
    repo_base_zip_sha256?: string;
    repo_proposal_zip_sha256?: string;
    repo_locked_zip_sha256?: string;
  };
  notes?: string[];
};

export type ProjectBackupBuildResult =
  | { ok: true; zipBytes: Uint8Array; meta: ProjectBackupMetaV2 }
  | { ok: false; error: string; details?: string[] };

function lsGet(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function utcNow(): string {
  return new Date().toISOString();
}

export async function buildProjectBackupZip(projectId: string): Promise<ProjectBackupBuildResult> {
  const pid = String(projectId || "").trim();
  if (!pid) return { ok: false, error: "No project selected." };

  const details: string[] = [];
  let projectName = pid;

  let stateJson = "";
  try {
    const st = loadProjectStateById(pid);
    projectName = st?.project?.name || pid;
    stateJson = stableJsonText(st, 2);
  } catch {
    details.push("Could not read project state.");
    stateJson = "";
  }

  const baseSpecB64 = lsGet(lastBasePackKeyForProject(pid));
  const proposalSpecB64 = lsGet(lastProposalPackKeyForProject(pid));
  const lockedSpecB64 = getLockedPackB64(pid) || "";
  const specGov = getPackGovernance(pid);
  const snapshots = listSnapshots(pid);

  const repoBaseBytes = await getRepoWorkbenchPackBytes(pid, "base");
  const repoProposalBytes = await getRepoWorkbenchPackBytes(pid, "proposal");
  const repoLockedBytes = await getLockedRepoPackBytes(pid);
  const repoGov = getRepoPackGovernance(pid);
  const repoBaseMeta = getRepoWorkbenchPackMeta(pid, "base");
  const repoProposalMeta = getRepoWorkbenchPackMeta(pid, "proposal");

  const dogfood = getDogfoodReport(pid);
  const verifyStore = loadVerifyStore(pid);
  const enabledKits = loadEnabledKits(pid);

  let rigor: RigorConfigV1 | null = null;
  try {
    rigor = getRigorConfig(pid);
  } catch {
    rigor = null;
    details.push("Could not read rigor config.");
  }

  let evidence: EvidenceLedgerV1 = { schema: "kindred.evidence_ledger.v1", project_id: pid, cards: [] };
  try {
    evidence = loadEvidenceLedger(pid);
  } catch {
    evidence = { schema: "kindred.evidence_ledger.v1", project_id: pid, cards: [] };
    details.push("Could not read evidence ledger.");
  }

  const hashes: ProjectBackupMetaV2["hashes"] = {};
  try {
    if (baseSpecB64) hashes.spec_base_zip_sha256 = await sha256Hex(decodeBase64(baseSpecB64));
  } catch {
    details.push("Could not hash Spec Base zip.");
  }
  try {
    if (proposalSpecB64) hashes.spec_proposal_zip_sha256 = await sha256Hex(decodeBase64(proposalSpecB64));
  } catch {
    details.push("Could not hash Spec Proposal zip.");
  }
  try {
    if (lockedSpecB64) hashes.spec_locked_zip_sha256 = await sha256Hex(decodeBase64(lockedSpecB64));
  } catch {
    details.push("Could not hash Spec Locked zip.");
  }
  try {
    if (repoBaseBytes) hashes.repo_base_zip_sha256 = await sha256Hex(repoBaseBytes);
  } catch {
    details.push("Could not hash Repo Base zip.");
  }
  try {
    if (repoProposalBytes) hashes.repo_proposal_zip_sha256 = await sha256Hex(repoProposalBytes);
  } catch {
    details.push("Could not hash Repo Proposal zip.");
  }
  try {
    if (repoLockedBytes) hashes.repo_locked_zip_sha256 = await sha256Hex(repoLockedBytes);
  } catch {
    details.push("Could not hash Repo Locked zip.");
  }

  const meta: ProjectBackupMetaV2 = {
    schema: "kindred.project_backup.v2",
    created_at_utc: utcNow(),
    app_version: APP_VERSION,
    project_id: pid,
    project_name: projectName,
    includes: {
      project_state: Boolean(stateJson),
      snapshots: snapshots.length,
      spec: {
        base: Boolean(baseSpecB64),
        proposal: Boolean(proposalSpecB64),
        locked: Boolean(lockedSpecB64),
        governance: Boolean(specGov),
      },
      repo: {
        base: Boolean(repoBaseBytes),
        proposal: Boolean(repoProposalBytes),
        locked: Boolean(repoLockedBytes),
        governance: Boolean(repoGov),
        base_meta: Boolean(repoBaseMeta),
        proposal_meta: Boolean(repoProposalMeta),
      },
      dogfood_report: Boolean(dogfood),
      verify_reports: Array.isArray(verifyStore.reports) ? verifyStore.reports.length : 0,
      enabled_kits: Array.isArray(enabledKits.kit_ids) ? enabledKits.kit_ids.length : 0,
      rigor_contract: Boolean(rigor),
      evidence_cards: evidence && Array.isArray(evidence.cards) ? evidence.cards.length : 0,
    },
    hashes,
    notes: details.length ? details.slice(0, 50) : undefined,
  };

  const files: Record<string, Uint8Array> = {};
  files["meta.json"] = new TextEncoder().encode(stableJsonText(meta, 2));
  files["README_RESTORE.md"] = new TextEncoder().encode(
    [
      "# Kindred Project Backup (v2)",
      "",
      "This ZIP is a portable backup of a single Kindred project.",
      "",
      "Includes (when present):",
      "- Project state (builder + IA + tokens)",
      "- Spec Pack caches + Spec Pack governance",
      "- Repo Pack bytes (IndexedDB export) + Repo Pack governance",
      "- Verify reports",
      "- Enabled kits list",
      "- Rigor contract (rigor dial)",
      "- Evidence ledger",
      "- Dogfood report",
      "- Snapshots",
      "",
      "To restore, use the in-app Backup screen: /backup",
      "",
    ].join("\n"),
  );

  if (stateJson) files["state/project_state.json"] = new TextEncoder().encode(stateJson);

  if (specGov) files["governance/spec/pack_governance.json"] = new TextEncoder().encode(stableJsonText(specGov, 2));
  if (baseSpecB64) files["packs/spec/base.zip"] = decodeBase64(baseSpecB64);
  if (proposalSpecB64) files["packs/spec/proposal.zip"] = decodeBase64(proposalSpecB64);
  if (lockedSpecB64) files["packs/spec/locked.zip"] = decodeBase64(lockedSpecB64);

  if (repoGov) files["governance/repo/repo_pack_governance.json"] = new TextEncoder().encode(stableJsonText(repoGov, 2));
  if (repoBaseMeta) files["repo/meta/base_meta.json"] = new TextEncoder().encode(stableJsonText(repoBaseMeta, 2));
  if (repoProposalMeta) files["repo/meta/proposal_meta.json"] = new TextEncoder().encode(stableJsonText(repoProposalMeta, 2));
  if (repoBaseBytes) files["packs/repo/base.zip"] = repoBaseBytes;
  if (repoProposalBytes) files["packs/repo/proposal.zip"] = repoProposalBytes;
  if (repoLockedBytes) files["packs/repo/locked.zip"] = repoLockedBytes;

  if (dogfood) files["dogfood/dogfood_report.json"] = new TextEncoder().encode(stableJsonText(dogfood, 2));
  if (verifyStore && Array.isArray(verifyStore.reports) && verifyStore.reports.length > 0) {
    files["verify/verify_store.json"] = new TextEncoder().encode(stableJsonText(verifyStore, 2));
  }
  if (enabledKits && Array.isArray(enabledKits.kit_ids) && enabledKits.kit_ids.length > 0) {
    files["kits/enabled_kits.json"] = new TextEncoder().encode(stableJsonText(enabledKits, 2));
  }
  if (rigor) files["contracts/rigor.json"] = new TextEncoder().encode(stableJsonText({
    schema: "kindred.rigor_contract.v1",
    captured_at_utc: utcNow(),
    project_id: pid,
    rigor: { level: rigor.level },
  }, 2));
  if (evidence && Array.isArray(evidence.cards) && evidence.cards.length > 0) {
    files["evidence/ledger.json"] = new TextEncoder().encode(stableJsonText(evidence, 2));
  }
  if (snapshots.length > 0) files["snapshots/snapshots.json"] = new TextEncoder().encode(stableJsonText(snapshots, 2));

  try {
    const zipBytes = zipDeterministic(files, { level: 6 });
    return { ok: true, zipBytes, meta };
  } catch (e: any) {
    return { ok: false, error: "Failed to create backup ZIP", details: [String(e?.message || e || "unknown error")].concat(details) };
  }
}

export type ProjectBackupRestoreResult =
  | { ok: true; projectId: string; meta: any; warnings: string[] }
  | { ok: false; error: string; details?: string[] };

function fileText(pack: { fileMap: Map<string, any> }, path: string): string {
  const f = pack.fileMap.get(path);
  if (!f) return "";
  return asText(f);
}

function fileBytes(pack: { fileMap: Map<string, any> }, path: string): Uint8Array | null {
  const f = pack.fileMap.get(path);
  if (!f) return null;
  return f.bytes as Uint8Array;
}

export async function restoreProjectBackupZip(zipBytes: Uint8Array, opts?: { target_project_id?: string }): Promise<ProjectBackupRestoreResult> {
  const warnings: string[] = [];
  if (!zipBytes || zipBytes.byteLength < 4) return { ok: false, error: "ZIP is empty or invalid." };

  let pack: any;
  try {
    pack = readZip(zipBytes);
  } catch (e: any) {
    return { ok: false, error: "Could not read ZIP", details: [String(e?.message || e || "unknown error")] };
  }

  const metaRaw = fileText(pack, "meta.json");
  if (!metaRaw) return { ok: false, error: "Missing meta.json in backup ZIP." };

  const metaParsed = tryParseJson<any>(metaRaw);
  if (!metaParsed.ok) return { ok: false, error: "meta.json is not valid JSON", details: [metaParsed.error] };
  const meta = metaParsed.value;

  const schema = String(meta?.schema || "");
  if (schema !== "kindred.project_backup.v1" && schema !== "kindred.project_backup.v2") {
    return { ok: false, error: `Unsupported backup schema: ${schema || "(missing)"}` };
  }

  const srcProjectId = String(meta?.project_id || "").trim();
  const srcProjectName = String(meta?.project_name || "").trim() || srcProjectId;
  if (!srcProjectId) return { ok: false, error: "Backup meta is missing project_id." };

  const targetProjectId = String(opts?.target_project_id || "").trim() || srcProjectId;

  // 1) Project state
  const stateText = fileText(pack, "state/project_state.json");
  if (stateText) {
    const stParsed = tryParseJson<any>(stateText);
    if (stParsed.ok) {
      try {
        const st = stParsed.value;
        // Force the target id + a sane name.
        if (!st.project || typeof st.project !== "object") st.project = {};
        st.project.id = targetProjectId;
        st.project.name = st.project.name || srcProjectName || "Untitled Project";
        saveProjectStateById(targetProjectId, st);
      } catch {
        warnings.push("Could not restore project state.");
      }
    } else {
      warnings.push("project_state.json is invalid JSON.");
    }
  } else {
    // Ensure at least a project exists.
    try {
      const st = loadProjectStateById(targetProjectId);
      const fixed = { ...st, project: { ...st.project, id: targetProjectId, name: st.project.name || srcProjectName || "Untitled Project" } };
      saveProjectStateById(targetProjectId, fixed);
    } catch {
      // ignore
    }
    warnings.push("No project_state.json found; restored only packs + local artefacts.");
  }

  // 2) Spec packs + governance
  const specBase = fileBytes(pack, "packs/spec/base.zip");
  const specProposal = fileBytes(pack, "packs/spec/proposal.zip");
  const specLocked = fileBytes(pack, "packs/spec/locked.zip");
  if (specBase) {
    try {
      localStorage.setItem(lastBasePackKeyForProject(targetProjectId), encodeBase64(specBase));
    } catch {
      warnings.push("Could not restore Spec Base pack cache.");
    }
  }
  if (specProposal) {
    try {
      localStorage.setItem(lastProposalPackKeyForProject(targetProjectId), encodeBase64(specProposal));
    } catch {
      warnings.push("Could not restore Spec Proposal pack cache.");
    }
  }
  if (specLocked) {
    try {
      setLockedPackB64(targetProjectId, encodeBase64(specLocked));
    } catch {
      warnings.push("Could not restore Spec Locked pack bytes.");
    }
  }

  const specGovText = fileText(pack, "governance/spec/pack_governance.json");
  if (specGovText) {
    const parsed = tryParseJson<PackGovernanceV1>(specGovText);
    if (parsed.ok) {
      try {
        setPackGovernance(targetProjectId, parsed.value);
      } catch {
        warnings.push("Could not restore Spec governance.");
      }
    } else {
      warnings.push("Spec governance JSON is invalid.");
    }
  }

  // 3) Snapshots
  const snapsText = fileText(pack, "snapshots/snapshots.json");
  if (snapsText) {
    const parsed = tryParseJson<any>(snapsText);
    if (parsed.ok && Array.isArray(parsed.value)) {
      try {
        const snaps: SnapshotV1[] = parsed.value;
        replaceSnapshots(targetProjectId, snaps);
      } catch {
        warnings.push("Could not restore snapshots.");
      }
    }
  }

  // 4) Repo packs (IndexedDB) + governance + meta
  const repoBase = fileBytes(pack, "packs/repo/base.zip");
  const repoProposal = fileBytes(pack, "packs/repo/proposal.zip");
  const repoLocked = fileBytes(pack, "packs/repo/locked.zip");

  const repoBaseMetaText = fileText(pack, "repo/meta/base_meta.json");
  const repoProposalMetaText = fileText(pack, "repo/meta/proposal_meta.json");
  const repoBaseMetaParsed = repoBaseMetaText ? tryParseJson<RepoWorkbenchPackMetaV1>(repoBaseMetaText) : null;
  const repoProposalMetaParsed = repoProposalMetaText ? tryParseJson<RepoWorkbenchPackMetaV1>(repoProposalMetaText) : null;

  if (repoBase) {
    try {
      const metaIn = repoBaseMetaParsed && repoBaseMetaParsed.ok ? repoBaseMetaParsed.value : null;
      await setRepoWorkbenchPackBytes(targetProjectId, "base", repoBase, {
        name: metaIn?.name || "Base (restored)",
        repo_id: metaIn?.repo_id,
        pack_sha256: metaIn?.pack_sha256,
        total_bytes: metaIn?.total_bytes,
        file_count: metaIn?.file_count,
      });
    } catch {
      warnings.push("Could not restore Repo Base pack bytes (IndexedDB).");
    }
  }

  if (repoProposal) {
    try {
      const metaIn = repoProposalMetaParsed && repoProposalMetaParsed.ok ? repoProposalMetaParsed.value : null;
      await setRepoWorkbenchPackBytes(targetProjectId, "proposal", repoProposal, {
        name: metaIn?.name || "Proposal (restored)",
        repo_id: metaIn?.repo_id,
        pack_sha256: metaIn?.pack_sha256,
        total_bytes: metaIn?.total_bytes,
        file_count: metaIn?.file_count,
      });
    } catch {
      warnings.push("Could not restore Repo Proposal pack bytes (IndexedDB).");
    }
  }

  if (repoLocked) {
    try {
      await setLockedRepoPackBytes(targetProjectId, repoLocked);
    } catch {
      warnings.push("Could not restore Repo Locked bytes (IndexedDB).");
    }
  }

  const repoGovText = fileText(pack, "governance/repo/repo_pack_governance.json");
  if (repoGovText) {
    const parsed = tryParseJson<RepoPackGovernanceV1>(repoGovText);
    if (parsed.ok) {
      try {
        setRepoPackGovernance(targetProjectId, parsed.value);
      } catch {
        warnings.push("Could not restore Repo governance.");
      }
    } else {
      warnings.push("Repo governance JSON is invalid.");
    }
  }

  // 5) Dogfood report
  const dogfoodText = fileText(pack, "dogfood/dogfood_report.json");
  if (dogfoodText) {
    const parsed = tryParseJson<DogfoodReportV1>(dogfoodText);
    if (parsed.ok) {
      try {
        setDogfoodReport(targetProjectId, parsed.value);
      } catch {
        warnings.push("Could not restore dogfood report.");
      }
    }
  }

  // 6) Verify reports
  const verifyText = fileText(pack, "verify/verify_store.json");
  if (verifyText) {
    const parsed = tryParseJson<VerifyStoreV1>(verifyText);
    if (parsed.ok) {
      try {
        saveVerifyStore(targetProjectId, parsed.value);
      } catch {
        warnings.push("Could not restore verify reports.");
      }
    }
  }

  // 7) Enabled kits
  const kitsText = fileText(pack, "kits/enabled_kits.json");
  if (kitsText) {
    const parsed = tryParseJson<EnabledKitsV1>(kitsText);
    if (parsed.ok) {
      try {
        saveEnabledKits(targetProjectId, parsed.value);
      } catch {
        warnings.push("Could not restore enabled kits list.");
      }
    }
  }

  // 8) Rigor contract
  const rigorText = fileText(pack, "contracts/rigor.json");
  if (rigorText) {
    const parsed = tryParseJson<any>(rigorText);
    if (parsed.ok) {
      const level = String(parsed.value?.rigor?.level || "");
      if (level === "safe" || level === "strict" || level === "audit") {
        try {
          setRigorLevel(targetProjectId, level as any);
        } catch {
          warnings.push("Could not restore rigor contract.");
        }
      } else {
        warnings.push("Rigor contract has an invalid level.");
      }
    } else {
      warnings.push("Rigor contract JSON is invalid.");
    }
  }

  // 9) Evidence ledger
  const evText = fileText(pack, "evidence/ledger.json");
  if (evText) {
    const parsed = tryParseJson<EvidenceLedgerV1>(evText);
    if (parsed.ok) {
      try {
        // Force project id to target
        const cardsIn = Array.isArray((parsed.value as any).cards) ? (parsed.value as any).cards : [];
        const cardsOut = cardsIn
          .filter((c: any) => c && c.schema === "kindred.evidence_card.v1")
          .map((c: any) => ({ ...c, project_id: targetProjectId }));
        const next: EvidenceLedgerV1 = {
          schema: "kindred.evidence_ledger.v1",
          project_id: targetProjectId,
          cards: cardsOut,
        };
        saveEvidenceLedger(next);
      } catch {
        warnings.push("Could not restore evidence ledger.");
      }
    } else {
      warnings.push("Evidence ledger JSON is invalid.");
    }
  }

  // Always jump to restored project.
  try {
    setCurrentProjectId(targetProjectId);
  } catch {
    // ignore
  }

  return { ok: true, projectId: targetProjectId, meta, warnings };
}
