"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "./Panel";
import { Callout } from "./Callout";

import {
  getCurrentProjectId,
  loadProjectStateById,
  deriveDoneSteps,
  lastBasePackKeyForProject,
  lastProposalPackKeyForProject,
  LEGACY_LAST_BASE_PACK_KEY,
  LEGACY_LAST_PROPOSAL_PACK_KEY,
} from "../lib/state";

import {
  DIRECTOR_PHASES,
  directorPhaseDone,
  type DirectorPhaseId,
} from "../lib/director_steps";

import { getPackGovernance, isPackLocked } from "../lib/pack_governance";
import { getRepoPackGovernance, isRepoPackLocked } from "../lib/repo_pack_governance";
import { getRepoWorkbenchPackMeta, getLockedRepoPackBytes, type RepoWorkbenchPackMetaV1 } from "../lib/repo_pack_bytes_store";
import { getBlueprintPackMeta, type BlueprintPackStoreMetaV1 } from "../lib/blueprint_pack_store";
import { getLatestVerifyReport, type VerifyReport } from "../lib/verify";
import { getBackupHistory, type BackupHistoryV1 } from "../lib/backup_history";
import { getDogfoodReport, type DogfoodReportV1 } from "../lib/dogfood";
import { listSnapshots } from "../lib/snapshots";
import { isApplyable, loadProposals, type ProposalV2 } from "../lib/proposals";

type Tri = "pass" | "warn" | "fail";

function pillKind(tri: Tri): "success" | "warn" | "error" {
  if (tri === "pass") return "success";
  if (tri === "warn") return "warn";
  return "error";
}

