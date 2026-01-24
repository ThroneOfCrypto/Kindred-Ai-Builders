"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readAdvancedMode, ADVANCED_MODE_EVENT } from "../../../lib/advanced_mode";
import { readGuidedMode, GUIDED_MODE_EVENT } from "../../../lib/guided_mode";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { LocalNetworkAccessHelp, isLikelyLocalNetworkAccessBlock } from "../_components/local_network_access_help";
import { PrimaryButton, SecondaryButton } from "../../../components/Buttons";
import { FailureCapture } from "../../../components/FailureCapture";
import { EvidencePanel } from "../../../components/EvidencePanel";
import { PublishReadyStatusPanel } from "../../../components/PublishReadyStatusPanel";
import { DeployLaneFitIndicator } from "../../../components/DeployLaneFitIndicator";
import { SelfCheckPanel } from "../../../components/SelfCheckPanel";

import { getCurrentProjectId, loadProjectStateById, saveProjectStateById } from "../../../lib/state";
import { compileRepoPackFromDirectorState } from "../../../lib/repo_pack_compiler";
import { compileBlueprintPackFromState } from "../../../lib/blueprint_pack";
import { setLatestBlueprintPack, getBlueprintPackMeta, type BlueprintPackStoreMetaV1 } from "../../../lib/blueprint_pack_store";
import {
  getLockedRepoPackBytes,
  getRepoWorkbenchPackBytes,
  getRepoWorkbenchPackMeta,
  setRepoWorkbenchPackBytes,
} from "../../../lib/repo_pack_bytes_store";
import { readRepoPackZip } from "../../../lib/repo_pack_io";

import { getPackGovernance, isPackLocked } from "../../../lib/pack_governance";
import { getRepoPackGovernance, isRepoPackLocked } from "../../../lib/repo_pack_governance";
import { getLatestVerifyReport, type VerifyReport } from "../../../lib/verify";
import { getBackupHistory, type BackupHistoryV1 } from "../../../lib/backup_history";
import { getRigorConfig, setRigorLevel, type RigorLevelV1 } from "../../../lib/rigor";
import { buildPublishReadyProofBundleZip } from "../../../lib/publish_ready_bundle";
import { loadDeployWizardStateV1, buildDeploymentPackZipV1 } from "../../../lib/deploy_wizard";
import { buildOneMoveDeployBundleZipV1 } from "../../../lib/one_move_bundle";
import { gpClear, gpExport, gpRecord } from "../../../lib/golden_path_recorder";
import { APP_VERSION } from "../../../lib/version";
import { stableJsonText } from "../../../lib/stable_json";
import { appendEvidenceCard } from "../../../lib/evidence_ledger";
import { buildProjectBackupZip, restoreProjectBackupZip } from "../../../lib/project_backup";
import { sha256Hex } from "../../../lib/hash";
import { buildSpecPack } from "../../../lib/export_pack";
import { readZip } from "../../../lib/spec_pack";
import { validateSpecPack } from "../../../lib/validation";
import { demoDeterministicState } from "../../../lib/demo_state";

function normalizeRepoName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return { ok: false, reason: "Enter a repo name." };
  let name = s
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+/, "")
    .replace(/[-_.]+$/, "");
  if (!name) return { ok: false, reason: "Repo name must contain letters or numbers." };
  if (name.length > 100) name = name.slice(0, 100).replace(/[-_.]+$/, "");
  return { ok: true, name };
}

function safeFileName(s: string): string {
  const x = String(s || "")
    .trim()
    .replace(/[^a-z0-9\- _]+/gi, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return x || "repo_pack";
}

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}

function shortSha(s: string | null | undefined): string {
  const x = String(s || "").trim();
  if (!x) return "";
  return x.length <= 12 ? x : x.slice(0, 12);
}

function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function shipPackBasisHashFromParts(parts: any): string {
  const s = stableJsonText(parts, 0);
  return `s_${fnv1a32Hex(s)}`;
}

function summarizeShipPackBasisFromParts(parts: {
  goal: string;
  sector?: string | null;
  seriousness: string;
  creative_push: string;
  inspiration_count: number;
  tags_count: number;
  taste_confidence: string;
  taste_locked: boolean;
  style_locked: boolean;
  selected_proposal_id: string;
  selected_proposal_name?: string;
  ai_brand_id?: string | null;
  ai_model_id?: string | null;
}): any {
  const h: string[] = [];
  if (parts.selected_proposal_name) h.push(`Choice: ${parts.selected_proposal_name}`);
  h.push(`Inspiration: ${parts.inspiration_count}`);
  h.push(`Tags: ${parts.tags_count}`);
  if (parts.taste_locked) h.push("Taste locked");
  if (parts.style_locked) h.push("Style locked");
  return {
    ...parts,
    highlights: h.slice(0, 7),
  };
}

function diffShipPackBasisSummary(prev: any | undefined, now: any): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const push = (label: string, a: any, b: any) => {
    if (a === b) return;
    out.push(`${label}: ${String(a)} → ${String(b)}`);
  };
  push("Goal", prev.goal, now.goal);
  push("Sector", prev.sector || "(none)", now.sector || "(none)");
  push("Seriousness", prev.seriousness, now.seriousness);
  push("Creativity", prev.creative_push, now.creative_push);
  push("Chosen option", prev.selected_proposal_name || prev.selected_proposal_id, now.selected_proposal_name || now.selected_proposal_id);
  push("Inspiration items", prev.inspiration_count, now.inspiration_count);
  push("Tags", prev.tags_count, now.tags_count);
  push("Taste confidence", prev.taste_confidence, now.taste_confidence);
  push("Taste locked", prev.taste_locked ? "Yes" : "No", now.taste_locked ? "Yes" : "No");
  push("Style locked", prev.style_locked ? "Yes" : "No", now.style_locked ? "Yes" : "No");
  push("AI brand", prev.ai_brand_id || "(none)", now.ai_brand_id || "(none)");
  push("AI model", prev.ai_model_id || "auto", now.ai_model_id || "auto");
  return out.slice(0, 10);
}

type Tri = "pass" | "warn" | "fail";

type Notice =
  | { kind: "info" | "success" | "warn" | "error"; title: string; details?: string[] }
  | null;

function triFromVerify(report: VerifyReport | null): Tri {
  if (!report) return "warn";
  const overall = String(report.overall || "").toLowerCase();
  if (overall === "fail") return "fail";
  if (overall === "warn") return "warn";
  if (overall === "pass") return "pass";
  return "warn";
}

function GateRow(props: {
  label: string;
  tri: Tri;
  detail: string;
  primary?: { label: string; href?: string; onClick?: () => void; disabled?: boolean };
  secondary?: { label: string; href?: string; onClick?: () => void; disabled?: boolean };
}) {
  const { label, tri, detail, primary, secondary } = props;
  const pillClass = tri === "pass" ? "pill--success" : tri === "warn" ? "pill--warn" : "pill--error";
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 14, padding: "10px 0" }}>
      <div style={{ minWidth: 220 }}>
        <strong>{label}</strong>
        <div className="small" style={{ marginTop: 4 }}>
          {detail}
        </div>
      </div>
      <div className="row" style={{ alignItems: "center", gap: 10 }}>
        <span className={["pill", pillClass].join(" ")}>{tri.toUpperCase()}</span>
        {secondary ? (
          <SecondaryButton href={secondary.href} onClick={secondary.onClick} disabled={secondary.disabled}>
            {secondary.label}
          </SecondaryButton>
        ) : null}
        {primary ? (
          <PrimaryButton href={primary.href} onClick={primary.onClick} disabled={primary.disabled}>
            {primary.label}
          </PrimaryButton>
        ) : null}
      </div>
    </div>
  );
}