function readLS(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function shortSha(s: string | null | undefined): string {
  const x = String(s || "").trim();
  if (!x) return "";
  return x.length <= 12 ? x : x.slice(0, 12);
}

function triFromVerify(report: VerifyReport | null): Tri {
  if (!report) return "warn";
  const overall = String(report.overall || "").toLowerCase();
  if (overall === "fail") return "fail";
  if (overall === "warn") return "warn";
  if (overall === "pass") return "pass";
  return "warn";
}

function isLikelyCurrentProjectProposal(projectId: string, p: ProposalV2): boolean {
  const base = String(p.patch.base_project_id || "").trim();
  if (!base) return true;
  return base === projectId;
}

function countProjectProposals(projectId: string): number {
  try {
    const all = loadProposals().filter(isApplyable) as ProposalV2[];
    return all.filter((p) => isLikelyCurrentProjectProposal(projectId, p)).length;
  } catch {
    return 0;
  }
}

type StatusModel = {
  coherence: { lastSha?: string; lastGeneratedAt?: string };
  interrogator: { lastSha?: string; lastGeneratedAt?: string };
  preview: { lastPackSha?: string; lastGeneratedAt?: string };
  projectId: string;
  projectName: string;

  build: {
    doneCount: number;
    totalCount: number;
    nextPhase: DirectorPhaseId | null;
    reviewDone: boolean;
  };

  intent: {
    proposalsCount: number;
    selectedProposalId?: string;
    lastIntentPackSha?: string;
    lastSddlSeedSha?: string;
  };

  spec: {
    locked: boolean;
    basePresent: boolean;
    proposalPresent: boolean;
    savedProposals: number;
    lockAt?: string;
    lockSha?: string;
  };

  repo: {
    featureEnabled: boolean;
    locked: boolean;
    baseMeta: RepoWorkbenchPackMetaV1 | null;
    proposalMeta: RepoWorkbenchPackMetaV1 | null;
    lockedBytesPresent: boolean;
    lockAt?: string;
    lockSha?: string;
  };

  blueprint: {
    meta: BlueprintPackStoreMetaV1 | null;
    tri: Tri;
    note: string;
  };

  verify: {
    latest: VerifyReport | null;
    tri: Tri;
  };

  backup: {
    history: BackupHistoryV1 | null;
  };

  dogfood: {
    report: DogfoodReportV1 | null;
  };

  snapshots: {
    count: number;
  };
};

function triFromBlueprint(meta: BlueprintPackStoreMetaV1 | null, specGov: any | null): { tri: Tri; detail: string } {
  if (!meta) {
    return { tri: "warn", detail: "Not compiled yet." };
  }

  const specLocked = Boolean(specGov && specGov.status === "locked");
  const lockedZipSha = String(specGov?.last_locked?.provenance?.locked_zip_sha256 || "").trim();
  const metaSpecZipSha = String(meta.spec_pack_sha256 || "").trim();

  if (!specLocked) {
    return { tri: "warn", detail: `Stored for spec zip sha ${shortSha(metaSpecZipSha)}… (spec not locked yet)` };
  }

  if (!lockedZipSha) {
    return { tri: "warn", detail: `Stored for spec zip sha ${shortSha(metaSpecZipSha)}… (lock snapshot missing zip sha)` };
  }

  if (!metaSpecZipSha) {
    return { tri: "warn", detail: `Stored blueprint sha ${shortSha(meta.blueprint_pack_sha256)}… (missing spec zip sha)` };
  }

  if (metaSpecZipSha === lockedZipSha) {
    return { tri: "pass", detail: `Matches locked Spec Pack zip sha ${shortSha(lockedZipSha)}…` };
  }

  return { tri: "warn", detail: `Out of date: locked spec zip sha ${shortSha(lockedZipSha)}… vs blueprint spec zip sha ${shortSha(metaSpecZipSha)}…` };
}

function computeNextPhase(done: Set<string>): DirectorPhaseId | null {
  for (const ph of DIRECTOR_PHASES) {
    if (!directorPhaseDone(ph.id, done)) return ph.id;
  }
  return null;
}

function safeProjectName(projectId: string): string {
  try {
    return loadProjectStateById(projectId)?.project?.name || projectId;
  } catch {
    return projectId;
  }
}

function buildAction(model: StatusModel): { label: string; href: string; kind: "primary" | "default" }[] {
  const actions: { label: string; href: string; kind: "primary" | "default" }[] = [];

  if (model.build.nextPhase) {
    actions.push({ label: "Continue build", href: `/director/build?phase=${model.build.nextPhase}`, kind: "primary" });
    return actions;
  }

  const directorOptionsPending = model.intent.proposalsCount > 0 && !model.intent.selectedProposalId;
  if (directorOptionsPending) {
    actions.push({ label: "Review brief options", href: "/director/brief", kind: "primary" });
    actions.push({ label: "Review proposals", href: "/director/proposals", kind: "default" });
    return actions;
  }

  if (!model.coherence.lastSha) {
    actions.push({ label: "Run coherence check", href: "/director/coherence", kind: "primary" });
    actions.push({ label: "Continue brief", href: "/director/brief", kind: "default" });
    return actions;
  }

  if (!model.interrogator.lastSha) {
    actions.push({ label: "Run interrogator", href: "/director/interrogator", kind: "primary" });
    actions.push({ label: "View coherence check", href: "/director/coherence", kind: "default" });
    return actions;
  }

  if (!model.preview.lastPackSha) {
    actions.push({ label: "Generate preview", href: "/director/preview", kind: "primary" });
    actions.push({ label: "Review proposals", href: "/director/proposals", kind: "default" });
    return actions;
  }

  if (!model.spec.locked) {
    actions.push({ label: "Adopt + lock Spec Pack", href: "/workbench", kind: "primary" });
    actions.push({ label: "Review proposals", href: "/director/proposals", kind: "default" });
    return actions;
  }

  if (model.spec.locked && model.blueprint.tri !== "pass") {
    actions.push({ label: "Compile blueprint", href: "/director/ship", kind: "primary" });
    actions.push({ label: "Preview (hashes)", href: "/director/preview", kind: "default" });
    return actions;
  }

  if (model.repo.baseMeta && !model.repo.locked) {
    actions.push({ label: "Adopt + lock Repo Pack", href: "/repo-workbench", kind: "primary" });
    actions.push({ label: "Ship & proof", href: "/director/ship", kind: "default" });
    return actions;
  }

  if (model.spec.locked && !model.repo.proposalMeta && !model.repo.baseMeta) {
    actions.push({ label: "Compile repo pack", href: "/director/ship", kind: "primary" });
    actions.push({ label: "Ship & proof", href: "/director/ship", kind: "default" });
    return actions;
  }

  const proposalsPending =
    model.spec.proposalPresent || model.spec.savedProposals > 0 || Boolean(model.repo.proposalMeta);
  if (proposalsPending) {
    actions.push({ label: "Review proposals", href: "/director/proposals", kind: "primary" });
    actions.push({ label: "Open workbench", href: "/workbench", kind: "default" });
    return actions;
  }

  if (!model.verify.latest) {
    actions.push({ label: "Run verify", href: "/verify", kind: "primary" });
    actions.push({ label: "Ship & proof", href: "/director/ship", kind: "default" });
    return actions;
  }

  if (model.verify.tri === "fail") {
    actions.push({ label: "Fix verify failures", href: "/verify", kind: "primary" });
    actions.push({ label: "Ship & proof", href: "/director/ship", kind: "default" });
    return actions;
  }

  if (!model.backup.history) {
    actions.push({ label: "Export backup", href: "/backup", kind: "primary" });
    actions.push({ label: "Release checklist", href: "/release-checklist", kind: "default" });
    return actions;
  }

  actions.push({ label: "Release checklist", href: "/release-checklist", kind: "primary" });
  actions.push({ label: "Ship & proof", href: "/director/ship", kind: "default" });
  return actions;
}

function overallTri(model: StatusModel): { tri: Tri; label: string } {
  if (model.verify.tri === "fail") return { tri: "fail", label: "BLOCKED" };
  if (model.build.nextPhase) return { tri: "warn", label: "IN PROGRESS" };

  if (model.intent.proposalsCount > 0 && !model.intent.selectedProposalId) return { tri: "warn", label: "NEEDS REVIEW" };

  if (!model.coherence.lastSha) return { tri: "warn", label: "NEEDS COHERENCE" };
  if (!model.interrogator.lastSha) return { tri: "warn", label: "NEEDS INTERROGATOR" };
  if (!model.preview.lastPackSha) return { tri: "warn", label: "NEEDS PREVIEW" };

  const proposalsPending = model.spec.proposalPresent || model.spec.savedProposals > 0 || Boolean(model.repo.proposalMeta);
  if (proposalsPending) return { tri: "warn", label: "NEEDS REVIEW" };

  // Ready-to-ship gate: require locked Spec + compiled Blueprint + locked Repo Pack (with bytes present)
  // before asking for proof or backups.
  if (!model.spec.locked) return { tri: "warn", label: "NEEDS LOCK" };
  if (model.blueprint.tri !== "pass") return { tri: "warn", label: "NEEDS BLUEPRINT" };

  if (model.repo.locked && !model.repo.lockedBytesPresent) {
    return { tri: "fail", label: "BROKEN REPO LOCK" };
  }
  if (!model.repo.locked) return { tri: "warn", label: "NEEDS REPO LOCK" };

  if (!model.verify.latest) return { tri: "warn", label: "NEEDS PROOF" };
  if (!model.backup.history) return { tri: "warn", label: "NEEDS BACKUP" };

  if (model.verify.tri === "warn") return { tri: "warn", label: "READY TO SHIP (WARN)" };
  return { tri: "pass", label: "READY TO SHIP" };
}

function StatusRow(props: { label: string; tri: Tri; detail: React.ReactNode; href?: string }) {
  const { label, tri, detail, href } = props;
  const pk = pillKind(tri);
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 14 }}>
      <div style={{ minWidth: 200 }}>
        <strong>{label}</strong>
        <div className="small" style={{ marginTop: 4 }}>
          {detail}
        </div>
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <span className={["pill", `pill--${pk}`].join(" ")}>{tri.toUpperCase()}</span>
        {href ? (
          <a className="btn" href={href} style={{ marginLeft: 10 }}>
            Open
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function DirectorProjectStatus() {
  const [model, setModel] = useState<StatusModel | null>(null);
  const [status, setStatus] = useState<string>("");

  async function refresh() {
    setStatus("Refreshing…");
    let projectId = "";
    try {
      projectId = getCurrentProjectId();
    } catch {
      projectId = "";
    }

    if (!projectId) {
      setModel(null);
      setStatus("No project selected.");
      return;
    }

    const projectName = safeProjectName(projectId);

    let st: any = null;
    let done = new Set<string>();
    try {
      st = loadProjectStateById(projectId);
      done = st ? deriveDoneSteps(st) : new Set<string>();
    } catch {
      st = null;
      done = new Set<string>();
    }

    const intentProposalsCount = Array.isArray(st?.director?.intent_proposals) ? st.director.intent_proposals.length : 0;
    const selectedIntentProposalId = typeof st?.director?.selected_intent_proposal_id === "string" ? st.director.selected_intent_proposal_id : undefined;
    const lastIntentPackSha = typeof st?.director?.last_intent_pack_sha256 === "string" ? st.director.last_intent_pack_sha256 : undefined;
    const lastSddlSeedSha = typeof st?.director?.last_spel_seed_sha256 === "string" ? (st as any).director.last_spel_seed_sha256 : undefined;

    const lastInterrogatorSha = typeof (st as any)?.director?.last_interrogator_answers_sha256 === "string" ? (st as any).director.last_interrogator_answers_sha256 : undefined;
    const lastInterrogatorAt = typeof (st as any)?.director?.last_interrogator_answers_generated_at_utc === "string" ? (st as any).director.last_interrogator_answers_generated_at_utc : undefined;
    const lastPreviewPackSha = typeof (st as any)?.director?.last_preview_pack_sha256 === "string" ? (st as any).director.last_preview_pack_sha256 : undefined;
    const lastPreviewAt = typeof (st as any)?.director?.last_preview_pack_generated_at_utc === "string" ? (st as any).director.last_preview_pack_generated_at_utc : undefined;
    const lastCoherenceSha = typeof (st as any)?.director?.last_coherence_report_sha256 === "string" ? (st as any).director.last_coherence_report_sha256 : undefined;
    const lastCoherenceAt = typeof (st as any)?.director?.last_coherence_report_generated_at_utc === "string" ? (st as any).director.last_coherence_report_generated_at_utc : undefined;

    const nextPhase = computeNextPhase(done);
    const reviewDone = directorPhaseDone("review", done);

    const baseKey = lastBasePackKeyForProject(projectId);
    const propKey = lastProposalPackKeyForProject(projectId);

    const basePresent = Boolean(readLS(baseKey) || readLS(LEGACY_LAST_BASE_PACK_KEY));
    const proposalPresent = Boolean(readLS(propKey) || readLS(LEGACY_LAST_PROPOSAL_PACK_KEY));

    const specGov = getPackGovernance(projectId);
    const specLocked = isPackLocked(projectId);

    const specLockAt = specGov?.last_locked?.locked_at_utc;
    const specLockSha = specGov?.last_locked?.pack_sha256;

    const repoGov = getRepoPackGovernance(projectId);
    const repoLocked = isRepoPackLocked(projectId);
    const repoLockAt = repoGov?.last_locked?.locked_at_utc;
    const repoLockSha = repoGov?.last_locked?.pack_sha256;

    const repoBaseMeta = getRepoWorkbenchPackMeta(projectId, "base");
    const repoProposalMeta = getRepoWorkbenchPackMeta(projectId, "proposal");

    let lockedBytesPresent = false;
    try {
      const lockedBytes = await getLockedRepoPackBytes(projectId);
      lockedBytesPresent = Boolean(lockedBytes && lockedBytes.length > 0);
    } catch {
      lockedBytesPresent = false;
    }

    let snapshotsCount = 0;
    try {
      snapshotsCount = listSnapshots(projectId).length;
    } catch {
      snapshotsCount = 0;
    }

    const verifyLatest = getLatestVerifyReport(projectId);
    const verifyTri = triFromVerify(verifyLatest);

    const backupHistory = getBackupHistory(projectId);

    // Blueprint Pack status (stored in IndexedDB + small LS meta).
    const bpMeta = getBlueprintPackMeta(projectId);
    const bp = triFromBlueprint(bpMeta, specGov);
    const bpTri: Tri = bp.tri;
    const bpNote = bp.detail;

    const dogfood = getDogfoodReport(projectId);

    const savedProps = countProjectProposals(projectId);

    const totalCount = DIRECTOR_PHASES.length;
    const doneCount = DIRECTOR_PHASES.filter((ph) => directorPhaseDone(ph.id, done)).length;

    const next: StatusModel = {
      coherence: { lastSha: lastCoherenceSha, lastGeneratedAt: lastCoherenceAt },
      interrogator: { lastSha: lastInterrogatorSha, lastGeneratedAt: lastInterrogatorAt },
      preview: { lastPackSha: lastPreviewPackSha, lastGeneratedAt: lastPreviewAt },
      projectId,
      projectName,
      build: {
        doneCount,
        totalCount,
        nextPhase,
        reviewDone,
      },
      intent: {
        proposalsCount: intentProposalsCount,
        selectedProposalId: selectedIntentProposalId,
        lastIntentPackSha,
        lastSddlSeedSha,
      },
      spec: {
        locked: specLocked,
        basePresent,
        proposalPresent,
        savedProposals: savedProps,
        lockAt: specLockAt,
        lockSha: specLockSha,
      },
      repo: {
        featureEnabled: true,
        locked: repoLocked,
        baseMeta: repoBaseMeta,
        proposalMeta: repoProposalMeta,
        lockedBytesPresent,
        lockAt: repoLockAt,
        lockSha: repoLockSha,
      },

      blueprint: {
        meta: bpMeta,
        tri: bpTri,
        note: bpNote,
      },
      verify: {
        latest: verifyLatest,
        tri: verifyTri,
      },
      backup: {
        history: backupHistory,
      },
      dogfood: {
        report: dogfood,
      },
      snapshots: {
        count: snapshotsCount,
      },
    };

    setModel(next);
    setStatus("");
  }

  useEffect(() => {
    void refresh();

    const handler = () => void refresh();
    window.addEventListener("kindred_project_changed", handler);
    window.addEventListener("kindred_state_changed", handler);
    window.addEventListener("kindred_governance_changed", handler);
    window.addEventListener("kindred_repo_workbench_changed", handler);
    window.addEventListener("kindred_repo_governance_changed", handler);
    window.addEventListener("kindred_repo_governance_bytes_changed", handler);
    window.addEventListener("kindred_blueprint_pack_changed", handler);
    window.addEventListener("kindred_verify_reports_changed", handler);
    window.addEventListener("kindred_backup_history_changed", handler);
    window.addEventListener("storage", handler);

    return () => {
      window.removeEventListener("kindred_project_changed", handler);
      window.removeEventListener("kindred_state_changed", handler);
      window.removeEventListener("kindred_governance_changed", handler);
      window.removeEventListener("kindred_repo_workbench_changed", handler);
      window.removeEventListener("kindred_repo_governance_changed", handler);
      window.removeEventListener("kindred_repo_governance_bytes_changed", handler);
      window.removeEventListener("kindred_blueprint_pack_changed", handler);
      window.removeEventListener("kindred_verify_reports_changed", handler);
      window.removeEventListener("kindred_backup_history_changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const top = useMemo(() => {
    if (!model) return null;
    return overallTri(model);
  }, [model]);

  const actions = useMemo(() => {
    if (!model) return [];
    return buildAction(model);
  }, [model]);

  return (
    <Panel title="Project status (Ready to ship gate)">
      {!model ? (
        <div>
          <p className="small">No project selected.</p>
          {status ? <p className="small">{status}</p> : null}
        </div>
      ) : (
        <div>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <strong>{model.projectName}</strong>
              <div className="small">Project ID: <code>{model.projectId}</code></div>
            </div>
            {top ? (
              <span className={["pill", `pill--${pillKind(top.tri)}`].join(" ")}>{top.label}</span>
            ) : null}
          </div>

          {top && top.tri === "pass" ? (
            <div style={{ marginTop: 12 }}>
              <Callout
                kind="success"
                title="READY TO SHIP"
                details={[
                  "You can leave this chat and build from the site now.",
                  "Next: Ship → export the Repo Pack, then follow the Release checklist for deployment.",
                ]}
              />
            </div>
          ) : null}

          {actions.length ? (
            <div className="row" style={{ marginTop: 12 }}>
              {actions.map((a, i) => (
                <a key={i} className={a.kind === "primary" ? "btn primary" : "btn"} href={a.href}>
                  {a.label}
                </a>
              ))}
            </div>
          ) : null}

          {status ? <p className="small" style={{ marginTop: 10 }}>{status}</p> : null}

          <div className="hr" />

          <StatusRow
            label="Build progress"
            tri={model.build.nextPhase ? "warn" : "pass"}
            href={model.build.nextPhase ? `/director/build?phase=${model.build.nextPhase}` : "/director/build?phase=review"}
            detail={
              <span>
                {model.build.doneCount}/{model.build.totalCount} phases done
                {model.build.nextPhase ? (
                  <span> • Next: <strong>{DIRECTOR_PHASES.find((p) => p.id === model.build.nextPhase)?.label || model.build.nextPhase}</strong></span>
                ) : (
                  <span> • All phases complete</span>
                )}
              </span>
            }
          />

          <div className="hr" />

          <StatusRow
            label="Director Brief"
            tri={model.intent.proposalsCount > 0 && !model.intent.selectedProposalId ? "warn" : "pass"}
            href="/director/brief"
            detail={
              <span>
                Options={model.intent.proposalsCount}
                {model.intent.selectedProposalId ? <span> • selected={model.intent.selectedProposalId}</span> : null}
                {model.intent.lastIntentPackSha ? <span> • last intent pack sha {shortSha(model.intent.lastIntentPackSha)}…</span> : null}
              </span>
            }
          />

          <StatusRow
            label="Spec Pack"
            tri={model.verify.tri === "fail" ? "fail" : model.spec.locked ? "pass" : model.spec.basePresent ? "warn" : "warn"}
            href="/workbench"
            detail={
              <span>
                Base={model.spec.basePresent ? "present" : "missing"}, Proposal slot={model.spec.proposalPresent ? "present" : "empty"}, Saved proposals={model.spec.savedProposals}
                {model.spec.locked ? (
                  <span> • LOCKED {model.spec.lockAt ? `(${model.spec.lockAt})` : ""}</span>
                ) : (
                  <span> • unlocked</span>
                )}
                {model.spec.lockSha ? (
                  <span> • lock sha {shortSha(model.spec.lockSha)}…</span>
                ) : null}
              </span>
            }
          />

          <div className="hr" />

          <StatusRow
            label="Blueprint Pack"
            tri={model.blueprint.tri}
            href="/director/ship"
            detail={<span>{model.blueprint.note}</span>}
          />

          <div className="hr" />

          <StatusRow
            label="Repo Pack"
            tri={
              model.verify.tri === "fail"
                ? "fail"
                : model.repo.locked
                ? "pass"
                : model.repo.baseMeta
                ? "warn"
                : "warn"
            }
            href="/repo-workbench"
            detail={
              <span>
                Base={model.repo.baseMeta ? `${model.repo.baseMeta.name} (${model.repo.baseMeta.file_count || 0} files)` : "missing"}, Proposal={model.repo.proposalMeta ? `${model.repo.proposalMeta.name}` : "empty"}
                {model.repo.locked ? (
                  <span> • LOCKED {model.repo.lockAt ? `(${model.repo.lockAt})` : ""}</span>
                ) : (
                  <span> • unlocked</span>
                )}
                {model.repo.locked && !model.repo.lockedBytesPresent ? <span> • <strong>missing locked bytes</strong></span> : null}
                {model.repo.lockSha ? <span> • lock sha {shortSha(model.repo.lockSha)}…</span> : null}
              </span>
            }
          />

          <div className="hr" />

          <StatusRow
            label="Verify"
            tri={model.verify.tri}
            href="/verify"
            detail={
              <span>
                {model.verify.latest ? (
                  <>Latest: {model.verify.latest.captured_at_utc} • overall={String(model.verify.latest.overall || "").toUpperCase()}</>
                ) : (
                  <>No verify report uploaded yet.</>
                )}
              </span>
            }
          />

          <div className="hr" />

          <StatusRow
            label="Backup"
            tri={model.backup.history ? "pass" : "warn"}
            href="/backup"
            detail={
              <span>
                {model.backup.history ? (
                  <>Last backup: {model.backup.history.last_backup_at_utc} • sha {shortSha(model.backup.history.backup_zip_sha256)}…</>
                ) : (
                  <>No backup exported yet for this project on this device.</>
                )}
              </span>
            }
          />

          <div className="hr" />

          <div className="row" style={{ justifyContent: "space-between", gap: 14, alignItems: "baseline" }}>
            <div style={{ minWidth: 200 }}>
              <strong>Evidence</strong>
              <div className="small" style={{ marginTop: 4 }}>
                Snapshots: {model.snapshots.count} • Coherence: {model.coherence.lastSha ? shortSha(model.coherence.lastSha) + "…" : "not run"} • Interrogator: {model.interrogator.lastSha ? shortSha(model.interrogator.lastSha) + "…" : "not run"} • Preview: {model.preview.lastPackSha ? shortSha(model.preview.lastPackSha) + "…" : "not generated"} • Dogfood: • SPEL seed: {model.intent.lastSddlSeedSha ? shortSha(model.intent.lastSddlSeedSha) + "…" : "not exported"} {model.dogfood.report ? (model.dogfood.report.overall?.summary || "present") : "not captured"}
              </div>
            </div>
            <div className="row" style={{ alignItems: "center" }}>
              <a className="btn" href="/dogfood">
                Dogfood
              </a>
              <a className="btn" href="/workbench">
                Snapshots
              </a>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