export default function DirectorShipPage() {
  const [projectId, setProjectId] = useState<string>(() => {
    try {
      return getCurrentProjectId();
    } catch {
      return "";
    }
  });

  const pid = projectId || "default";

  useEffect(() => {
    const onChange = () => {
      try {
        setProjectId(getCurrentProjectId());
      } catch {
        setProjectId("");
      }
    };
    window.addEventListener("kindred_project_changed", onChange);
    return () => window.removeEventListener("kindred_project_changed", onChange);
  }, []);

  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<boolean>(false);

  // Director-safe Ship surface (default): simple downloads + GitHub export via local connector.
  const [simpleMsg, setSimpleMsg] = useState<string>("");
  const [simpleBusy, setSimpleBusy] = useState<boolean>(false);
  const [simpleRepoName, setSimpleRepoName] = useState<string>("kindred-ship-pack");
  const [simpleExportToken, setSimpleExportToken] = useState<string>("");
  const [simpleLockToken, setSimpleLockToken] = useState<string>("");
  const [simpleDraftAck, setSimpleDraftAck] = useState<boolean>(false);
  const [simpleRepoUrl, setSimpleRepoUrl] = useState<string>("");
  const [simpleCommitUrl, setSimpleCommitUrl] = useState<string>("");
  const [simpleCommitSha, setSimpleCommitSha] = useState<string>("");
  const [simpleRemoteVerified, setSimpleRemoteVerified] = useState<boolean | null>(null);
  const [simpleRemoteHeadSha, setSimpleRemoteHeadSha] = useState<string>("");
  const [simpleRemoteVerifyError, setSimpleRemoteVerifyError] = useState<string>("");

  const showLnaSimpleHelp = useMemo(() => isLikelyLocalNetworkAccessBlock(simpleMsg), [simpleMsg]);

  const [lastRepoPackSha, setLastRepoPackSha] = useState<string>("");
  const [lastRepoPackBytes, setLastRepoPackBytes] = useState<Uint8Array | null>(null);
  const [lastRepoName, setLastRepoName] = useState<string>("");

  const [lastBlueprintSha, setLastBlueprintSha] = useState<string>("");
  const [lastBlueprintSpecSha, setLastBlueprintSpecSha] = useState<string>("");
  const [lastBlueprintJson, setLastBlueprintJson] = useState<string>("");

  const [gateTick, setGateTick] = useState<number>(0);
  useEffect(() => {
    const bump = () => setGateTick((x) => x + 1);
    window.addEventListener("kindred_governance_changed", bump);
    window.addEventListener("kindred_repo_governance_changed", bump);
    window.addEventListener("kindred_repo_governance_bytes_changed", bump);
    window.addEventListener("kindred_blueprint_pack_changed", bump);
    window.addEventListener("kindred_repo_workbench_changed", bump);
    window.addEventListener("kindred_verify_reports_changed", bump);
    window.addEventListener("kindred_backup_history_changed", bump);
    window.addEventListener("kindred_state_changed", bump);
    return () => {
      window.removeEventListener("kindred_governance_changed", bump);
      window.removeEventListener("kindred_repo_governance_changed", bump);
      window.removeEventListener("kindred_repo_governance_bytes_changed", bump);
      window.removeEventListener("kindred_blueprint_pack_changed", bump);
      window.removeEventListener("kindred_repo_workbench_changed", bump);
      window.removeEventListener("kindred_verify_reports_changed", bump);
      window.removeEventListener("kindred_backup_history_changed", bump);
      window.removeEventListener("kindred_state_changed", bump);
    };
  }, []);

  const [rigor, setRigor] = useState<RigorLevelV1>("safe");
  useEffect(() => {
    const refresh = () => {
      try {
        const cfg = getRigorConfig(pid);
        setRigor(cfg.level);
      } catch {
        setRigor("safe");
      }
    };
    refresh();
    const bump = () => refresh();
    window.addEventListener("kindred_rigor_changed", bump);
    return () => window.removeEventListener("kindred_rigor_changed", bump);
  }, [pid]);

  const [guided, setGuided] = useState<boolean>(true);
  useEffect(() => {
    const refresh = () => {
      try {
        setGuided(readGuidedMode());
      } catch {
        setGuided(true);
      }
    };
    refresh();
    const on = () => refresh();
    window.addEventListener(GUIDED_MODE_EVENT, on as any);
    return () => window.removeEventListener(GUIDED_MODE_EVENT, on as any);
  }, []);

  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const effectiveGuided = guided || !advancedMode;
  useEffect(() => {
    const refresh = () => {
      try {
        setAdvancedMode(Boolean(readAdvancedMode()));
      } catch {
        setAdvancedMode(false);
      }
    };
    refresh();
    const on = () => refresh();
    window.addEventListener(ADVANCED_MODE_EVENT as any, on as any);
    return () => window.removeEventListener(ADVANCED_MODE_EVENT as any, on as any);
  }, []);


  const state = useMemo(() => {
    try {
      return loadProjectStateById(pid);
    } catch {
      return null;
    }
  }, [pid, gateTick]);

  const adopted = useMemo(() => {
    const libs = ((state as any)?.director?.libraries_v1?.adopted_library_ids || []) as string[];
    const pats = ((state as any)?.director?.patterns_v1?.adopted_pattern_ids || []) as string[];
    const kits = ((state as any)?.director?.kits_v1?.adopted_kit_ids || []) as string[];
    return { libs, pats, kits };
  }, [state]);

  function persistDirectorMeta(patch: any) {
    if (!state) return;
    const merged: any = {
      ...state,
      director: {
        ...(state as any).director,
        schema: "kindred.director_state.v1",
        ...patch,
      },
    };
    saveProjectStateById(pid, merged);
    try {
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  }

  async function downloadPublishReadyProofBundle() {
    if (!pid) return;
    const projectName = safeFileName(String((state as any)?.project?.name || pid));
    const dateTag = new Date().toISOString().slice(0, 10);

    setBusy(true);
    setNotice({ kind: "info", title: "Building publish-ready proof bundle…" });
    try {
      const r = await buildPublishReadyProofBundleZip(pid);
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error, details: r.details });
        return;
      }

      downloadBytes(`publish_ready_bundle__${projectName}__${dateTag}.zip`, r.zipBytes, "application/zip");
      setNotice({
        kind: r.meta.overall === "pass" ? "success" : r.meta.overall === "warn" ? "warn" : "error",
        title: "Proof bundle downloaded",
        details: [
          `overall: ${String(r.meta.overall).toUpperCase()}`,
          `included_paths: ${r.meta.included_paths.length}`,
          "Bundle includes dist reports + packs + evidence + per-file sha256 manifest.",
        ],
      });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Failed to build proof bundle", details: [String(e?.message || e || "unknown error")] });
    } finally {
      setBusy(false);
    }
  }

  async function compileBlueprintPackProposal() {
    if (!state) {
      setNotice({ kind: "error", title: "Project state unavailable" });
      return;
    }

    setBusy(true);
    setNotice({ kind: "info", title: "Compiling deterministic Blueprint Pack…" });
    setLastBlueprintSha("");
    setLastBlueprintSpecSha("");
    setLastBlueprintJson("");

    try {
      const r = await compileBlueprintPackFromState({ state });
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error.message, details: r.error.details.slice(0, 40) });
        return;
      }

      setLastBlueprintSha(r.blueprint_pack_sha256);
      setLastBlueprintSpecSha(r.spec_pack_sha256);
      setLastBlueprintJson(r.jsonText);

      try {
        await setLatestBlueprintPack({
          project_id: pid,
          jsonText: r.jsonText,
          blueprint_pack_sha256: r.blueprint_pack_sha256,
          spec_pack_sha256: r.spec_pack_sha256,
          generated_at_utc: new Date().toISOString(),
        });
      } catch {
        // ignore
      }

      persistDirectorMeta({
        last_blueprint_pack_sha256: r.blueprint_pack_sha256,
        last_blueprint_pack_spec_pack_sha256: r.spec_pack_sha256,
        last_blueprint_pack_generated_at_utc: new Date().toISOString(),
      });

      setNotice({
        kind: "success",
        title: "Blueprint Pack compiled",
        details: [
          `blueprint_pack_sha256: ${r.blueprint_pack_sha256}`,
          `spec_pack_sha256: ${r.spec_pack_sha256}`,
          "This will be embedded into Repo Packs as .kindred/blueprint_pack/blueprint_pack.v1.json.",
        ],
      });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Compile failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  async function compileRepoPackProposal() {
    if (!state) {
      setNotice({ kind: "error", title: "Project state unavailable" });
      return;
    }

    setBusy(true);
    setNotice({ kind: "info", title: "Compiling deterministic Repo Pack proposal…" });
    setLastRepoPackSha("");
    setLastRepoPackBytes(null);
    setLastRepoName("");

    try {
      const r = await compileRepoPackFromDirectorState({ state, include_council_dsl: readAdvancedMode() });
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error.message, details: r.error.details.slice(0, 40) });
        return;
      }

      const repoName = r.report.repo_name;
      setLastRepoName(repoName);
      setLastRepoPackSha(r.pack.pack_sha256);
      setLastRepoPackBytes(r.zipBytes);

      // Seed workbench base from locked snapshot if available (gives a meaningful diff).
      try {
        const baseExisting = await getRepoWorkbenchPackBytes(pid, "base");
        if (!baseExisting) {
          const lockedBytes = await getLockedRepoPackBytes(pid);
          if (lockedBytes) {
            const parsed = await readRepoPackZip(lockedBytes);
            if (parsed.ok) {
              await setRepoWorkbenchPackBytes(pid, "base", lockedBytes, {
                name: "locked_base.zip",
                repo_id: parsed.pack.manifest.repo_id,
                pack_sha256: parsed.pack.pack_sha256,
                total_bytes: parsed.pack.manifest.totals.total_bytes,
                file_count: parsed.pack.manifest.totals.file_count,
              });
            } else {
              await setRepoWorkbenchPackBytes(pid, "base", lockedBytes, { name: "locked_base.zip" });
            }
          }
        }
      } catch {
        // ignore
      }

      await setRepoWorkbenchPackBytes(pid, "proposal", r.zipBytes, {
        name: `repo_pack_${safeFileName(repoName)}.zip`,
        repo_id: r.pack.manifest.repo_id,
        pack_sha256: r.pack.pack_sha256,
        total_bytes: r.pack.manifest.totals.total_bytes,
        file_count: r.pack.manifest.totals.file_count,
      });

      setNotice({
        kind: "success",
        title: "Repo Pack proposal compiled",
        details: [
          `pack_sha256: ${r.pack.pack_sha256}`,
          `files: ${r.pack.manifest.totals.file_count}, bytes: ${r.pack.manifest.totals.total_bytes}`,
          "Saved to Repo Workbench as Proposal.",
        ],
      });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Compile failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  const specGov = useMemo(() => getPackGovernance(pid), [pid, gateTick]);
  const specLocked = useMemo(() => isPackLocked(pid), [pid, gateTick]);
  const lockedSpecZipSha = String(specGov?.last_locked?.provenance?.locked_zip_sha256 || "").trim();

  const bpMeta: BlueprintPackStoreMetaV1 | null = useMemo(() => getBlueprintPackMeta(pid), [pid, gateTick]);
  const bpSpecZipSha = String(bpMeta?.spec_pack_sha256 || "").trim();

  const blueprintTri: Tri = useMemo(() => {
    if (!bpMeta) return "warn";
    if (!specLocked) return "warn";
    if (!lockedSpecZipSha || !bpSpecZipSha) return "warn";
    return bpSpecZipSha === lockedSpecZipSha ? "pass" : "warn";
  }, [bpMeta, specLocked, lockedSpecZipSha, bpSpecZipSha]);

  const repoGov = useMemo(() => getRepoPackGovernance(pid), [pid, gateTick]);
  const repoLocked = useMemo(() => isRepoPackLocked(pid), [pid, gateTick]);
  const repoProposalMeta = useMemo(() => getRepoWorkbenchPackMeta(pid, "proposal"), [pid, gateTick]);

  const [lockedRepoBytesPresent, setLockedRepoBytesPresent] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bytes = await getLockedRepoPackBytes(pid);
        if (!cancelled) setLockedRepoBytesPresent(Boolean(bytes && bytes.length > 0));
      } catch {
        if (!cancelled) setLockedRepoBytesPresent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pid, gateTick]);

  const repoTri: Tri = useMemo(() => {
    if (!repoLocked) return "warn";
    if (!lockedRepoBytesPresent) return "fail";
    return "pass";
  }, [repoLocked, lockedRepoBytesPresent]);

  const verifyLatest: VerifyReport | null = useMemo(() => getLatestVerifyReport(pid), [pid, gateTick]);
  const verifyTri: Tri = useMemo(() => triFromVerify(verifyLatest), [verifyLatest]);
  const verifyTriForChecklist: Tri = useMemo(() => {
    if (rigor === "safe") return verifyTri;
    return verifyTri === "warn" ? "fail" : verifyTri;
  }, [verifyTri, rigor]);

  const backupHistory: BackupHistoryV1 | null = useMemo(() => getBackupHistory(pid), [pid, gateTick]);
  const backupTri: Tri = useMemo(() => (backupHistory ? "pass" : "warn"), [backupHistory]);

  const readyToShip = useMemo(() => {
    if (!specLocked) return { ok: false, warn: false };
    if (blueprintTri !== "pass") return { ok: false, warn: false };
    if (repoTri !== "pass") return { ok: false, warn: false };
    if (!verifyLatest) return { ok: false, warn: false };
    if (rigor === "safe") {
      if (verifyTri === "fail") return { ok: false, warn: false };
    } else {
      if (verifyTri !== "pass") return { ok: false, warn: false };
    }
    if (backupTri !== "pass") return { ok: false, warn: false };
    if (rigor === "safe" && verifyTri === "warn") return { ok: true, warn: true };
    return { ok: true, warn: false };
  }, [specLocked, blueprintTri, repoTri, verifyTri, verifyLatest, backupTri, rigor]);

  const nextPrimaryAction = useMemo(() => {
    if (!specLocked) return { label: "Adopt + lock Spec Pack", href: "/director/journey" };
    if (blueprintTri !== "pass") return { label: "Generate layout draft", onClick: compileBlueprintPackProposal, disabled: busy };
    if (!repoLocked) {
      if (repoProposalMeta) return { label: "Adopt + lock Repo Pack", href: "/director/journey" };
      return { label: "Compile Repo Pack proposal", onClick: compileRepoPackProposal, disabled: busy };
    }
    if (!verifyLatest) return { label: "Run Verify", href: "/director/journey" };
    if (rigor === "safe") {
      if (verifyTri === "fail") return { label: "Run Verify", href: "/director/journey" };
    } else {
      if (verifyTri !== "pass") return { label: "Run Verify", href: "/director/journey" };
    }
    if (!backupHistory) return { label: "Export backup", href: "/director/journey" };
    return { label: "Release checklist", href: "/director/journey" };
  }, [specLocked, blueprintTri, repoLocked, repoProposalMeta, busy, verifyLatest, verifyTri, backupHistory, rigor]);

  async function downloadLockedRepoPack() {
    try {
      const bytes = await getLockedRepoPackBytes(pid);
      if (!bytes) {
        setNotice({ kind: "warn", title: "No locked Repo Pack bytes found", details: ["Lock a Repo Pack snapshot in Repo Workbench first."] });
        return;
      }
      const fname = `repo_pack_locked_${safeFileName(state?.project?.name || pid)}.zip`;
      downloadBytes(fname, bytes, "application/zip");
    } catch (e: any) {
      setNotice({ kind: "error", title: "Download failed", details: [String(e?.message || e)] });
    }
  }

  async function downloadOneMoveDeployBundle() {
    setBusy(true);
    setNotice({ kind: "info", title: "Building one-move deploy bundle…" });
    try {
      const lockedRepo = await getLockedRepoPackBytes(pid);
      if (!lockedRepo) {
        setNotice({ kind: "warn", title: "No locked Repo Pack found", details: ["Lock a Repo Pack snapshot in Repo Workbench first."] });
        return;
      }

      const wiz = loadDeployWizardStateV1(pid);
      const depZip = buildDeploymentPackZipV1({
        project_id: pid,
        project_name: String(state?.project?.name || pid),
        state: wiz,
        // Secrets are never persisted. If user opted-in to include secrets, the wizard asks at export-time.
        // This one-move bundle intentionally does not prompt for secrets.
        secrets: undefined,
      });

      const built = buildOneMoveDeployBundleZipV1({
        project_id: pid,
        project_name: String(state?.project?.name || pid),
        locked_repo_pack_zip: lockedRepo,
        deployment_pack_zip: depZip,
      });

      const name = safeFileName(state?.project?.name || pid);
      const date = new Date().toISOString().slice(0, 10);
      const fname = `one_move_deploy_bundle__${name}__${date}.zip`;
      downloadBytes(fname, built.zipBytes, "application/zip");

      setNotice({
        kind: "success",
        title: "One-move bundle downloaded",
        details: [
          `repo_pack_sha256: ${built.meta.contents.locked_repo_pack_zip_sha256}`,
          `deployment_pack_sha256: ${built.meta.contents.deployment_pack_zip_sha256}`,
          "Bundle contains: locked repo pack + deployment pack + README + meta.json",
        ],
      });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Bundle build failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  async function downloadPublishReadyBundle() {
    setBusy(true);
    setNotice({ kind: "info", title: "Building publish-ready proof bundle…" });
    try {
      const r = await buildPublishReadyProofBundleZip(pid);
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error, details: r.details });
        return;
      }

      const name = safeFileName(state?.project?.name || pid);
      const date = new Date().toISOString().slice(0, 10);
      const fname = `publish_ready_bundle__${name}__${date}.zip`;
      downloadBytes(fname, r.zipBytes, "application/zip");

      setNotice({
        kind: r.meta.overall === "pass" ? "success" : r.meta.overall === "warn" ? "warn" : "error",
        title: `Proof bundle downloaded (${String(r.meta.overall).toUpperCase()})`,
        details: [
          `project_id: ${r.meta.project_id}`,
          `app_version: ${r.meta.app_version}`,
          `validator_version: ${r.meta.validator_version}`,
          `files: ${r.meta.included_paths.length}`,
        ],
      });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Failed to build proof bundle", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  async function downloadProjectBackup() {
    setNotice(null);
    try {
      if (!state) {
        setNotice({ kind: "warn", title: "No project loaded", details: ["Create a project first."] });
        return;
      }
      const r = await buildProjectBackupZip({ projectId: pid, projectName: String(state?.project?.name || pid) });
      downloadBytes(`project_backup_${safeFileName(state?.project?.name || pid)}.zip`, r.zipBytes, "application/zip");
      setNotice({ kind: "success", title: "Backup downloaded", details: ["Keep this file somewhere safe. It contains your full Director state."] });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Backup failed", details: [String(e?.message || e)] });
    }
  }

  // Director-safe Ship (default).
  // Keeps proof-lane tooling and internal diagnostics hidden unless Advanced inspector is explicitly unlocked.
  if (!advancedMode) {
    const JOURNEY_KEY = "kindred.director_journey.v1";
    const AI_CONN_KEY = "kindred.ai.connection.v2";
    const AI_CONN_KEY_FALLBACK = "kindred.ai_connection.v2";

    const readJson = (key: string) => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const downloadText = (filename: string, text: string, mime: string) => {
      const bytes = new TextEncoder().encode(String(text || ""));
      downloadBytes(filename, bytes, mime);
    };

    const postJson = async (url: string, body: any, pairing: string, extraHeaders?: Record<string, string>) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20_000);
      try {
        const r = await fetch(url, {
          ...({ targetAddressSpace: "loopback" } as any),
          method: "POST",
          cache: "no-store",
          headers: {
            "content-type": "application/json",
            "x-kindred-pairing": String(pairing || ""),
            ...(extraHeaders || {}),
          },
          body: JSON.stringify(body || {}),
          signal: ctrl.signal,
        });
        const rid = r.headers.get("x-kindred-request-id");
        const j = await r.json().catch(async () => {
          const t = await r.text().catch(() => "");
          return { ok: false, error: "connector_bad_response", details: [t || `HTTP ${r.status}`] };
        });
        if (rid && j && typeof j === "object") (j as any).request_id = rid;
        if (!r.ok && j && typeof j === "object" && !j.ok) {
          if (!Array.isArray((j as any).details)) (j as any).details = [];
          if (r.status) (j as any).details.unshift(`HTTP ${r.status}`);
        }
        return j as any;
      } catch (e: any) {
        const raw = String(e?.message || e || "");
        const isTimeout = String(e?.name || "").includes("Abort");
        const details: string[] = [];

        if (isTimeout) {
          details.push("The connector did not respond in time.");
          details.push("Confirm it is running and not busy, then try again.");
          return { ok: false, error: "timeout", details } as any;
        }

        details.push("Could not reach the local connector.");
        if (/private network|Access-Control-Allow-Private-Network|blocked|failed to fetch/i.test(raw)) {
          details.push("Your browser may be blocking local network requests (PNA / Local Network Access).");
          details.push("If prompted, allow Local Network Access, then try again.");
        }
        details.push("Confirm the connector is running on this computer and the pairing code is correct.");
        return { ok: false, error: "network_error", details } as any;
      } finally {
        clearTimeout(t);
      }
    };

    const formatConnectorFail = (r: any): string => {
      const err = String(r?.error || "unknown");
      const rid = String((r as any)?.request_id || "").trim();
      const suf = rid ? ` [req:${rid.slice(0, 8)}]` : "";
      if (err === "busy") return "connector_busy (another operation is in progress)" + suf;
      if (err === "rate_limited") {
        const ms = Number(r?.retry_after_ms || 0);
        const s = ms > 0 ? Math.ceil(ms / 1000) : 0;
        return (s ? `rate_limited (try again in ~${s}s)` : "rate_limited") + suf;
      }
      if (err === "pairing_rate_limited") {
        const ms = Number(r?.retry_after_ms || 0);
        const s = ms > 0 ? Math.ceil(ms / 1000) : 0;
        return (s ? `pairing_rate_limited (wait ~${s}s then try again)` : "pairing_rate_limited") + suf;
      }
      if (err === "payload_too_large") {
        const max = Number(r?.max_bytes || 0);
        return (max ? `payload_too_large (max ~${max} bytes)` : "payload_too_large") + suf;
      }
      const details = Array.isArray(r?.details) ? r.details.filter(Boolean).map((x: any) => String(x)) : [];
      if (!details.length) return err + suf;
      return `${err} — ${details.join(" ")}` + suf;
    };

    const buildPlanFromJourney = (j: any) => {
      const selectedId = String(j?.selected_proposal_id || "");
      const proposals = Array.isArray(j?.proposals) ? j.proposals : [];
      const chosen = proposals.find((p: any) => String(p?.id) === selectedId) || null;
      const name = String(chosen?.name || "Build plan");
      const timeline = String(chosen?.timeline || "");
      const features = Array.isArray(chosen?.features) ? chosen.features : [];
      const refined = Array.isArray(j?.refined_features) ? j.refined_features : [];
      const upgrades = Array.isArray(j?.upgrades) ? j.upgrades : [];
      return {
        kind: "kindred.build_plan.v1",
        created_at: new Date().toISOString(),
        selected_proposal_id: selectedId || null,
        selected_proposal_name: name,
        timeline_hint: timeline || null,
        scope: String(chosen?.scope || "standard"),
        complexity: String(chosen?.complexity || "medium"),
        planned_features: features,
        refined_features: refined,
        optional_upgrades: upgrades,
        phases: [
          { name: "Confirm brief", goals: ["Lock your must-haves and must-nots", "Confirm the chosen proposal"] },
          { name: "Design", goals: ["Information architecture", "Core screens", "Happy path + edge cases"] },
          { name: "Build", goals: ["Implement core flows", "Add safety rails (audit, retries, destructive ops)"] },
          { name: "Test", goals: ["Smoke tests", "Critical paths", "Import/export checks"] },
          { name: "Launch", goals: ["Deploy", "Monitor", "Iterate based on real usage"] },
        ],
      };
    };

    const buildHandoffMd = (j: any, aiSel: any) => {
      const selectedId = String(j?.selected_proposal_id || "");
      const proposals = Array.isArray(j?.proposals) ? j.proposals : [];
      const chosen = proposals.find((p: any) => String(p?.id) === selectedId) || null;
      const title = String(chosen?.name || "Ship Pack");
      const summary = String(chosen?.summary || "");
      const vibe = j?.style?.vibe ? String(j.style.vibe) : "";
      const feel = j?.brief?.feel ? String(j.brief.feel) : "";
      const oneSentence = j?.seed?.one_sentence ? String(j.seed.one_sentence) : "";
      const mustHave = Array.isArray(j?.brief?.must_have) ? j.brief.must_have : [];
      const canWait = Array.isArray(j?.brief?.can_wait) ? j.brief.can_wait : [];
      const refined = Array.isArray(j?.refined_features) ? j.refined_features : [];
      const lines: string[] = [];
      lines.push(`# Kindred Ship Pack`);
      lines.push("");
      lines.push(`**Project:** ${title}`);
      if (oneSentence) lines.push(`**One line:** ${oneSentence}`);
      if (summary) {
        lines.push("");
        lines.push(summary);
      }
      lines.push("");
      lines.push(`## Selected proposal`);
      lines.push(`- id: ${selectedId || "(not selected)"}`);
      if (chosen?.scope) lines.push(`- scope: ${String(chosen.scope)}`);
      if (chosen?.complexity) lines.push(`- complexity: ${String(chosen.complexity)}`);
      if (chosen?.timeline) lines.push(`- timeline hint: ${String(chosen.timeline)}`);
      lines.push("");
      lines.push(`## Must-haves`);
      if (mustHave.length) lines.push(...mustHave.map((x: any) => `- ${String(x)}`));
      else lines.push("- (none captured)");
      lines.push("");
      lines.push(`## Can wait`);
      if (canWait.length) lines.push(...canWait.map((x: any) => `- ${String(x)}`));
      else lines.push("- (none captured)");
      lines.push("");
      lines.push(`## Refinements`);
      if (refined.length) lines.push(...refined.map((x: any) => `- ${String(x)}`));
      else lines.push("- (none)");
      lines.push("");
      lines.push(`## Taste / style`);
      lines.push(`- feel: ${feel || "(unspecified)"}`);
      lines.push(`- vibe: ${vibe || "(unspecified)"}`);
      lines.push("");
      lines.push(`## AI connection (no secrets)`);
      if (aiSel) {
        lines.push(`- brand_id: ${aiSel.brand_id || "(unset)"}`);
        lines.push(`- connection_method: ${aiSel.connection_method || "(unset)"}`);
        lines.push(`- model_id: ${aiSel.model_id || "auto"}`);
      } else {
        lines.push("- (not connected)");
      }
      lines.push("");
      lines.push(`## Notes`);
      lines.push("This ship pack is a deterministic snapshot of the Director journey. It contains no API keys.");
      return lines.join("\n");
    };

    const journey = readJson(JOURNEY_KEY);
    const ai = readJson(AI_CONN_KEY) || readJson(AI_CONN_KEY_FALLBACK);

    const shipLocked = Boolean((journey as any)?.ship_pack_locked);

    const writeJourney = (next: any) => {
      try {
        localStorage.setItem(JOURNEY_KEY, JSON.stringify(next || null));
      } catch {
        // ignore
      }
    };

    const canExport = Boolean(ai?.connected && ai?.connector_url && ai?.pairing_code);

    const readiness = (() => {
      const missing: string[] = [];
      const hasProposals = Array.isArray(journey?.proposals) && journey.proposals.length > 0;
      const hasSelected = Boolean(journey?.selected_proposal_id);
      if (!journey) missing.push("Finish the Journey steps first.");
      else {
        if (!hasProposals) missing.push("Generate options (3–7) first.");
        if (!hasSelected) missing.push("Choose one option before shipping.");
      }
      return {
        ok: Boolean(journey && hasProposals && hasSelected),
        missing,
      };
    })();

    const review = (() => {
      const selectedId = String(journey?.selected_proposal_id || "");
      const proposals = Array.isArray(journey?.proposals) ? journey.proposals : [];
      const chosen = proposals.find((p: any) => String(p?.id) === selectedId) || null;

      const goal = String(journey?.seed?.goal || "");
      const oneSentence = String(journey?.seed?.one_sentence || "");
      const feel = String(journey?.brief?.feel || "");
      const vibe = String(journey?.style?.vibe || "");
      const tags = Array.isArray((journey as any)?.tags) ? (journey as any).tags : [];
      const inspoCount = Array.isArray((journey as any)?.inspiration) ? (journey as any).inspiration.length : 0;
      const tasteLocked = Boolean((journey as any)?.taste_locked);
      const tasteVector = (journey as any)?.taste_vector || null;
      const tasteConfidence = String(tasteVector?.confidence || "low");
      const tasteChips = Array.isArray(tasteVector?.chips) ? tasteVector.chips : [];
      const brownfieldUrl = String((journey as any)?.brownfield_git_url || "");
      const shipPackLocked = Boolean((journey as any)?.ship_pack_locked);
      const shipPackLockedAt = String((journey as any)?.ship_pack_locked_at || "");
      const shipPackLockedBasisHash = String((journey as any)?.ship_pack_locked_basis_hash || "");
      const shipPackLockedBasisSummary = (journey as any)?.ship_pack_locked_basis_summary || null;

      const aiSummary = ai?.connected
        ? `${String(ai?.brand_id || "AI")}${ai?.model_id ? ` · ${String(ai.model_id)}` : ""}`
        : "Not connected";

      const basisObj = {
        seed: (journey as any)?.seed || null,
        brief: (journey as any)?.brief || null,
        selected_proposal_id: selectedId || null,
        inspiration: Array.isArray((journey as any)?.inspiration) ? (journey as any).inspiration : [],
        taste_vector: (journey as any)?.taste_vector || null,
        taste_locked: Boolean((journey as any)?.taste_locked),
        tags,
        style_locked: Boolean((journey as any)?.style_locked),
        ai_selection: ai?.connected ? {
          brand_id: ai.brand_id || null,
          connection_kind: ai.connection_kind || null,
          connection_method: ai.connection_method || null,
          model_id: ai.model_id || null,
          preferred_provider_id: ai.preferred_provider_id || null,
        } : null,
      };

      const shipBasisNow = (journey as any)?.brief && selectedId ? shipPackBasisHashFromParts(basisObj) : "";
      const summaryNow = summarizeShipPackBasisFromParts({
        goal,
        sector: (journey as any)?.seed?.sector || null,
        seriousness: String((journey as any)?.seed?.seriousness || "standard"),
        creative_push: String((journey as any)?.brief?.creative_push || "balanced"),
        inspiration_count: inspoCount,
        tags_count: tags.length,
        taste_confidence: tasteConfidence,
        taste_locked: Boolean((journey as any)?.taste_locked),
        style_locked: Boolean((journey as any)?.style_locked),
        selected_proposal_id: selectedId,
        selected_proposal_name: String(chosen?.name || "") || undefined,
        ai_brand_id: ai?.connected ? (ai.brand_id || null) : null,
        ai_model_id: ai?.connected ? (ai.model_id || null) : null,
      });
      const shipLockOutOfDate = Boolean(shipPackLocked && shipPackLockedBasisHash && shipBasisNow && shipPackLockedBasisHash !== shipBasisNow);
      const shipLockChanges = shipLockOutOfDate ? diffShipPackBasisSummary(shipPackLockedBasisSummary || undefined, summaryNow) : [];
      const shipLockedEffective = Boolean(shipPackLocked && !shipLockOutOfDate);

      return {
        goal,
        oneSentence,
        feel,
        vibe,
        tags,
        inspoCount,
        tasteLocked,
        tasteConfidence,
        tasteChips,
        brownfieldUrl,
        shipPackLocked,
        shipPackLockedAt,
        shipLockOutOfDate,
        shipLockChanges,
        shipBasisNow,
        summaryNow,
        shipLockedEffective,
        selectedId,
        chosenName: String(chosen?.name || ""),
        aiSummary,
      };
    })();


    async function downloadShipPack() {
      setSimpleMsg("");
      if (!journey) {
        setSimpleMsg("No Journey state found yet. Finish the Journey first.");
        return;
      }
      if (!readiness.ok) {
        setSimpleMsg(`Not ready to export yet: ${readiness.missing.join(" ")}`);
        return;
      }

      const aiSel = ai
        ? {
            brand_id: ai.brand_id || null,
            connection_kind: ai.connection_kind || null,
            connection_method: ai.connection_method || null,
            model_id: ai.model_id || "auto",
            preferred_provider_id: ai.preferred_provider_id || null,
          }
        : null;

      const buildPlan = buildPlanFromJourney(journey);
      const handoffMd = buildHandoffMd(journey, aiSel);

      const shipPack = {
        kind: "kindred.ship_pack.v1",
        created_at: new Date().toISOString(),
        ai_selection: aiSel,
        build_plan: buildPlan,
        handoff_md: handoffMd,
          ship_pack_status: {
            locked: Boolean((journey as any)?.ship_pack_locked),
            locked_at: (journey as any)?.ship_pack_locked_at || null,
            locked_basis_hash: (journey as any)?.ship_pack_locked_basis_hash || null,
            locked_basis_summary: (journey as any)?.ship_pack_locked_basis_summary || null,
            out_of_date: Boolean(review.shipLockOutOfDate),
            locked_effective: Boolean(review.shipLockedEffective),
            current_basis_hash: review.shipBasisNow || null,
            current_basis_summary: review.summaryNow || null,
          },
        options_sets: [
          {
            kind: 'current',
            generated_at: (journey as any)?.proposals_generated_at || null,
            basis_summary: (journey as any)?.proposals_basis_summary || null,
            proposals: Array.isArray((journey as any)?.proposals) ? (journey as any).proposals : [],
          },
          ...(((journey as any)?.proposals_prev && (journey as any).proposals_prev.length) ? [{
            kind: 'previous',
            generated_at: (journey as any)?.proposals_prev_generated_at || null,
            basis_summary: (journey as any)?.proposals_prev_basis_summary || null,
            proposals: Array.isArray((journey as any)?.proposals_prev) ? (journey as any).proposals_prev : [],
          }] : []),
        ],
        journey_state: journey,
      };

      const shipPackText = stableJsonText(shipPack, 2);
      const buildPlanText = stableJsonText(buildPlan, 2);
      const journeyText = stableJsonText(journey, 2);
      const handoffText = String(handoffMd || "").endsWith("\n") ? String(handoffMd || "") : String(handoffMd || "") + "\n";

      const receipt = {
        kind: "kindred.ship_pack_receipt.v1",
        created_at: shipPack.created_at,
        app_version: APP_VERSION,
        files: {
          "ship_pack.json": { sha256: await sha256Hex(shipPackText), bytes: shipPackText.length },
          "BUILD_PLAN.json": { sha256: await sha256Hex(buildPlanText), bytes: buildPlanText.length },
          "HANDOFF.md": { sha256: await sha256Hex(handoffText), bytes: handoffText.length },
          "journey_state.json": { sha256: await sha256Hex(journeyText), bytes: journeyText.length },
          },
        notes: [
          "No secrets stored.",
          "Hashes computed over stable exported text.",
        ],
      };
      const receiptText = stableJsonText(receipt, 2);

      downloadText("ship_pack.json", shipPackText, "application/json");
      downloadText("BUILD_PLAN.json", buildPlanText, "application/json");
      downloadText("HANDOFF.md", handoffText, "text/markdown");
      downloadText("journey_state.json", journeyText, "application/json");
      downloadText("SHIP_PACK_RECEIPT.json", receiptText, "application/json");
      setSimpleMsg("Downloaded ship pack + journey backup.");
    }

    async function exportShipPackToGithub() {
      setSimpleMsg("");
      setSimpleRepoUrl("");
      if (!readiness.ok) {
        setSimpleMsg(readiness.missing.join(" "));
        return;
      }
      if (!canExport) {
        setSimpleMsg("AI connector not connected. Go to Connect AI first.");
        return;
      }
      if (!journey) {
        setSimpleMsg("No Journey state found yet. Finish the Journey first.");
        return;
      }
      const suggested = journey?.seed?.goal ? `kindred-ship-pack-${journey.seed.goal}` : "kindred-ship-pack";
      const picked = String(simpleRepoName || suggested).trim();
      const n = normalizeRepoName(picked);
      if (!n.ok) {
        setSimpleMsg(n.reason);
        return;
      }
      const name = n.name;
      // High-impact action: require explicit confirmation (Director-safe, no browser prompt).
      if (String(simpleExportToken || '').trim().toUpperCase() !== 'EXPORT') {
        setSimpleMsg('Type EXPORT to confirm GitHub export.');
        return;
      }

      // Draft export must be explicit.
      if (!review.shipLockedEffective && !simpleDraftAck) {
        setSimpleMsg("This ship pack is still a draft (or your locked pack is out of date). Tick the box to export a draft, or re-lock it first.");
        return;
      }
      setSimpleBusy(true);
      try {
        const aiSel = {
          brand_id: ai.brand_id || null,
          connection_kind: ai.connection_kind || null,
          connection_method: ai.connection_method || null,
          model_id: ai.model_id || "auto",
          preferred_provider_id: ai.preferred_provider_id || null,
        };

        const buildPlan = buildPlanFromJourney(journey);
        const handoffMd = buildHandoffMd(journey, aiSel);

        const shipPack = {
          kind: "kindred.ship_pack.v1",
          created_at: new Date().toISOString(),
          ai_selection: aiSel,
          build_plan: buildPlan,
          handoff_md: handoffMd,
          ship_pack_status: {
            locked: Boolean((journey as any)?.ship_pack_locked),
            locked_at: (journey as any)?.ship_pack_locked_at || null,
            locked_basis_hash: (journey as any)?.ship_pack_locked_basis_hash || null,
            locked_basis_summary: (journey as any)?.ship_pack_locked_basis_summary || null,
            out_of_date: Boolean(review.shipLockOutOfDate),
            locked_effective: Boolean(review.shipLockedEffective),
            current_basis_hash: review.shipBasisNow || null,
            current_basis_summary: review.summaryNow || null,
          },
          options_sets: [
            {
              kind: 'current',
              generated_at: (journey as any)?.proposals_generated_at || null,
              basis_summary: (journey as any)?.proposals_basis_summary || null,
              proposals: Array.isArray((journey as any)?.proposals) ? (journey as any).proposals : [],
            },
            ...(((journey as any)?.proposals_prev && (journey as any).proposals_prev.length) ? [{
              kind: 'previous',
              generated_at: (journey as any)?.proposals_prev_generated_at || null,
              basis_summary: (journey as any)?.proposals_prev_basis_summary || null,
              proposals: Array.isArray((journey as any)?.proposals_prev) ? (journey as any).proposals_prev : [],
            }] : []),
          ],
          journey_state: journey,
        };

        const shipPackText = stableJsonText(shipPack, 2);
        const buildPlanText = stableJsonText(buildPlan, 2);
        const journeyText = stableJsonText(journey, 2);
        const handoffText = String(handoffMd || "").endsWith("\n") ? String(handoffMd || "") : String(handoffMd || "") + "\n";

        const receipt = {
          kind: "kindred.ship_pack_receipt.v1",
          created_at: shipPack.created_at,
          app_version: APP_VERSION,
          files: {
            "ship_pack.json": { sha256: await sha256Hex(shipPackText), bytes: shipPackText.length },
            "BUILD_PLAN.json": { sha256: await sha256Hex(buildPlanText), bytes: buildPlanText.length },
            "HANDOFF.md": { sha256: await sha256Hex(handoffText), bytes: handoffText.length },
            "journey_state.json": { sha256: await sha256Hex(journeyText), bytes: journeyText.length },
          },
          notes: [
            "No secrets stored.",
            "Hashes computed over stable exported text.",
          ],
        };

        const confSP = await postJson(`${ai.connector_url}/v1/confirm`, { scope: "ship_pack_create" }, ai.pairing_code);
        if (!confSP?.ok || !confSP?.token) {
          setSimpleMsg(`Could not prepare export folder: ${formatConnectorFail(confSP)}`);
          setSimpleBusy(false);
          return;
        }

        const created = await postJson(
          `${ai.connector_url}/v1/ship_pack/create`,
          { state: { ship_pack: shipPack, build_plan: buildPlan, handoff_md: handoffMd, journey_state: journey, receipt }, name },
          ai.pairing_code,
          { "x-kindred-confirm": String(confSP.token) }
        );
        if (!created?.ok) {
          const err = created?.error || "unknown";
          if (err === "busy") setSimpleMsg("Connector is busy preparing another pack. Wait a moment and retry.");
          else setSimpleMsg(`Could not prepare export folder: ${formatConnectorFail(created)}`);
          setSimpleBusy(false);
          return;
        }

        const conf = await postJson(`${ai.connector_url}/v1/confirm`, { scope: "github_export" }, ai.pairing_code);
        if (!conf?.ok || !conf?.token) {
          setSimpleMsg(`Could not start export: ${formatConnectorFail(conf)}`);
          setSimpleBusy(false);
          return;
        }

        const exported = await postJson(
          `${ai.connector_url}/v1/github/export`,
          { local_path: created.local_path, repo_name: name, visibility: "public", receipt },
          ai.pairing_code,
          { "x-kindred-confirm": String(conf.token) }
        );
        if (!exported?.ok) {
          const err = exported?.error || "unknown";
          if (err === "busy") {
            setSimpleMsg("Connector is busy exporting another repo. Wait for it to finish and retry.");
            setSimpleBusy(false);
            return;
          }
          if (err === "ship_pack_receipt_mismatch") {
            setSimpleMsg("Export aborted: the prepared folder did not match its receipt (integrity check failed). Try regenerating the ship pack and exporting again.");
            setSimpleBusy(false);
            return;
          }
          if (err === "gh_not_installed") setSimpleMsg("GitHub CLI (gh) is not installed on this computer.");
          else if (err === "gh_not_logged_in") setSimpleMsg("Login required: run `gh auth login` in your terminal.");
          else if (err === "gh_repo_exists") setSimpleMsg("Repo already exists. Change the name and retry.");
          else if (err === "gh_insufficient_scopes") setSimpleMsg("Missing GitHub permissions. Re-run `gh auth login` and grant repo scope.");
          else if (err === "gh_permission_denied") setSimpleMsg("Permission denied. Check which GitHub account you are logged into.");
          else if (err === "gh_network_error") setSimpleMsg("Network error reaching GitHub. Check connectivity and retry.");
          else if (err === "git_not_installed") setSimpleMsg("Git is not installed. Install Git and retry.");
          else setSimpleMsg(`GitHub export failed: ${formatConnectorFail(exported)}`);
          setSimpleBusy(false);
          return;
        }

        setSimpleMsg(`Exported to GitHub repo: ${exported.repo_name}`);
        if (exported?.repo_url && String(exported.repo_url).startsWith("http")) {
          setSimpleRepoUrl(String(exported.repo_url));
        }
        if (exported?.commit_url && String(exported.commit_url).startsWith("http")) {
          setSimpleCommitUrl(String(exported.commit_url));
        }
        if (exported?.commit_sha && typeof exported.commit_sha === "string") {
          setSimpleCommitSha(String(exported.commit_sha));
        }
        if (typeof exported?.remote_verified === "boolean") {
          setSimpleRemoteVerified(Boolean(exported.remote_verified));
        } else {
          setSimpleRemoteVerified(null);
        }
        if (exported?.remote_head_sha && typeof exported.remote_head_sha === "string") {
          setSimpleRemoteHeadSha(String(exported.remote_head_sha));
        } else {
          setSimpleRemoteHeadSha("");
        }
        if (exported?.remote_verify_error && typeof exported.remote_verify_error === "string") {
          setSimpleRemoteVerifyError(String(exported.remote_verify_error));
        } else {
          setSimpleRemoteVerifyError("");
        }
      } catch (e: any) {
        setSimpleMsg(`GitHub export failed: ${e?.message || "unknown"}`);
      }
      setSimpleBusy(false);
    }

    return (
      <div className="container">
        <div className="hero">
          <h1>Ship</h1>
          <p>
            Download your deliverables and export to GitHub. Internals stay hidden unless you unlock Advanced.
          </p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <a className="btn secondary" href="/director/journey">Back to journey</a>
            <a className="btn secondary" href="/director/connect-ai">Connect AI</a>
            <a className="btn" href="/director">Director Home</a>
          </div>
        </div>

        {!readiness.ok ? (
          <Callout
            kind="warn"
            title="Finish a couple steps first"
            details={readiness.missing}
            actions={<a className="btn" href="/director/journey">Go to Journey</a>}
          />
        ) : null}

        {simpleMsg ? (
          <Callout
            title="GitHub export"
            tone={simpleMsg.toLowerCase().includes("failed") ? "danger" : "info"}
            actions={
              simpleRepoUrl ? (
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <a className="btn secondary" href={simpleRepoUrl} target="_blank" rel="noreferrer">
                    Open on GitHub
                  </a>
                  {simpleCommitUrl ? (
                    <a className="btn secondary" href={simpleCommitUrl} target="_blank" rel="noreferrer">
                      Open commit
                    </a>
                  ) : null}
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(simpleRepoUrl);
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Copy link
                  </button>
                  {simpleCommitSha ? (
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(simpleCommitSha);
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      Copy commit SHA
                    </button>
                  ) : null}
                </div>
              ) : null
            }
          >
            <p className="small" style={{ margin: 0 }}>{simpleMsg}</p>
            {simpleRemoteVerified !== null ? (
              <p className="small" style={{ margin: "6px 0 0 0", opacity: 0.9 }}>
                Remote verification: {simpleRemoteVerified
                  ? "Verified on GitHub"
                  : `Mismatch (remote HEAD ${simpleRemoteHeadSha ? simpleRemoteHeadSha.slice(0, 7) : "unknown"} != pushed commit)`}
              </p>
            ) : simpleRemoteVerifyError ? (
              <p className="small" style={{ margin: "6px 0 0 0", opacity: 0.9 }}>
                Remote verification: Not confirmed yet (check your network / permissions).
              </p>
            ) : null}
          </Callout>
        ) : null}
        {showLnaSimpleHelp ? <LocalNetworkAccessHelp connectorUrl={String(ai?.connector_url || "http://127.0.0.1:6174")} /> : null}

        <div className="grid">
          <Panel title="Review" subtitle="Confirm what you're about to ship.">
            <div className="small" style={{ marginTop: 6 }}>
              This is a fast sanity check. You can always go back and tweak before exporting.
            </div>
            <div className="hr" />
            <div className="small" style={{ display: "grid", gap: 6 }}>
              <div><strong>AI:</strong> {review.aiSummary}</div>
              <div><strong>Goal:</strong> {review.goal || "(not set)"}</div>
              {review.oneSentence ? <div><strong>One line:</strong> {review.oneSentence}</div> : null}
              <div>
                <strong>Chosen option:</strong> {review.chosenName || (review.selectedId ? `#${review.selectedId}` : "(not chosen yet)")}
              </div>
              <div>
                <strong>Taste:</strong> {review.inspoCount} inspiration item{review.inspoCount === 1 ? "" : "s"}
                {review.tasteChips.length ? ` · ${review.tasteChips.slice(0, 5).join(", ")}${review.tasteChips.length > 5 ? "…" : ""}` : ""}
                {` · confidence ${review.tasteConfidence}`}
                {review.tasteLocked ? " · locked" : ""}
              </div>
              {review.tags && review.tags.length ? (
                <div><strong>Tags:</strong> {review.tags.slice(0, 8).join(", ")}{review.tags.length > 8 ? "…" : ""}</div>
              ) : (
                <div><strong>Tags:</strong> (none)</div>
              )}
              {review.brownfieldUrl ? <div><strong>Brownfield:</strong> {review.brownfieldUrl}</div> : null}
              <div>
                <strong>Ship pack:</strong> {review.shipLockedEffective ? "Locked" : (review.shipPackLocked ? "Locked (out of date)" : "Draft")}
                {review.shipPackLocked && review.shipPackLockedAt ? ` · ${new Date(review.shipPackLockedAt).toLocaleString()}` : ""}
              </div>
              {review.shipLockOutOfDate && review.shipLockChanges.length ? (
                <div style={{ marginTop: 8 }}>
                  <div className="small" style={{ opacity: 0.85, marginBottom: 6 }}>What changed since you locked:</div>
                  <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                    {review.shipLockChanges.slice(0, 10).map((x: string, i: number) => (
                      <li key={`shipchg_simple_${i}`}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              {!review.shipLockedEffective ? (
                <>
                  <input
                    className="input"
                    placeholder="Type LOCK"
                    value={simpleLockToken}
                    onChange={(e) => setSimpleLockToken(String(e.target.value || ""))}
                    style={{ maxWidth: 160 }}
                  />
                  <SecondaryButton
                    onClick={() => {
                      const tok = String(simpleLockToken || "").trim().toUpperCase();
                      if (tok !== "LOCK") {
                        setSimpleMsg("Type LOCK to lock the ship pack.");
                        return;
                      }
                      if (!review.shipBasisNow) {
                        setSimpleMsg("Cannot lock yet: finish the Journey and choose an option first.");
                        return;
                      }
                      const next = {
                        ...(journey as any),
                        ship_pack_locked: true,
                        ship_pack_locked_at: new Date().toISOString(),
                        ship_pack_locked_basis_hash: review.shipBasisNow,
                        ship_pack_locked_basis_summary: review.summaryNow,
                      };
                      writeJourney(next);
                      setSimpleLockToken("");
                      setSimpleDraftAck(false);
                      setSimpleMsg(review.shipPackLocked ? "Ship pack updated." : "Ship pack locked.");
                    }}
                    disabled={String(simpleLockToken || "").trim().toUpperCase() !== "LOCK" || !review.shipBasisNow}
                  >
                    {review.shipPackLocked ? "Re-lock ship pack" : "Lock ship pack"}
                  </SecondaryButton>
                  {review.shipPackLocked ? (
                    <SecondaryButton
                      onClick={() => {
                        const next = { ...(journey as any), ship_pack_locked: false, ship_pack_locked_at: null, ship_pack_locked_basis_hash: undefined, ship_pack_locked_basis_summary: undefined };
                        writeJourney(next);
                        setSimpleDraftAck(false);
                        setSimpleMsg("Ship pack unlocked.");
                      }}
                    >
                      Unlock
                    </SecondaryButton>
                  ) : null}
                </>
              ) : (
                <SecondaryButton
                  onClick={() => {
                    const next = { ...(journey as any), ship_pack_locked: false, ship_pack_locked_at: null, ship_pack_locked_basis_hash: undefined, ship_pack_locked_basis_summary: undefined };
                    writeJourney(next);
                    setSimpleDraftAck(false);
                    setSimpleMsg("Ship pack unlocked.");
                  }}
                >
                  Unlock
                </SecondaryButton>
              )}
            </div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <SecondaryButton href="/director/journey">Edit in Journey</SecondaryButton>
              <SecondaryButton href="/director/connect-ai">Adjust AI</SecondaryButton>
            </div>
          </Panel>

          <Panel title="Download">
            <p className="small">This saves a Ship Pack + Journey backup to your device (no secrets included).</p>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <PrimaryButton onClick={downloadShipPack} disabled={simpleBusy || !journey}>
                {review.shipLockedEffective ? "Download locked ship pack" : (review.shipPackLocked ? "Download draft ship pack" : "Download draft ship pack")}
              </PrimaryButton>
              <SecondaryButton href="/director/journey">Refine first</SecondaryButton>
            </div>
          </Panel>

          <Panel title="Export to GitHub" subtitle="One click from the Director POV (runs locally via connector).">
            <p className="small">
              Requires local connector + GitHub CLI. If export fails, the error message should tell you what to fix.
            </p>
            <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
              <label className="small" style={{ opacity: 0.9 }}>Repo name</label>
              <input
                style={{ maxWidth: 320 }}
                className="input"
                placeholder={journey?.seed?.goal ? `kindred-ship-pack-${journey.seed.goal}` : "kindred-ship-pack"}
                value={simpleRepoName}
                onChange={(e) => setSimpleRepoName(String(e.target.value || ""))}
              />
              <input
                style={{ maxWidth: 180 }}
                className="input"
                placeholder="Type EXPORT"
                value={simpleExportToken}
                onChange={(e) => setSimpleExportToken(String(e.target.value || ""))}
              />
              <PrimaryButton
                onClick={exportShipPackToGithub}
                disabled={
                  simpleBusy ||
                  !canExport ||
                  !journey ||
                  !readiness.ok ||
                  String(simpleExportToken || '').trim().toUpperCase() !== 'EXPORT' ||
                  (!review.shipLockedEffective && !simpleDraftAck)
                }
              >
                {simpleBusy ? "Exporting…" : (review.shipLockedEffective ? "Export locked pack" : "Export draft pack")}
              </PrimaryButton>
            </div>

            {!review.shipLockedEffective ? (
              <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, opacity: 0.9 }}>
                <input
                  type="checkbox"
                  checked={simpleDraftAck}
                  onChange={(e) => setSimpleDraftAck(Boolean(e.target.checked))}
                />
                I understand this is a draft export.
              </label>
            ) : null}
            {!canExport ? (
              <div className="small" style={{ marginTop: 10, opacity: 0.85 }}>
                Not connected yet. Connect AI (local connector) first.
              </div>
            ) : null}
            {canExport && !readiness.ok ? (
              <div className="small" style={{ marginTop: 10, opacity: 0.85 }}>
                Finish the Journey steps above before exporting.
              </div>
            ) : null}
            {review.shipPackLocked && review.shipLockOutOfDate ? (
              <div className="small" style={{ marginTop: 10, opacity: 0.85 }}>
                Locked ship pack is out of date. Re-lock to export a locked pack, or export a draft instead.
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    );
  }

  // Guided Director: keep this page mercilessly staged.
  // Full tooling remains available when Guided Mode is OFF.
  if (effectiveGuided) {
    return (
      <div className="container">
        <div className="hero">
          <h1>Ship</h1>
          <p>
            Your job here is simple: make sure the project is ready, download the deploy bundle, and publish it.
            The scary plumbing is still under the hood, but you don’t have to look at it.
          </p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <a className="btn secondary" href="/director/journey">Back to journey</a>
            <a className="btn secondary" href="/director/import">Start / import</a>
            <a className="btn" href="/director">Director Home</a>
          </div>
        </div>

        {notice ? (
          <Callout title={notice.title} tone={notice.kind === "error" ? "danger" : notice.kind === "warn" ? "warn" : "info"}>
            {notice.details && notice.details.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{notice.details.join("\n")}</pre> : null}
          </Callout>
        ) : null}

        {!state ? (
          <Callout title="No project yet" tone="warn" details={["Start a project in the Journey, then come back here to ship it."]} />
        ) : null}

        <div className="grid">
          <Panel title="1) Readiness checklist">
            <p className="small">
              If any item says WARN/FAIL, don’t panic. Click the suggested action.
            </p>
            <div className="hr" />
            <GateRow
              label="Plan"
              tri={specLocked ? "pass" : "warn"}
              detail={specLocked ? "Locked" : "Not locked yet"}
              primary={
                specLocked
                  ? { label: "View", href: "/director/journey" }
                  : { label: "Lock plan", href: "/director/journey" }
              }
            />
            <GateRow
              label="Layout draft"
              tri={blueprintTri}
              detail={blueprintTri === "pass" ? "Matches locked plan" : "Generate layout draft"}
              primary={
                blueprintTri === "pass"
                  ? { label: "View", href: "/director/journey" }
                  : { label: "Generate", onClick: compileBlueprintPackProposal, disabled: busy }
              }
            />
            <GateRow
              label="App Package"
              tri={repoTri}
              detail={repoLocked ? (lockedRepoBytesPresent ? "Locked and available" : "Locked but missing bytes") : "Not locked yet"}
              primary={
                repoLocked
                  ? { label: "Download", onClick: downloadLockedRepoPack, disabled: busy }
                  : repoProposalMeta
                    ? { label: "Lock app package", href: "/director/journey" }
                    : { label: "Build", onClick: compileRepoPackProposal, disabled: busy }
              }
            />
            <GateRow
              label="Check & proofs"
              tri={verifyTriForChecklist}
              detail={verifyLatest ? `overall: ${String(verifyLatest.overall).toUpperCase()}` : "Not run yet"}
              primary={{ label: "Open checks", href: "/director/journey" }}
            />
            <GateRow
              label="Backup file"
              tri={backupTri}
              detail={backupHistory ? "Recent backup recorded" : "Download one backup before shipping"}
              primary={{ label: "Download backup", onClick: downloadProjectBackup, disabled: busy }}
            />

            <div className="hr" />
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className={"pill " + (readyToShip.ok ? (readyToShip.warn ? "pill--warn" : "pill--success") : "pill--error")}>
                {readyToShip.ok ? (readyToShip.warn ? "READY (WARN)" : "READY") : "NOT READY"}
              </span>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                {nextPrimaryAction.href ? (
                  <PrimaryButton href={nextPrimaryAction.href}>{nextPrimaryAction.label}</PrimaryButton>
                ) : (
                  <PrimaryButton onClick={nextPrimaryAction.onClick} disabled={Boolean(nextPrimaryAction.disabled)}>
                    {nextPrimaryAction.label}
                  </PrimaryButton>
                )}
                <SecondaryButton href="/director/journey">Journey</SecondaryButton>
              </div>
            </div>
          </Panel>

          <Panel title="2) Export & deploy">
            <p className="small">
              The <strong>One-Move Deploy Bundle</strong> is a single ZIP containing your locked app repo pack plus a deploy checklist.
              It does not include secrets.
            </p>

            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <PrimaryButton onClick={downloadOneMoveDeployBundle} disabled={!repoLocked || busy}>
                Download One-Move Deploy Bundle
              </PrimaryButton>
              <SecondaryButton onClick={downloadLockedRepoPack} disabled={!repoLocked || busy}>
                Download app package only
              </SecondaryButton>
            </div>

            <div className="hr" />
            <Callout
              title="Deploy options (non-custodial)"
              tone="info"
              details={[
                "Export to GitHub happens via your local connector (it uses your subscription logins).",
                "Deploy by importing the repo into Vercel, or deploying locally with Vercel CLI.",
                "Never paste API keys into the browser. This surface stays non-custodial.",
              ]}
            />

            <div className="hr" />
            <Callout
              title="After deploy"
              tone="info"
              details={[
                "Open /api/selfcheck to verify runtime wiring.",
                "If you enabled AI, open /ai to confirm the server-side posture.",
                "If something feels wrong, revert by deploying the previous Repo Pack zip.",
              ]}
            />
          </Panel>

          <Panel title="3) Production sanity">
            <DeployLaneFitIndicator state={state} />
            <PublishReadyStatusPanel />
            <SelfCheckPanel />
            <div className="hr" />
            <EvidencePanel projectId={pid} />
          </Panel>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Ship</h1>
        <p>
          This page is the guided completion checklist. It keeps the order correct: lock your plan → generate the layout draft → build the app package → run checks →
          backup → release.
        </p>
        <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <strong>Rigor</strong>
          <select
            value={rigor}
            onChange={(e) => {
              const v = String(e.target.value || "safe") as RigorLevelV1;
              const next = v === "strict" || v === "audit" ? v : "safe";
              setRigor(next);
              try {
                setRigorLevel(pid, next);
              } catch {
                // ignore
              }
            }}
          >
            <option value="safe">Safe (WARN allowed)</option>
            <option value="strict">Strict (WARN blocks)</option>
            <option value="audit">Audit (WARN blocks)</option>
          </select>
          <span className="small" style={{ opacity: 0.9 }}>
            Safe lets you proceed with WARN; Strict/Audit require all PASS.
          </span>
        </div>
      </div>

      {notice ? (
        <Callout title={notice.title} tone={notice.kind === "error" ? "danger" : notice.kind === "warn" ? "warn" : "info"}>
          {notice.details && notice.details.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{notice.details.join("\n")}</pre> : null}
        </Callout>
      ) : null}

      {advancedMode ? (
        <>
          <Callout
            title="Hosted mode note"
            tone="info"
            details={[
              "On hosted deployments (e.g. Vercel), server writes are disabled by default.",
              "Demo evidence will download to your device and be recorded in the local Evidence ledger. To publish /dist artefacts, run publish_ready in CI/build.",
            ]}
          />

          <Panel title="Evidence + diagnostics (advanced)" subtitle="Useful for rehearsing the end-to-end story without claiming Proof Lane authority.">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0" }}>
              <SecondaryButton
                onClick={() => {
                  gpRecord("ship_export_click", "/director/ship", {});
                  const payload = gpExport(APP_VERSION);
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "golden_path_export.json";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}
              >
                Export Golden Path Evidence (download)
              </SecondaryButton>

              <SecondaryButton
                onClick={async () => {
                  gpRecord("ship_export_upload_click", "/director/ship", {});
                  try {
                    const payload = gpExport(APP_VERSION);
                    const res = await fetch("/api/evidence/upload", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ kind: "golden_path_export", payload }),
                    });
                    const j = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      alert(j?.hint || j?.error || `HTTP ${res.status}`);
                      return;
                    }
                    alert("Wrote: " + (j?.wrote || []).join(", "));
                  } catch (e: any) {
                    alert(String(e?.message || e || "Failed to upload evidence"));
                  }
                }}
              >
                Save Golden Path Evidence (local)
              </SecondaryButton>

              <SecondaryButton
                onClick={() => {
                  gpClear();
                  alert("Golden Path events cleared.");
                }}
              >
                Clear Golden Path Events
              </SecondaryButton>
            </div>
          </Panel>

          <PublishReadyStatusPanel />
          <DeployLaneFitIndicator state={state} />
        </>
      ) : null}

      {readyToShip.ok ? (
        <Callout title={readyToShip.warn ? "READY TO SHIP (WARN)" : "READY TO SHIP"} tone={readyToShip.warn ? "warn" : "success"}>
          <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span>Your packs are locked and proven. Next: export the locked Repo Pack ZIP and deploy.</span>
            <SecondaryButton href="/director/journey">Release checklist</SecondaryButton>
            <SecondaryButton onClick={downloadPublishReadyBundle} disabled={busy}>
              Download proof bundle
            </SecondaryButton>
            <SecondaryButton onClick={downloadLockedRepoPack} disabled={!lockedRepoBytesPresent}>
              Download locked Repo Pack
            </SecondaryButton>
          </div>
        </Callout>
      ) : null}

      <Panel title="Guided completion checklist">
        <GateRow
          label="1) Spec Pack"
          tri={specLocked ? "pass" : "warn"}
          detail={
            specLocked
              ? `Locked • pack sha ${shortSha(specGov?.last_locked?.pack_sha256)}… • zip sha ${shortSha(lockedSpecZipSha)}…`
              : "Not locked yet. Review proposals and lock the Spec Pack snapshot."
          }
          primary={!specLocked ? { label: "Adopt + lock", href: "/director/journey" } : undefined}
        />
        <div className="hr" />

        <GateRow
          label="2) Layout draft"
          tri={blueprintTri}
          detail={
            !bpMeta
              ? "Not generated yet. Generate a layout draft for the locked plan."
              : blueprintTri === "pass"
              ? `Matches locked spec zip sha ${shortSha(lockedSpecZipSha)}… • blueprint sha ${shortSha(bpMeta.blueprint_pack_sha256)}…`
              : `Out of date (or spec not locked): blueprint spec zip sha ${shortSha(bpSpecZipSha)}… vs locked spec zip sha ${shortSha(lockedSpecZipSha)}…`
          }
          primary={blueprintTri !== "pass" && specLocked ? { label: "Generate layout", onClick: compileBlueprintPackProposal, disabled: busy } : undefined}
          secondary={bpMeta ? { label: "Open viewer", href: "/director/journey" } : undefined}
        />
        <div className="hr" />

        <GateRow
          label="3) Repo Pack"
          tri={repoTri}
          detail={
            !repoLocked
              ? repoProposalMeta
                ? `Proposal present • pack sha ${shortSha(repoProposalMeta.pack_sha256)}… • adopt + lock in Repo Workbench`
                : "No locked snapshot yet. Compile a deterministic Repo Pack proposal, then adopt + lock."
              : lockedRepoBytesPresent
              ? `Locked • pack sha ${shortSha(repoGov?.last_locked?.pack_sha256)}… • bytes present`
              : "Locked governance exists, but ZIP bytes are missing. Re-lock the Repo Pack in Repo Workbench."
          }
          primary={
            !repoLocked
              ? repoProposalMeta
                ? { label: "Adopt + lock", href: "/director/journey" }
                : { label: "Compile proposal", onClick: compileRepoPackProposal, disabled: busy }
              : lockedRepoBytesPresent
              ? { label: "Download locked", onClick: downloadLockedRepoPack, disabled: !lockedRepoBytesPresent }
              : { label: "Fix lock", href: "/director/journey" }
          }
          secondary={{ label: "Repo Workbench", href: "/director/journey" }}
        />
        <div className="hr" />

        <GateRow
          label="4) Verify"
          tri={verifyTriForChecklist}
          detail={
            verifyLatest
              ? `Overall: ${String(verifyLatest.overall || "(unknown)").toUpperCase()} • ${verifyLatest.generated_at_utc || ""}${
                  rigor !== "safe" && verifyTri === "warn" ? " • WARN counts as FAIL under current Rigor" : ""
                }`
              : "No Verify report attached yet."
          }
          primary={{ label: verifyLatest && verifyTriForChecklist !== "fail" ? "View" : "Run verify", href: "/director/journey" }}
        />
        <div className="hr" />

        <GateRow
          label="5) Backup"
          tri={backupTri}
          detail={backupHistory ? `Last backup: ${backupHistory.last_backup_at_utc} • sha ${shortSha(backupHistory.backup_zip_sha256)}…` : "No backup exported yet."}
          primary={{ label: backupHistory ? "View" : "Export backup", href: "/director/journey" }}
        />
        <div className="hr" />

        <GateRow
          label="6) Release"
          tri={readyToShip.ok ? (readyToShip.warn ? "warn" : "pass") : "warn"}
          detail={
            readyToShip.ok
              ? readyToShip.warn
                ? "Ready to ship with warnings. Review the release checklist before deploying."
                : "Ready to ship. Review the release checklist, then deploy the locked Repo Pack ZIP."
              : "Not ready yet. Complete the steps above in order."
          }
          primary={{ label: "Release checklist", href: "/director/journey" }}
          secondary={readyToShip.ok ? { label: "Release guide", href: "/docs/release" } : undefined}
        />

        <div className="hr" />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div className="small">
            Next action:<strong style={{ marginLeft: 6 }}>{nextPrimaryAction.label}</strong>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <SecondaryButton href="/director/journey">Journey (hashes)</SecondaryButton>
            <SecondaryButton href="/director/journey">Proposals</SecondaryButton>
            <PrimaryButton
              href={(nextPrimaryAction as any).href}
              onClick={(nextPrimaryAction as any).onClick}
              disabled={Boolean((nextPrimaryAction as any).disabled)}
            >
              {nextPrimaryAction.label}
            </PrimaryButton>
          </div>
        </div>
      </Panel>

      <Panel title="One-move to Vercel (reduce back-and-forth)">
        <p style={{ marginTop: 0, opacity: 0.85 }}>
          If your goal is "deploy in one move", export a locked Repo Pack and a Deployment Pack together. This bundle contains no persisted secrets.
          It just packages the right artefacts + checklist so you stop arguing with Vercel.
        </p>

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <PrimaryButton onClick={downloadOneMoveDeployBundle} disabled={!repoLocked || busy}>
            Download one-move deploy bundle
          </PrimaryButton>
          <SecondaryButton onClick={downloadLockedRepoPack} disabled={!repoLocked}>
            Download locked Repo Pack
          </SecondaryButton>
          <SecondaryButton href="/docs/vercel-one-move">Read one-move guide</SecondaryButton>
        </div>

        {!repoLocked ? (
          <Callout
            tone="warn"
            title="Not ready yet"
            details={["Lock your Repo Pack first (Ship checklist step 3).", "Then this button becomes deterministic and useful."]}
          />
        ) : null}
      </Panel>
      {(!effectiveGuided || advancedMode) ? (
        <>
      <SelfCheckPanel />


      <FailureCapture projectId={pid} kits={adopted.kits} />

      <EvidencePanel projectId={pid} limit={12} />

      <Panel title="Release signoff (writes dist/publish_ready_signoff.json)">
        <p style={{ marginTop: 0, opacity: 0.85 }}>
          This is optional but recommended for public releases. It records a human reviewer signoff that can upgrade
          manual and EXTERNAL (book) checklist items in the next <code>publish_ready</code> run.
        </p>

        <div style={{ display: "grid", gap: 10, maxWidth: 720 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Reviewer name</span>
            <input
              value={signoffReviewer}
              onChange={(e) => setSignoffReviewer(e.target.value)}
              placeholder="e.g. Jane Doe"
              style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.25)", color: "inherit" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Release class</span>
            <select
              value={signoffReleaseClass}
              onChange={(e) => setSignoffReleaseClass(e.target.value as ReleaseClass)}
              style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.25)", color: "inherit" }}
            >
              <option value="internal_alpha">Internal Alpha</option>
              <option value="public_beta">Public Beta</option>
              <option value="ga">GA</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Exceptions (optional)</span>
            <textarea
              value={signoffExceptions}
              onChange={(e) => setSignoffExceptions(e.target.value)}
              placeholder="One item id per line, e.g. U16\nB10"
              rows={4}
              style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.25)", color: "inherit" }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <SecondaryButton
              onClick={async () => {
                try {
                  const res = await fetch("/dist/publish_ready_checklist.json", { cache: "no-store" });
                  if (!res.ok) throw new Error("Run publish_ready first (missing /dist/publish_ready_checklist.json)");
                  const checklist = await res.json().catch(() => ({}));
                  const items = Array.isArray(checklist?.items) ? checklist.items : [];
                  const exceptionSet = new Set(
                    String(signoffExceptions || "")
                      .split(/\r?\n/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                  );

                  const signoffItems = items
                    .filter((it: any) => it && typeof it.id === "string")
                    .filter((it: any) => it.status === "warn")
                    .map((it: any) => ({ id: String(it.id), status: exceptionSet.has(String(it.id)) ? "warn" : "pass" }));

                  const payloadItems = signoffItems;
                  const payloadExceptions = Array.from(exceptionSet);

                  if (!signoffReviewer.trim()) throw new Error("Reviewer name is required");
                  const j = await savePublishReadySignoff({
                    reviewer: signoffReviewer.trim(),
                    release_class: signoffReleaseClass,
                    exceptions: payloadExceptions,
                    items: payloadItems,
                  });
                  alert("Wrote: " + (j?.wrote || []).join(", "));
                } catch (e: any) {
                  alert(String(e?.message || e || "Failed to write signoff"));
                }
              }}
            >
              Generate signoff from latest checklist
            </SecondaryButton>

            <SecondaryButton href="/director/journey">Open release checklist</SecondaryButton>
          </div>
        </div>
      </Panel>
        </>
      ) : null}
      {advancedMode ? (

      <div className="grid2">
        <Panel title="Inputs (adopted)">
          <div>
            <div>
              <strong>Surface:</strong> {String(state?.intent?.primary_surface || "(not set)")}
            </div>
            <div>
              <strong>Palettes:</strong> {(state?.intent?.palettes || []).length}
            </div>
            <div>
              <strong>Libraries:</strong> {adopted.libs.length}
            </div>
            <div>
              <strong>Patterns:</strong> {adopted.pats.length}
            </div>
            <div>
              <strong>Integrations (bindings):</strong> {adopted.kits.length}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <SecondaryButton href="/director/journey">Journey (hashes & provenance)</SecondaryButton>
          </div>
        </Panel>

        <Panel title="Repo Pack compiler v1">
          <p>
            This step is deterministic: the same adopted Director state compiles the same Repo Pack. The exported repo includes
            <code> .kindred/spec_pack/</code> and <code>.kindred/blueprint_pack/</code> for auditing.
          </p>
          <div className="row" style={{ gap: 12, alignItems: "center", marginTop: 12 }}>
            <PrimaryButton onClick={compileRepoPackProposal} disabled={busy}>
              Compile Repo Pack proposal
            </PrimaryButton>
            <SecondaryButton href="/repo-workbench">Open Repo Workbench</SecondaryButton>
          </div>
          {lastRepoPackSha ? (
            <div style={{ marginTop: 12 }}>
              <div>
                <strong>Last compiled:</strong> {lastRepoName || "repo"}
              </div>
              <div>
                <strong>pack_sha256:</strong> {lastRepoPackSha}
              </div>
              <div style={{ marginTop: 8 }}>
                <SecondaryButton
                  onClick={() => {
                    if (!lastRepoPackBytes) return;
                    downloadBytes(`repo_pack_${safeFileName(lastRepoName)}.zip`, lastRepoPackBytes, "application/zip");
                  }}
                  disabled={!lastRepoPackBytes}
                >
                  Download proposal pack
                </SecondaryButton>
              </div>
            </div>
          ) : null}
        </Panel>

        <Panel title="Blueprint compiler v1">
          <p>
            Blueprint Pack is a deterministic UI blueprint derived from your Spec Pack (IA + low-fi layouts + tokens + adopted Libraries/Patterns/Integrations).
            It is embedded into generated repos at <code>.kindred/blueprint_pack/blueprint_pack.v1.json</code>.
          </p>
          <div className="row" style={{ gap: 12, alignItems: "center", marginTop: 12 }}>
            <PrimaryButton onClick={compileBlueprintPackProposal} disabled={busy}>
              Generate layout draft
            </PrimaryButton>
            {lastBlueprintJson ? (
              <SecondaryButton
                onClick={() => {
                  if (!lastBlueprintJson) return;
                  const bytes = new TextEncoder().encode(lastBlueprintJson);
                  downloadBytes(`blueprint_pack_${safeFileName(state?.project?.name || "project")}.json`, bytes, "application/json");
                }}
              >
                Download
              </SecondaryButton>
            ) : null}
          </div>
          {lastBlueprintSha ? (
            <div style={{ marginTop: 12 }}>
              <div>
                <strong>blueprint_pack_sha256:</strong> {lastBlueprintSha}
              </div>
              <div>
                <strong>spec_pack_sha256:</strong> {lastBlueprintSpecSha}
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
      ) : null}
    </div>
  );
}

function downloadEvidenceJson(filename: string, payload: any) {
  const text = stableJsonText(payload) + "\n";
  const bytes = new TextEncoder().encode(text);
  const blob = new Blob([bytes], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

async function uploadEvidenceOrFallback(args: {
  projectId: string;
  kind: string;
  filename: string;
  title: string;
  payload: any;
}) {
  const projectId = String(args.projectId || "default");
  const kind = String(args.kind || "");
  const filename = String(args.filename || "evidence.json");

  try {
    const res = await fetch("/api/evidence/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, payload: args.payload }),
    });

    const j = await res.json().catch(() => ({}));
    if (res.ok) return j;

    // Hosted deployments: server writes are disabled by default.
    if (res.status === 403 && (j?.error === "server_write_disabled" || j?.error === "server_exec_disabled")) {
      const card = appendEvidenceCard({
        project_id: projectId,
        // evidence ledger kinds are flexible; we use the artefact kind string
        kind: kind as any,
        title: args.title,
        summary: `Server writes disabled; downloaded ${filename} and recorded in local evidence ledger`,
        data: { filename, payload: args.payload },
      });
      downloadEvidenceJson(filename, args.payload);
      return { ok: true, local: true, wrote: [`download/${filename}`, `ledger/${card.id}`] };
    }

    throw new Error(String(j?.hint || j?.error || `HTTP ${res.status}`));
  } catch (e: any) {
    // If the request failed in a way that looks like a hosted environment, fall back to local evidence.
    const msg = String(e?.message || e || "");
    if (msg.includes("server_write_disabled")) {
      const card = appendEvidenceCard({
        project_id: projectId,
        kind: kind as any,
        title: args.title,
        summary: `Server writes disabled; downloaded ${filename} and recorded in local evidence ledger`,
        data: { filename, payload: args.payload },
      });
      downloadEvidenceJson(filename, args.payload);
      return { ok: true, local: true, wrote: [`download/${filename}`, `ledger/${card.id}`] };
    }
    throw e;
  }
}

function demoFailureRecordPayload(projectId: string) {
  return {
    schema: "kindred.failure_record.v1",
    id: "f_demo_19800101_000000",
    created_at_utc: "1980-01-01T00:00:00.000Z",
    project_id: projectId,
    stage: "build",
    environment: "vercel",
    log_redacted: true,
    log_excerpt: "Demo failure: build error collecting page data (redacted).",
    log_sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    notes: "Deterministic demo record (no user logs).",
  };
}

async function saveDemoFailureRecord(projectId: string = "demo_project") {
  const payload = demoFailureRecordPayload(projectId);
  return await uploadEvidenceOrFallback({
    projectId: projectId,
    kind: "failure_record",
    filename: "failure_record.json",
    title: "Failure record (demo)",
    payload,
  });
}


function demoUxWalkthroughNotesPayload() {
  return {
    schema: "kindred.kernel_min_walkthrough_notes.v1",
    created_at_utc: "1980-01-01T00:00:00.000Z",
    app_version: APP_VERSION,
    scope: "Spark→Ship rail + no free-text requirements intake (demo)",
    assertions: [
      { id: "U1", claim: "Default flow is a single coherent rail (Spark→Ship)", status: "pass", evidence: "Manual demo evidence written via Ship page" },
      { id: "U2", claim: "No beginner step requires free-text requirement entry", status: "pass", evidence: "Intake uses selection rails; free-text is optional notes only" },
      { id: "U3", claim: "Advanced mode is explicit opt-in and never required", status: "pass", evidence: "Advanced toggles exist but default flow does not require them" },
      { id: "U6", claim: "Every route has a next action or return path", status: "pass", evidence: "Nav rail + breadcrumbs; demo evidence" },
      { id: "U7", claim: "Empty states are guided", status: "pass", evidence: "Guided empty states; demo evidence" },
      { id: "U8", claim: "Navigation is consistent and predictable", status: "pass", evidence: "Global nav pattern; demo evidence" },
    ],
    notes: "Deterministic demo notes artefact (no user data). Use real signoff for releases.",
  };
}

async function saveDemoUxWalkthroughNotes() {
  const payload = demoUxWalkthroughNotesPayload();
  return await uploadEvidenceOrFallback({
    projectId: "demo_project",
    kind: "ux_walkthrough_notes",
    filename: "ux_walkthrough_notes.json",
    title: "UX walkthrough notes (demo)",
    payload,
  });
}


function demoTelemetryAssertionPayload() {
  return {
    schema: "kindred.telemetry_assertion.v1",
    created_at_utc: "1980-01-01T00:00:00.000Z",
    app_version: APP_VERSION,
    telemetry_present: false,
    telemetry_opt_in: false,
    notes: "Deterministic demo assertion: telemetry is off by default and no analytics providers are included.",
  };
}

async function saveDemoTelemetryAssertion() {
  const payload = demoTelemetryAssertionPayload();
  return await uploadEvidenceOrFallback({
    projectId: "demo_project",
    kind: "telemetry_assertion",
    filename: "telemetry_assertion.json",
    title: "Telemetry assertion (demo)",
    payload,
  });
}


function demoPolicyRealityAssertionPayload() {
  return {
    schema: "kindred.policy_reality_assertion.v1",
    created_at_utc: "1980-01-01T00:00:00.000Z",
    app_version: APP_VERSION,
    privacy: "/privacy states local-first storage and no server persistence by default.",
    terms: "/terms states acceptable use and no warranties for generated code.",
    data_model: "docs/data_model.md",
    storage: { local_first: true, server_persistence_default: false, exports_user_triggered: true },
    telemetry: { present: false, opt_in_required: false },
    ai_usage: { hosted_optional: true, server_only: true, proposal_only: true, keys_never_logged: true },
    notes: "Deterministic demo assertion. For real release, verify and sign off items explicitly.",
  };
}

async function saveDemoPolicyRealityAssertion() {
  const payload = demoPolicyRealityAssertionPayload();
  return await uploadEvidenceOrFallback({
    projectId: "demo_project",
    kind: "policy_reality_assertion",
    filename: "policy_reality_assertion.json",
    title: "Policy reality assertion (demo)",
    payload,
  });
}


function demoVercelDeployChecklistPayload() {
  return {
    schema: "kindred.vercel_deploy_checklist.v1",
    created_at_utc: "1980-01-01T00:00:00.000Z",
    app_version: APP_VERSION,
    items: [
      { id: "V3", claim: "Preview deployments exist for every PR", status: "pass", evidence: "Vercel Git integration enabled (demo assertion)" },
      { id: "V5", claim: "Build caches/steps controlled (no mystery build)", status: "pass", evidence: "Pinned lockfile + publish_ready gates (demo assertion)" },
      { id: "V4", claim: "Rollback procedure exists and is tested", status: "pass", evidence: "docs/rollback.md" },
    ],
    notes: "Deterministic demo checklist. For a real release, verify in Vercel UI and record sign-off.",
  };
}

async function saveDemoVercelDeployChecklist() {
  const payload = demoVercelDeployChecklistPayload();
  return await uploadEvidenceOrFallback({
    projectId: "demo_project",
    kind: "vercel_deploy_checklist",
    filename: "vercel_deploy_checklist.json",
    title: "Vercel deploy checklist (demo)",
    payload,
  });
}


function demoAiPostureAssertionPayload() {
  return {
    schema: "kindred.ai_posture_assertion.v1",
    created_at_utc: "1980-01-01T00:00:00.000Z",
    app_version: APP_VERSION,
    proposal_only: true,
    server_only: true,
    keys_server_side: true,
    notes: "Deterministic demo assertion: AI is optional; server routes are proposal-only; keys remain server-side.",
  };
}

async function saveDemoAiPostureAssertion() {
  const payload = demoAiPostureAssertionPayload();
  return await uploadEvidenceOrFallback({
    projectId: "demo_project",
    kind: "ai_posture_assertion",
    filename: "ai_posture_assertion.json",
    title: "AI posture assertion (demo)",
    payload,
  });
}


async function demoPackDeterminismAssertionPayload() {
  const state = demoDeterministicState();

  const specA = buildSpecPack(state, { include_council_dsl: false });
  const specB = buildSpecPack(state, { include_council_dsl: false });

  const specShaA = await sha256Hex(specA);
  const specShaB = await sha256Hex(specB);

  const repoA = await compileRepoPackFromDirectorState({ state, include_council_dsl: false });
  const repoB = await compileRepoPackFromDirectorState({ state, include_council_dsl: false });

  if (!repoA.ok) throw new Error(String((repoA as any).error?.message || "Repo pack A failed"));
  if (!repoB.ok) throw new Error(String((repoB as any).error?.message || "Repo pack B failed"));

  const repoShaA = await sha256Hex(repoA.zipBytes);
  const repoShaB = await sha256Hex(repoB.zipBytes);

  return {
    schema: "kindred.pack_determinism_assertion.v1",
    created_at_utc: "1980-01-01T00:00:00.000Z",
    app_version: APP_VERSION,
    spec_pack_zip_sha256_a: specShaA,
    spec_pack_zip_sha256_b: specShaB,
    repo_pack_zip_sha256_a: repoShaA,
    repo_pack_zip_sha256_b: repoShaB,
    checks: {
      spec_pack_deterministic: specShaA === specShaB,
      repo_pack_deterministic: repoShaA === repoShaB,
    },
    notes: "Deterministic demo assertion. Packs built twice from identical deterministic demo state.",
  };
}

async function saveDemoPackDeterminismAssertion() {
  const payload = demoPackDeterminismAssertionPayload();
  return await uploadEvidenceOrFallback({
    projectId: "demo_project",
    kind: "pack_determinism_assertion",
    filename: "pack_determinism_assertion.json",
    title: "Pack determinism assertion (demo)",
    payload,
  });
}


function packCloneWithoutPath(pack: any, removePath: string) {
  const files = (pack.files || []).filter((f: any) => f.path !== removePath);
  const fileMap = new Map<string, any>();
  for (const f of files) fileMap.set(f.path, f);
  return { files, fileMap };
}

function summarizeValidation(report: any) {
  const issues = Array.isArray(report?.issues) ? report.issues : [];
  const errors = issues.filter((i: any) => i?.severity === "error");
  const warns = issues.filter((i: any) => i?.severity === "warn");
  const info = issues.filter((i: any) => i?.severity === "info");
  return {
    issue_count: issues.length,
    error_count: errors.length,
    warn_count: warns.length,
    info_count: info.length,
    first_error: errors.length ? { code: errors[0]?.code, file: errors[0]?.file, message: errors[0]?.message } : null,
  };
}

async function demoValidatorSmokeAssertionPayload() {
  const state = demoDeterministicState();
  const zipBytes = buildSpecPack(state, { include_council_dsl: false });
  const pack = readZip(zipBytes);

  const positiveReport = validateSpecPack(pack);
  const positiveSummary = summarizeValidation(positiveReport);

  // Negative case: remove manifest (required)
  const negativePack = packCloneWithoutPath(pack as any, "spec_pack_manifest.json");
  const negativeReport = validateSpecPack(negativePack as any);
  const negativeSummary = summarizeValidation(negativeReport);

  return {
    schema: "kindred.validator_smoke_assertion.v1",
    created_at_utc: "1980-01-01T00:00:00.000Z",
    app_version: APP_VERSION,
    positive_case: {
      description: "Deterministic demo spec pack validates without errors.",
      ...positiveSummary,
      pass: positiveSummary.error_count === 0,
    },
    negative_case: {
      description: "Invalid spec pack (missing manifest) produces at least one error.",
      ...negativeSummary,
      pass: negativeSummary.error_count > 0,
    },
    notes: "Validator smoke test: proves schema-locked validator produces errors for invalid packs and stays green for valid packs.",
  };
}

async function saveDemoValidatorSmokeAssertion() {
  const payload = demoValidatorSmokeAssertionPayload();
  return await uploadEvidenceOrFallback({
    projectId: "demo_project",
    kind: "validator_smoke_assertion",
    filename: "validator_smoke_assertion.json",
    title: "Validator smoke assertion (demo)",
    payload,
  });
}


function normalizeProjectStateForCompare(st: any, forcedProjectId: string) {
  const c = JSON.parse(JSON.stringify(st || {}));
  if (!c.project || typeof c.project !== "object") c.project = {};
  c.project.id = forcedProjectId;
  // Ensure deterministic ordering for hash via stableJsonText.
  return c;
}

async function demoBackupRestoreAssertionPayload() {
  const sourceProjectId = "p_demo_backup";
  const targetProjectId = "p_demo_restored";

  const demo = demoDeterministicState();
  demo.project.id = sourceProjectId;

  // 1) Save deterministic state into local storage
  await saveProjectStateById(sourceProjectId, demo);

  // 2) Export backup zip
  const backup = await buildProjectBackupZip(sourceProjectId);
  if (!backup.ok) throw new Error(String(backup.error || "Backup export failed"));

  const backupZipSha = await sha256Hex(backup.zipBytes);

  // 3) Restore into new project id
  const restored = await restoreProjectBackupZip(backup.zipBytes, { target_project_id: targetProjectId });
  if (!restored.ok) throw new Error(String(restored.error || "Backup restore failed"));

  // 4) Load restored state
  const restoredState = await loadProjectStateById(targetProjectId);

  const srcNorm = normalizeProjectStateForCompare(demo, targetProjectId);
  const dstNorm = normalizeProjectStateForCompare(restoredState, targetProjectId);

  const srcHash = await sha256Hex(new TextEncoder().encode(stableJsonText(srcNorm, 2)));
  const dstHash = await sha256Hex(new TextEncoder().encode(stableJsonText(dstNorm, 2)));

  return {
    schema: "kindred.backup_restore_assertion.v1",
    created_at_utc: "1980-01-01T00:00:00.000Z",
    app_version: APP_VERSION,
    source_project_id: sourceProjectId,
    target_project_id: targetProjectId,
    backup_zip_sha256: backupZipSha,
    source_state_sha256: srcHash,
    restored_state_sha256: dstHash,
    checks: {
      restore_round_trip_state_equal: srcHash === dstHash,
    },
    notes: "Deterministic demo assertion: export backup then restore and compare normalized state hashes.",
  };
}

async function saveDemoBackupRestoreAssertion() {
  const payload = demoBackupRestoreAssertionPayload();
  return await uploadEvidenceOrFallback({
    projectId: "demo_project",
    kind: "backup_restore_assertion",
    filename: "backup_restore_assertion.json",
    title: "Backup/restore assertion (demo)",
    payload,
  });
}


async function saveGoldenPathExportUpload(projectId: string = "demo_project") {
  const payload = gpExport(APP_VERSION);
  return await uploadEvidenceOrFallback({
    projectId,
    kind: "golden_path_export",
    filename: "golden_path_export.json",
    title: "Golden path export",
    payload,
  });
}

type ReleaseClass = "internal_alpha" | "public_beta" | "ga";

const RELEASE_CLASS_LABEL: Record<ReleaseClass, string> = {
  internal_alpha: "Internal Alpha",
  public_beta: "Public Beta",
  ga: "GA",
};

function normalizeReleaseClassInput(x: string): ReleaseClass {
  const s = String(x || "").toLowerCase().trim();
  if (s === "ga") return "ga";
  if (s === "public beta" || s === "public_beta" || s === "public-beta") return "public_beta";
  return "internal_alpha";
}

async function savePublishReadySignoff(input: {
  reviewer: string;
  release_class: ReleaseClass;
  exceptions: string[];
  items: { id: string; status: "pass" | "warn" }[];
  projectId?: string;
}) {
  const payload = {
    schema: "kindred.publish_ready_signoff.v1",
    signed_at_utc: new Date().toISOString(),
    reviewer: input.reviewer,
    release_class: input.release_class,
    items: input.items,
    exceptions: input.exceptions,
  };

  return await uploadEvidenceOrFallback({
    projectId: String(input.projectId || "demo_project"),
    kind: "publish_ready_signoff",
    filename: "publish_ready_signoff.json",
    title: "Publish-ready signoff",
    payload,
  });
}

async function fetchBytes(path: string): Promise<ArrayBuffer> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}: ${res.status} ${res.statusText}`);
  }
  return await res.arrayBuffer();
}

async function saveAllDemoEvidence() {
  const wrote: string[] = [];
  const pushWrote = (j: any) => {
    const w = Array.isArray(j?.wrote) ? j.wrote : [];
    for (const x of w) wrote.push(String(x));
  };

  // Upload deterministic snapshots and demo assertions
  pushWrote(await saveGoldenPathExportUpload("demo_project"));
  pushWrote(await saveDemoFailureRecord("demo_project"));
  pushWrote(await saveDemoUxWalkthroughNotes());
  pushWrote(await saveDemoTelemetryAssertion());
  pushWrote(await saveDemoPolicyRealityAssertion());
  pushWrote(await saveDemoVercelDeployChecklist());
  pushWrote(await saveDemoAiPostureAssertion());
  pushWrote(await saveDemoPackDeterminismAssertion());
  pushWrote(await saveDemoValidatorSmokeAssertion());
  pushWrote(await saveDemoBackupRestoreAssertion());

  return { wrote };
}


