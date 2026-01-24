"use client";

import React, { useEffect, useMemo, useState } from "react";
import { appendAiReceipt, estimateTokensFromText, estimateUsdFromUsage, loadAiBudget, preflightAiSpend } from "../../lib/ai_spend";
import { zipDeterministic } from "../../lib/deterministic_zip";
import { stableJsonText } from "../../lib/stable_json";
import { buildDeterminismReport } from "../../lib/determinism_report";
import { buildProjectBackupZip } from "../../lib/project_backup";
import { Panel } from "../../components/Panel";
import { DangerButton, SecondaryButton } from "../../components/Buttons";
import { Callout } from "../../components/Callout";
import { GateReportView } from "../../components/GateReportView";
import { ValidationReportView } from "../../components/ValidationReportView";
import { JsonTree } from "../../components/JsonTree";
import { BrownfieldDeltaView } from "../../components/BrownfieldDeltaView";
import {
  SpecPack,
  SpecPackFile,
  asText,
  decodeBase64,
  encodeBase64,
  getManifest,
  tryReadZip,
  validateManifest,
  tryParseJson,
} from "../../lib/spec_pack";
import { buildCurrentStateSpecPackZip, tryReadBrownfieldInventoryPack } from "../../lib/brownfield";
import { computeBrownfieldDeltaReport } from "../../lib/brownfield_delta";
import { GateReport, runGates } from "../../lib/gates";
import { validateSpecPack } from "../../lib/validation";
import { PackDiff, diffSpecPacks } from "../../lib/pack_diff";
import { AnyProposal, deleteProposal, isApplyable, loadProposals, saveProposal } from "../../lib/proposals";
import { applyPatchToPack, buildPatchFromPacks, SpecPackPatchV1 } from "../../lib/spec_pack_patch";
import { MergeGroups, MergeSource, mergeProposalGroups, describePack } from "../../lib/pack_merge";
import { compileSPELToProposalPack } from "../../lib/spel";
import {
  LEGACY_LAST_BASE_PACK_KEY,
  LEGACY_LAST_PROPOSAL_PACK_KEY,
  getCurrentProjectId,
  lastBasePackKeyForProject,
  lastProposalPackKeyForProject,
  loadProjectStateById,
  resetProject,
} from "../../lib/state";
import { diagnoseImportedPack, type PackDiagnostics, type NoticeKind } from "../../lib/import_diagnostics";
import {
  PackGovernanceV1,
  computePackHash,
  getLockedPackB64,
  isPackLocked,
  lockCurrentBasePack,
  lockFromApplyablePatch,
  unlockPack,
  getPackGovernance,
} from "../../lib/pack_governance";

import {
  addSnapshot,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshotToProject,
  type SnapshotV1,
} from "../../lib/snapshots";

type AiProposalKind = "tokens" | "lofi_layouts" | "copy_blocks";

type AiProposal = {
  id: string;
  kind: AiProposalKind;
  summary: string;
  rationale?: string;
  proposal_pack_b64: string;
  score?: number;
  score_notes?: string[];
};



function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

function resolvePackKeys(kind: "base" | "proposal"): { scoped: string; legacy: string } {
  let pid = "";
  try {
    pid = getCurrentProjectId();
  } catch {
    pid = "";
  }
  const projectId = pid || "p_unknown";
  if (kind === "base") {
    return { scoped: lastBasePackKeyForProject(projectId), legacy: LEGACY_LAST_BASE_PACK_KEY };
  }
  return { scoped: lastProposalPackKeyForProject(projectId), legacy: LEGACY_LAST_PROPOSAL_PACK_KEY };
}

function readPackB64(kind: "base" | "proposal"): string {
  const keys = resolvePackKeys(kind);
  try {
    return localStorage.getItem(keys.scoped) || localStorage.getItem(keys.legacy) || "";
  } catch {
    return "";
  }
}

function writePackB64(kind: "base" | "proposal", b64: string) {
  const keys = resolvePackKeys(kind);
  try {
    localStorage.setItem(keys.scoped, b64);
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(keys.legacy, b64);
  } catch {
    // ignore
  }
}

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

function shortId(): string {
  const rand = Math.random().toString(16).slice(2);
  return `p_${Date.now().toString(36)}_${rand.slice(0, 6)}`;
}

function fileKindLabel(kind: string): string {
  if (kind === "added") return "ADDED";
  if (kind === "removed") return "REMOVED";
  if (kind === "modified") return "MODIFIED";
  return "UNCHANGED";
}

export default function WorkbenchPage() {
  const [projectId, setProjectId] = useState<string>(() => {
    try {
      return getCurrentProjectId();
    } catch {
      return "";
    }
  });

  const [governance, setGovernance] = useState<PackGovernanceV1 | null>(null);
  const [governanceStatus, setGovernanceStatus] = useState<string>("");

  const [basePack, setBasePack] = useState<SpecPack | null>(null);
  const [proposalPack, setProposalPack] = useState<SpecPack | null>(null);

  const [secondaryKey, setSecondaryKey] = useState<string>("none");
  const [secondaryPack, setSecondaryPack] = useState<SpecPack | null>(null);
  const [secondaryGate, setSecondaryGate] = useState<GateReport | null>(null);
  const [secondaryStatus, setSecondaryStatus] = useState<string>("");

  const [mergeGroups, setMergeGroups] = useState<MergeGroups>({
    tokens: "current",
    layout: "base",
    brand: "base",
    copy: "base",
    ux: "base",
  });
  const [mergeBuiltStatus, setMergeBuiltStatus] = useState<string>("");

  const [baseGate, setBaseGate] = useState<GateReport | null>(null);
  const [proposalGate, setProposalGate] = useState<GateReport | null>(null);

  const [selectedPath, setSelectedPath] = useState<string>("spec_pack_manifest.json");
  const [selectedPointer, setSelectedPointer] = useState<string | null>(null);
  const [notice, setNotice] = useState<PackDiagnostics | null>(null);

  const [showUnchanged, setShowUnchanged] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<"patch" | "base" | "proposal" | "full">("patch");

  const [proposals, setProposals] = useState<AnyProposal[]>([]);
  const [proposalSummary, setProposalSummary] = useState<string>("");
  const [patchOverride, setPatchOverride] = useState<string | null>(null);

  const [applyablePatch, setApplyablePatch] = useState<SpecPackPatchV1 | null>(null);
  const [patchBuildStatus, setPatchBuildStatus] = useState<string>("");
  const [applyStatus, setApplyStatus] = useState<string>("");

  const [aiKind, setAiKind] = useState<AiProposalKind>("tokens");
  const [aiGoal, setAiGoal] = useState<string>("");
  const [aiStatus, setAiStatus] = useState<string>("");
  const [aiProposals, setAiProposals] = useState<AiProposal[]>([]);

  const [spelEditorText, setSddlEditorText] = useState<string>("");
  const [spelStatus, setSddlStatus] = useState<string>("");

  const [snapshots, setSnapshots] = useState<SnapshotV1[]>([]);
  const [snapshotStatus, setSnapshotStatus] = useState<string>("");
  const [resetBackupFirst, setResetBackupFirst] = useState<boolean>(true);
  const [resetAlsoClearSnapshots, setResetAlsoClearSnapshots] = useState<boolean>(false);

  const [verifyStatus, setVerifyStatus] = useState<string>("");
  const [verifyWarnings, setVerifyWarnings] = useState<string[]>([]);

  const locked = useMemo(() => {
    if (governance && governance.status === "locked") return true;
    if (!projectId) return false;
    return isPackLocked(projectId);
  }, [governance, projectId]);

  const [basePackHash, setBasePackHash] = useState<string>("");
  const [proposalPackHash, setProposalPackHash] = useState<string>("");

  function clearNotice() {
    setNotice(null);
  }

  function setNoticeMsg(kind: NoticeKind, headline: string, details: string[] = []) {
    setNotice({ kind, headline, details });
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!basePack) {
        setBasePackHash("");
        return;
      }
      try {
        const report = await computePackHash(basePack);
        if (!cancelled) setBasePackHash(report.pack_sha256);
      } catch {
        if (!cancelled) setBasePackHash("");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [basePack]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!proposalPack) {
        setProposalPackHash("");
        return;
      }
      try {
        const report = await computePackHash(proposalPack);
        if (!cancelled) setProposalPackHash(report.pack_sha256);
      } catch {
        if (!cancelled) setProposalPackHash("");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [proposalPack]);

  function refreshProjectId() {
    try {
      setProjectId(getCurrentProjectId());
    } catch {
      setProjectId("");
    }
  }

  function refreshGovernance() {
    if (!projectId) {
      setGovernance(null);
      return;
    }
    try {
      setGovernance(getPackGovernance(projectId));
    } catch {
      setGovernance(null);
    }
  }


  useEffect(() => {
    try {
      setProposals(loadProposals());
    } catch {
      setProposals([]);
    }
  }, []);

  useEffect(() => {
    const refreshPid = () => {
      try {
        setProjectId(getCurrentProjectId());
      } catch {
        setProjectId("");
      }
    };
    refreshPid();
    window.addEventListener("kindred_project_changed", refreshPid);
    return () => window.removeEventListener("kindred_project_changed", refreshPid);
  }, []);

  useEffect(() => {
    const refreshGov = () => {
      if (!projectId) {
        setGovernance(null);
        return;
      }
      try {
        setGovernance(getPackGovernance(projectId));
      } catch {
        setGovernance(null);
      }
    };
    refreshGov();
    window.addEventListener("kindred_governance_changed", refreshGov);
    window.addEventListener("kindred_project_changed", refreshGov);
    return () => {
      window.removeEventListener("kindred_governance_changed", refreshGov);
      window.removeEventListener("kindred_project_changed", refreshGov);
    };
  }, [projectId]);

  useEffect(() => {
    const refreshSnaps = () => {
      if (!projectId) {
        setSnapshots([]);
        return;
      }
      try {
        setSnapshots(listSnapshots(projectId));
      } catch {
        setSnapshots([]);
      }
    };
    refreshSnaps();
    window.addEventListener("kindred_snapshots_changed", refreshSnaps);
    window.addEventListener("kindred_project_changed", refreshSnaps);
    return () => {
      window.removeEventListener("kindred_snapshots_changed", refreshSnaps);
      window.removeEventListener("kindred_project_changed", refreshSnaps);
    };
  }, [projectId]);

  // Secondary proposal (for merging): resolve from saved patches or AI proposals.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setSecondaryStatus("");
      setSecondaryPack(null);
      setSecondaryGate(null);

      if (secondaryKey === "none") return;

      if (secondaryKey.startsWith("saved:")) {
        if (!basePack) {
          setSecondaryStatus("Import a Base pack first (secondary proposals need a base to apply against). ");
          return;
        }
        const id = secondaryKey.slice("saved:".length);
        const p = proposals.find((x) => x.id === id) || null;
        if (!p || !isApplyable(p)) {
          setSecondaryStatus("Secondary proposal must be applyable (v2).");
          return;
        }
        setSecondaryStatus("Applying saved proposal to base...");
        try {
          const r = await applyPatchToPack(basePack, p.patch);
          if (cancelled) return;
          if (!r.ok) {
            setSecondaryStatus(`${r.error} (${r.details.length} issues)`);
            return;
          }
          setSecondaryPack(r.mergedPack);
          setSecondaryGate(runGates(r.mergedPack));
          setSecondaryStatus(`Loaded secondary from saved proposal: ${p.patch.summary || p.summary}`);
          return;
        } catch (e: any) {
          if (cancelled) return;
          setSecondaryStatus(`Failed to apply saved proposal: ${String(e?.message || e)}`);
          return;
        }
      }

      if (secondaryKey.startsWith("ai:")) {
        const id = secondaryKey.slice("ai:".length);
        const p = aiProposals.find((x) => x.id === id) || null;
        if (!p) {
          setSecondaryStatus("AI proposal not found (regenerate proposals). ");
          return;
        }
        setSecondaryStatus("Loading AI proposal pack...");
        try {
          const bytes = decodeBase64(p.proposal_pack_b64);
          const r = tryReadZip(bytes);
          if (!r.ok) {
            setSecondaryStatus(`AI proposal ZIP invalid: ${r.error.message}`);
            return;
          }
          const pack = r.pack;
          if (cancelled) return;
          setSecondaryPack(pack);
          setSecondaryGate(runGates(pack));
          setSecondaryStatus(`Loaded secondary from AI proposal: ${p.summary}`);
          return;
        } catch (e: any) {
          if (cancelled) return;
          setSecondaryStatus(`Failed to load AI proposal: ${String(e?.message || e)}`);
          return;
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [secondaryKey, basePack, proposals, aiProposals]);

  function updateMergeGroup(key: keyof MergeGroups, value: MergeSource) {
    setMergeGroups({ ...mergeGroups, [key]: value });
  }

  function buildMergedProposal() {
    setMergeBuiltStatus("");
    if (!basePack || !proposalPack) {
      setMergeBuiltStatus("Import Base + Proposal packs first.");
      return;
    }
    if (!secondaryPack) {
      setMergeBuiltStatus("Select a secondary proposal pack (saved or AI) to merge against.");
      return;
    }

    // Operator safety: snapshot before mutating the Proposal slot.
    takeSnapshot("Before merge proposal", "merge_proposal", { silent: true });

    const r = mergeProposalGroups({ base: basePack, current: proposalPack, secondary: secondaryPack, groups: mergeGroups });
    if (!r.ok) {
      setMergeBuiltStatus(r.error);
      return;
    }

    setProposalPack(r.merged);
    setProposalGate(runGates(r.merged));
    setMergeBuiltStatus(`Built merged proposal: ${describePack(r.merged)}${r.warnings.length ? ` (warnings: ${r.warnings.length})` : ""}`);

    // Store as "last proposal" so the session can reload it.
    try {
      writePackB64("proposal", encodeBase64(r.mergedZip));
    } catch {
      // ignore
    }

    // Also set a human-friendly summary.
    const s = `Merged proposal (tokens=${mergeGroups.tokens}, layout=${mergeGroups.layout}, brand=${mergeGroups.brand}, ux=${mergeGroups.kernel_min})`;
    setProposalSummary(s);
    setNoticeMsg("info", "Merged proposal loaded into Proposal slot.", ["Review diffs, then Save / Apply as usual."]);
  }

  const baseManifest = useMemo(() => (basePack ? getManifest(basePack) : null), [basePack]);
  const proposalManifest = useMemo(() => (proposalPack ? getManifest(proposalPack) : null), [proposalPack]);

  const baseValidation = useMemo(() => (basePack ? validateManifest(basePack) : null), [basePack]);
  const proposalValidation = useMemo(() => (proposalPack ? validateManifest(proposalPack) : null), [proposalPack]);

  const baseSpecValidationReport = useMemo(() => (basePack ? validateSpecPack(basePack) : null), [basePack]);
  const proposalSpecValidationReport = useMemo(() => (proposalPack ? validateSpecPack(proposalPack) : null), [proposalPack]);

  const packDiff: PackDiff | null = useMemo(() => {
    if (!basePack || !proposalPack) return null;
    return diffSpecPacks(basePack, proposalPack);
  }, [basePack, proposalPack]);

  const brownfieldDelta = useMemo(() => {
    if (!basePack || !proposalPack) return null;
    try {
      return computeBrownfieldDeltaReport({
        basePack,
        proposalPack,
        baseMeta: baseManifest ? { project_id: baseManifest.project_id, created_at_utc: baseManifest.created_at_utc } : null,
        proposalMeta: proposalManifest ? { project_id: proposalManifest.project_id, created_at_utc: proposalManifest.created_at_utc } : null,
        basePackSha256: basePackHash || null,
        proposalPackSha256: proposalPackHash || null,
      });
    } catch {
      return null;
    }
  }, [basePack, proposalPack, baseManifest, proposalManifest, basePackHash, proposalPackHash]);

  // Build an applyable patch (includes sha-guarded ops + full patch text).
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setApplyablePatch(null);
      setPatchBuildStatus("");
      if (!basePack || !proposalPack || !packDiff) return;

      setPatchBuildStatus("Computing applyable patch (sha256)...");
      try {
        const patch = await buildPatchFromPacks({
          base: basePack,
          proposal: proposalPack,
          patch_text: packDiff.fullPatch,
          summary: proposalSummary.trim() || "Spec Pack proposal",
          stats: packDiff.stats,
        });
        if (cancelled) return;
        setApplyablePatch(patch);
        setPatchBuildStatus(`Applyable patch ready (${patch.ops.length} ops).`);
      } catch (e: any) {
        if (cancelled) return;
        setPatchBuildStatus(`Failed to compute applyable patch: ${String(e?.message || e)}`);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [basePack, proposalPack, packDiff, proposalSummary]);

  const diffFiles = useMemo(() => {
    if (!packDiff) return [];
    if (showUnchanged) return packDiff.files;
    return packDiff.files.filter((f) => f.kind !== "unchanged");
  }, [packDiff, showUnchanged]);

  const selectedDiff = useMemo(() => {
    if (!packDiff) return null;
    return packDiff.files.find((f) => f.path === selectedPath) || null;
  }, [packDiff, selectedPath]);

  const baseSelectedFile: SpecPackFile | null = useMemo(() => {
    if (!basePack) return null;
    return basePack.fileMap.get(selectedPath) || null;
  }, [basePack, selectedPath]);

  const proposalSelectedFile: SpecPackFile | null = useMemo(() => {
    if (!proposalPack) return null;
    return proposalPack.fileMap.get(selectedPath) || null;
  }, [proposalPack, selectedPath]);

  const baseSelectedText = useMemo(() => {
    if (!baseSelectedFile) return "";
    return asText(baseSelectedFile);
  }, [baseSelectedFile]);

  const proposalSelectedText = useMemo(() => {
    if (!proposalSelectedFile) return "";
    return asText(proposalSelectedFile);
  }, [proposalSelectedFile]);

  // Keep the SPEL editor in sync when the selected file is a .spel.
  useEffect(() => {
    if (!selectedPath.endsWith(".spel")) return;
    const src = proposalSelectedFile ? proposalSelectedText : baseSelectedText;
    setSddlEditorText(src || "");
    setSddlStatus("");
  }, [selectedPath, proposalSelectedFile, proposalSelectedText, baseSelectedText]);

  const baseSelectedJson = useMemo(() => {
    if (!baseSelectedFile) return null;
    const parsed = tryParseJson<any>(baseSelectedText);
    return parsed.ok ? parsed.value : null;
  }, [baseSelectedFile, baseSelectedText]);

  const proposalSelectedJson = useMemo(() => {
    if (!proposalSelectedFile) return null;
    const parsed = tryParseJson<any>(proposalSelectedText);
    return parsed.ok ? parsed.value : null;
  }, [proposalSelectedFile, proposalSelectedText]);

  // Auto-pick a summary when both packs exist.
  useEffect(() => {
    if (!baseManifest?.ok || !proposalManifest?.ok || !packDiff) return;
    const baseId = baseManifest.manifest.project_id;
    const propId = proposalManifest.manifest.project_id;
    const s = `Spec Pack proposal: ${baseId} → ${propId} (${packDiff.stats.modified} modified, ${packDiff.stats.added} added, ${packDiff.stats.removed} removed)`;
    setProposalSummary(s);
  }, [baseManifest, proposalManifest, packDiff]);

  // Auto-select first changed file when diff is computed.
  useEffect(() => {
    if (!packDiff) return;
    if (selectedPath && selectedPath !== "spec_pack_manifest.json") return;
    const first = packDiff.files.find((f) => f.kind !== "unchanged");
    if (first) setSelectedPath(first.path);
  }, [packDiff, selectedPath]);

  async function importZip(file: File): Promise<Uint8Array> {
    const buf = await file.arrayBuffer();
    return new Uint8Array(buf);
  }


  function packToZipBytes(pack: SpecPack): Uint8Array {
    const files: Record<string, Uint8Array> = {};
    for (const f of pack.files) files[f.path] = f.bytes;
  return zipDeterministic(files, { level: 6 });
  }
  async function scoreAiProposalPack(b64: string): Promise<{ score: number; notes: string[] }> {
    const notes: string[] = [];
    try {
      const bytes = decodeBase64(b64);
      const r = tryReadZip(bytes);
      if (!r.ok) return { score: 0, notes: ["ZIP invalid: " + r.error.message] };
      const pack = r.pack;
      const validation = validateSpecPack(pack);
      const gates = runGates(pack);
      const errors = validation.issues.filter((i) => i.severity === "error").length;
      const warns = validation.issues.filter((i) => i.severity === "warn").length;
      let score = 100;
      score -= errors * 25;
      score -= warns * 5;
      if (gates.status === "fail") score -= 30;
      if (score < 0) score = 0;
      if (errors > 0) notes.push(`${errors} validation error(s)`);
      if (warns > 0) notes.push(`${warns} warning(s)`);
      if (gates.status === "fail") notes.push("Gates: FAIL");
      if (gates.status === "pass") notes.push("Gates: PASS");
      return { score, notes };
    } catch (e: any) {
      return { score: 0, notes: ["Scoring failed: " + String(e?.message || e)] };
    }
  }

  async function generateAiProposals() {
    setAiStatus("");
    setAiProposals([]);
    if (!basePack) {
      setAiStatus("Import a Base pack first.");
      return;
    }

    let baseZipB64 = "";
    try {
      baseZipB64 = readPackB64("base") || "";
    } catch {
      baseZipB64 = "";
    }

    if (!baseZipB64) {
      try {
        const bytes = packToZipBytes(basePack);
        baseZipB64 = encodeBase64(bytes);
      } catch (e: any) {
        setAiStatus(`Failed to build base zip: ${String(e?.message || e)}`);
        return;
      }
    }

    // Spend preflight (local-only, non-custodial)
    try {
      const goalTok = Math.min(1500, estimateTokensFromText(aiGoal || "", 1500));
      const basePrompt = aiKind === "tokens" ? 1800 : aiKind === "lofi_layouts" ? 2600 : 3000;
      const baseCompletion = aiKind === "tokens" ? 900 : aiKind === "lofi_layouts" ? 1400 : 2200;
      const estUsage = {
        prompt_tokens: basePrompt + goalTok,
        completion_tokens: baseCompletion,
        total_tokens: basePrompt + goalTok + baseCompletion,
      };
      const pf = preflightAiSpend({ estimated_usage: estUsage, route: "/api/ai/propose-pack" });
      const fmtUsd = (n: number) => (Number.isFinite(n) ? "$" + (n < 1 ? n.toFixed(4) : n.toFixed(2)) : "$0.00");
      if (!pf.allow) {
        if (pf.hard) {
          setAiStatus(
            `Blocked by local hard cap. Est. run=${fmtUsd(pf.estimated_cost_usd)}, window=${fmtUsd(pf.window_total_usd)} / hard=${fmtUsd(
              pf.budget.hard_cap_usd
            )}. See /usage.`
          );
          return;
        }
        const ok = confirm(
          `${pf.reason}\n\nThis run is estimated at ${fmtUsd(pf.estimated_cost_usd)}. Your window total is ${fmtUsd(
            pf.window_total_usd
          )} (soft cap ${fmtUsd(pf.budget.soft_cap_usd)}).\n\nRun anyway?`
        );
        if (!ok) {
          setAiStatus("Cancelled (soft cap).\n\nTip: adjust caps/rates in /usage.");
          return;
        }
      }
    } catch {
      // If the guard fails, we don't block execution.
    }

    setAiStatus(`Requesting proposals (${aiKind})...`);
    try {
      const resp = await fetch("/api/ai/propose-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: aiKind, goal: aiGoal, base_pack_b64: baseZipB64 }),
      });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) {
        setAiStatus(`AI proposal failed: ${String(data?.error || resp.statusText)}`);
        return;
      }

      // Local receipt (if provider returned usage)
      try {
        if (data?.usage && typeof data.usage === "object") {
          const usage = {
            prompt_tokens: typeof data.usage.prompt_tokens === "number" ? data.usage.prompt_tokens : undefined,
            completion_tokens: typeof data.usage.completion_tokens === "number" ? data.usage.completion_tokens : undefined,
            total_tokens: typeof data.usage.total_tokens === "number" ? data.usage.total_tokens : undefined,
          };
          const budget = loadAiBudget();
          const estCost = estimateUsdFromUsage(usage, budget);
          appendAiReceipt({
            schema: "kindred.ai_receipt.v1",
            ts_utc: new Date().toISOString(),
            route: "/api/ai/propose-pack",
            mode: (data?.mode === "offline" || data?.mode === "hosted" || data?.mode === "local" ? data.mode : "unknown") as any,
            model: typeof data?.model === "string" ? data.model : undefined,
            usage,
            estimated_cost_usd: estCost,
            note: `workbench:${aiKind}`,
          });
        }
      } catch {
        // ignore
      }
      const arrRaw = Array.isArray(data?.proposals) ? data.proposals : [];
      const typed: AiProposal[] = [];
      for (const p of arrRaw) {
        if (!p || typeof p !== "object") continue;
        if (typeof p.id !== "string" || typeof p.summary !== "string" || typeof p.proposal_pack_b64 !== "string") continue;
        typed.push({
          id: p.id,
          kind: aiKind,
          summary: p.summary,
          rationale: typeof p.rationale === "string" ? p.rationale : undefined,
          proposal_pack_b64: p.proposal_pack_b64,
        });
      }

      // Deterministic ranking (local)
      const scored: AiProposal[] = [];
      for (const p of typed) {
        const scoredOne = await scoreAiProposalPack(p.proposal_pack_b64);
        scored.push({ ...p, score: scoredOne.score, score_notes: scoredOne.notes });
      }
      scored.sort((a, b) => (b.score || 0) - (a.score || 0));

      setAiProposals(scored);
      setAiStatus(`Received ${scored.length} proposal(s) (mode=${String(data?.mode || "unknown")}).`);
    } catch (e: any) {
      setAiStatus(`AI proposal failed: ${String(e?.message || e)}`);
    }
  }



  async function loadAiProposalPack(b64: string, summary: string) {
    clearNotice();
    setPatchOverride(null);
    setAiStatus("");
    try {
      const bytes = decodeBase64(b64);
      const r = tryReadZip(bytes);
      if (!r.ok) {
        setAiStatus(`AI proposal ZIP invalid: ${r.error.message}`);
        return;
      }
      const p = r.pack;
      setProposalPack(p);
      setProposalGate(runGates(p));
      setProposalSummary(summary);
      try {
        writePackB64("proposal", encodeBase64(bytes));
      } catch {
        // ignore
      }
      if (p.fileMap.has("spec_pack_manifest.json")) setSelectedPath("spec_pack_manifest.json");
      else setSelectedPath(p.files[0]?.path || "");
      setAiStatus("Loaded AI proposal into Proposal slot.");
    } catch (e: any) {
      setAiStatus(`Failed to load AI proposal: ${String(e?.message || e)}`);
    }
  }
  async function onUploadBase(file: File) {
    clearNotice();
    setPatchOverride(null);
    if (locked) {
      setNoticeMsg("warn", "This project is LOCKED.", ["Unlock before changing the Base pack."]);
      return;
    }
    try {
      const bytes = await importZip(file);
      const r = tryReadZip(bytes);
      if (!r.ok) {
        setNoticeMsg("error", "Failed to import Base ZIP", [r.error.message]);
        return;
      }
      const p = r.pack;
      setBasePack(p);
      setBaseGate(runGates(p));
      try {
        writePackB64("base", encodeBase64(bytes));
      } catch {
        // ignore
      }
      if (p.fileMap.has("spec_pack_manifest.json")) setSelectedPath("spec_pack_manifest.json");
      else setSelectedPath(p.files[0]?.path || "");
      setNotice(diagnoseImportedPack(p, "Base"));
    } catch (e: any) {
      setNoticeMsg("error", "Failed to import Base ZIP", [String(e?.message || e)]);
    }
  }

  async function onUploadBrownfieldInventoryAsBase(file: File) {
    clearNotice();
    setPatchOverride(null);
    if (locked) {
      setNoticeMsg("warn", "This project is LOCKED.", ["Unlock before setting Base from brownfield inventory."]);
      return;
    }
    try {
      const bytes = await importZip(file);
      const inv = tryReadBrownfieldInventoryPack(bytes);
      if (!inv.ok) {
        setNoticeMsg("error", "Not a Brownfield Inventory Pack", [inv.error]);
        return;
      }
      const derived = buildCurrentStateSpecPackZip(inv.report);
      const r = tryReadZip(derived);
      if (!r.ok) {
        setNoticeMsg("error", "Failed to build Current-State Spec Pack", [r.error.message]);
        return;
      }
      const p = r.pack;
      setBasePack(p);
      setBaseGate(runGates(p));
      try {
        writePackB64("base", encodeBase64(derived));
      } catch {
        // ignore
      }
      if (p.fileMap.has("brownfield/inventory.json")) setSelectedPath("brownfield/inventory.json");
      else if (p.fileMap.has("spec_pack_manifest.json")) setSelectedPath("spec_pack_manifest.json");
      else setSelectedPath(p.files[0]?.path || "");
      setNoticeMsg("success", "Imported brownfield inventory as Base", ["Derived a Current-State Spec Pack from the inventory report."]);
    } catch (e: any) {
      setNoticeMsg("error", "Failed to import inventory ZIP", [String(e?.message || e)]);
    }
  }


  async function onUploadProposal(file: File) {
    clearNotice();
    setPatchOverride(null);
    try {
      const bytes = await importZip(file);
      const r = tryReadZip(bytes);
      if (!r.ok) {
        setNoticeMsg("error", "Failed to import Proposal ZIP", [r.error.message]);
        return;
      }
      const p = r.pack;
      setProposalPack(p);
      setProposalGate(runGates(p));
      try {
        writePackB64("proposal", encodeBase64(bytes));
      } catch {
        // ignore
      }
      if (p.fileMap.has("spec_pack_manifest.json")) setSelectedPath("spec_pack_manifest.json");
      else setSelectedPath(p.files[0]?.path || "");
      setNotice(diagnoseImportedPack(p, "Proposal"));
    } catch (e: any) {
      setNoticeMsg("error", "Failed to import Proposal ZIP", [String(e?.message || e)]);
    }
  }

  function loadLastBase() {
    clearNotice();
    setPatchOverride(null);
    try {
      const b64 = readPackB64("base");
      if (!b64) {
        setNoticeMsg("info", "No Base pack found in this browser.");
        return;
      }
      const bytes = decodeBase64(b64);
      const r = tryReadZip(bytes);
      if (!r.ok) {
        setNoticeMsg("error", "Saved Base ZIP is invalid", [r.error.message]);
        return;
      }
      const p = r.pack;
      setBasePack(p);
      setBaseGate(runGates(p));
      if (p.fileMap.has("spec_pack_manifest.json")) setSelectedPath("spec_pack_manifest.json");
      else setSelectedPath(p.files[0]?.path || "");
      setNotice(diagnoseImportedPack(p, "Base"));
    } catch (e: any) {
      setNoticeMsg("error", "Failed to load Base pack", [String(e?.message || e)]);
    }
  }

  function loadLastProposal() {
    clearNotice();
    setPatchOverride(null);
    try {
      const b64 = readPackB64("proposal");
      if (!b64) {
        setNoticeMsg("info", "No Proposal pack found in this browser.");
        return;
      }
      const bytes = decodeBase64(b64);
      const r = tryReadZip(bytes);
      if (!r.ok) {
        setNoticeMsg("error", "Saved Proposal ZIP is invalid", [r.error.message]);
        return;
      }
      const p = r.pack;
      setProposalPack(p);
      setProposalGate(runGates(p));
      if (p.fileMap.has("spec_pack_manifest.json")) setSelectedPath("spec_pack_manifest.json");
      else setSelectedPath(p.files[0]?.path || "");
      setNotice(diagnoseImportedPack(p, "Proposal"));
    } catch (e: any) {
      setNoticeMsg("error", "Failed to load Proposal pack", [String(e?.message || e)]);
    }
  }

  function clearAll() {
    setBasePack(null);
    setProposalPack(null);
    setBaseGate(null);
    setProposalGate(null);
    setSelectedPath("spec_pack_manifest.json");
    clearNotice();
    setPatchOverride(null);
  }

  function takeSnapshot(label: string, reason: string, opts?: { silent?: boolean }): void {
    if (!projectId) {
      if (!opts?.silent) setSnapshotStatus("No current project selected.");
      return;
    }

    let projectStateJson: string | undefined = undefined;
    try {
      const st = loadProjectStateById(projectId);
      projectStateJson = JSON.stringify(st);
    } catch {
      projectStateJson = undefined;
    }

    let baseB64 = "";
    try {
      baseB64 = readPackB64("base") || "";
    } catch {
      baseB64 = "";
    }
    if (!baseB64 && basePack) {
      try {
        baseB64 = encodeBase64(packToZipBytes(basePack));
      } catch {
        baseB64 = "";
      }
    }

    let proposalB64 = "";
    try {
      proposalB64 = readPackB64("proposal") || "";
    } catch {
      proposalB64 = "";
    }
    if (!proposalB64 && proposalPack) {
      try {
        proposalB64 = encodeBase64(packToZipBytes(proposalPack));
      } catch {
        proposalB64 = "";
      }
    }

    let govJson: string | undefined = undefined;
    try {
      const g = getPackGovernance(projectId);
      govJson = g ? JSON.stringify(g) : undefined;
    } catch {
      govJson = undefined;
    }

    let lockedB64: string | undefined = undefined;
    try {
      const b = getLockedPackB64(projectId);
      lockedB64 = b || undefined;
    } catch {
      lockedB64 = undefined;
    }

    try {
      addSnapshot(projectId, {
        label,
        reason,
        project_state_json: projectStateJson,
        base_pack_b64: baseB64 || undefined,
        proposal_pack_b64: proposalB64 || undefined,
        pack_governance_json: govJson,
        locked_pack_b64: lockedB64,
      });
      try {
        setSnapshots(listSnapshots(projectId));
      } catch {
        // ignore
      }
      if (!opts?.silent) setSnapshotStatus(`Snapshot saved: ${label}`);
    } catch {
      if (!opts?.silent) setSnapshotStatus("Failed to save snapshot (storage may be full).");
    }
  }

  function clearPackCache(kind: "base" | "proposal") {
    if (!projectId) return;
    const scoped = kind === "base" ? lastBasePackKeyForProject(projectId) : lastProposalPackKeyForProject(projectId);
    const legacy = kind === "base" ? LEGACY_LAST_BASE_PACK_KEY : LEGACY_LAST_PROPOSAL_PACK_KEY;
    try {
      localStorage.removeItem(scoped);
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(legacy);
    } catch {
      // ignore
    }
  }

  function clearBaseNow() {
    if (!projectId) {
      setNoticeMsg("warn", "No current project selected.");
      return;
    }
    const ok = window.confirm(
      "Clear the Base pack cached for this project?\n\nThis does not delete any files on disk; it only clears the in-browser cache.\nYou can restore from Snapshots.",
    );
    if (!ok) return;
    takeSnapshot("Before clear Base", "clear_base", { silent: true });
    clearPackCache("base");
    setBasePack(null);
    setBaseGate(null);
    setApplyStatus("");
    setPatchBuildStatus("");
    setNoticeMsg("success", "Cleared Base pack cache for this project.");
  }

  function clearProposalNow() {
    if (!projectId) {
      setNoticeMsg("warn", "No current project selected.");
      return;
    }
    const ok = window.confirm(
      "Clear the Proposal pack cached for this project?\n\nThis does not delete any files on disk; it only clears the in-browser cache.\nYou can restore from Snapshots.",
    );
    if (!ok) return;
    takeSnapshot("Before clear Proposal", "clear_proposal", { silent: true });
    clearPackCache("proposal");
    setProposalPack(null);
    setProposalGate(null);
    setApplyStatus("");
    setPatchBuildStatus("");
    setNoticeMsg("success", "Cleared Proposal pack cache for this project.");
  }

  function discardPatchOpsNow() {
    const ok = window.confirm(
      "Discard local patch operations (override text) for this session?\n\nThis resets the patch preview back to the deterministic diff between Base and Proposal.",
    );
    if (!ok) return;
    takeSnapshot("Before discard patch ops", "discard_patch_ops", { silent: true });
    setPatchOverride(null);
    setApplyStatus("");
    setPatchBuildStatus("");
    setNoticeMsg("success", "Discarded patch override. Patch preview reset.");
  }

  async function downloadProjectBackupZip() {
    if (!projectId) {
      setNoticeMsg("warn", "No current project selected.");
      return;
    }
    const r = await buildProjectBackupZip(projectId);
    if (!r.ok) {
      setNoticeMsg("error", r.error, r.details);
      return;
    }
    const safeName = String(r.meta.project_name || "project").trim().toLowerCase().replace(/[^a-z0-9\-_.]+/g, "-").slice(0, 40) || "project";
    downloadBytes(
      `kindred_backup__${safeName}__${projectId}__${new Date().toISOString().slice(0, 10)}.zip`,
      r.zipBytes,
      "application/zip",
    );
    setNoticeMsg("success", "Downloaded backup ZIP (v2).", ["Includes IndexedDB Repo Packs (when present), verify reports, enabled kits list, dogfood report, snapshots, and governance."]);
  }

  async function runVerify() {
    setVerifyStatus("Verifying hashes...");
    setVerifyWarnings([]);
    const warns: string[] = [];

    try {
      // Base
      if (basePack) {
        const b64 = readPackB64("base");
        if (!b64) {
          warns.push("Base: no saved Base pack ZIP found in local storage.");
        } else {
          const bytes = decodeBase64(b64);
          const r = tryReadZip(bytes);
          if (!r.ok) warns.push(`Base: saved ZIP could not be read (${r.error}).`);
          else {
            const h = await computePackHash(r.pack);
            if (basePackHash && h.pack_sha256 !== basePackHash) {
              warns.push(`Base: drift detected (saved ${h.pack_sha256.slice(0, 12)}… != loaded ${basePackHash.slice(0, 12)}…).`);
            }
          }
        }
      }

      // Proposal
      if (proposalPack) {
        const b64 = readPackB64("proposal");
        if (!b64) {
          warns.push("Proposal: no saved Proposal pack ZIP found in local storage.");
        } else {
          const bytes = decodeBase64(b64);
          const r = tryReadZip(bytes);
          if (!r.ok) warns.push(`Proposal: saved ZIP could not be read (${r.error}).`);
          else {
            const h = await computePackHash(r.pack);
            if (proposalPackHash && h.pack_sha256 !== proposalPackHash) {
              warns.push(`Proposal: drift detected (saved ${h.pack_sha256.slice(0, 12)}… != loaded ${proposalPackHash.slice(0, 12)}…).`);
            }
          }
        }
      }

      // Locked snapshot drift (if locked)
      if (projectId) {
        const rep = await buildDeterminismReport({ project_id: projectId });
        if (rep.locked?.drift?.length) {
          for (const d of rep.locked.drift) warns.push(`Locked: ${d}`);
        }
      }
    } catch (e: any) {
      warns.push(`Verify failed: ${String(e?.message || e || "unknown error")}`);
    }

    setVerifyWarnings(warns);
    if (warns.length === 0) setVerifyStatus("Verified: no drift detected.");
    else setVerifyStatus(`Verify complete: ${warns.length} warning(s).`);
  }

  async function downloadDeterminismReportJson() {
    if (!projectId) {
      setNoticeMsg("warn", "No current project selected.");
      return;
    }

    try {
      const baseB64 = readPackB64("base");
      const proposalB64 = readPackB64("proposal");
      const rep = await buildDeterminismReport({
        project_id: projectId,
        base_pack: basePack || undefined,
        base_pack_zip_bytes: baseB64 ? decodeBase64(baseB64) : undefined,
        proposal_pack: proposalPack || undefined,
        proposal_pack_zip_bytes: proposalB64 ? decodeBase64(proposalB64) : undefined,
        patch: applyablePatch,
      });

      const date = new Date().toISOString().slice(0, 10);
      downloadText(`kindred_determinism_report__${projectId}__${date}.json`, stableJsonText(rep, 2));
      setNoticeMsg("success", "Downloaded determinism report.", [
        "Includes pack hashes, per-file hashes, patch ops hash, and locked drift checks.",
      ]);
    } catch (e: any) {
      setNoticeMsg("error", "Failed to build determinism report.", [String(e?.message || e || "unknown error")]);
    }
  }

  function resetProjectSafely() {
    if (!projectId) {
      setNoticeMsg("warn", "No current project selected.");
      return;
    }
    let projectName = projectId;
    try {
      projectName = loadProjectStateById(projectId)?.project?.name || projectId;
    } catch {
      projectName = projectId;
    }

    const typed = window.prompt(
      `Reset project "${projectName}" (${projectId})?\n\nThis clears cached packs and resets builder state to defaults.\nType RESET to confirm.`,
    );
    if (typed !== "RESET") {
      setNoticeMsg("info", "Reset cancelled.");
      return;
    }

    takeSnapshot("Before reset project", "reset_project", { silent: true });
    if (resetBackupFirst) {
      downloadProjectBackupZip();
    }
    try {
      resetProject(projectId);
    } catch {
      // ignore
    }
    clearAll();
    refreshGovernance();
    setNoticeMsg("success", "Project reset.", ["Builder state reset, pack caches cleared, and truth unlocked."]);
  }

  function restoreSnapshotNow(snapshotId: string) {
    if (!projectId) {
      setNoticeMsg("warn", "No current project selected.");
      return;
    }

    const ok = window.confirm(
      "Restore this snapshot?\n\nThis will overwrite the local project state, cached packs, and governance in this browser.\nA snapshot of the current state will be taken first.",
    );
    if (!ok) return;

    takeSnapshot("Before restore snapshot", "restore_snapshot", { silent: true });
    const r = restoreSnapshotToProject(projectId, snapshotId);
    if (!r.ok) {
      setNoticeMsg("error", "Failed to restore snapshot.", [r.error]);
      return;
    }

    // Reload from caches and refresh governance.
    clearAll();
    refreshProjectId();
    refreshGovernance();
    loadLastBase();
    loadLastProposal();
    try {
      setSnapshots(listSnapshots(projectId));
    } catch {
      // ignore
    }

    setNoticeMsg("success", "Snapshot restored.", ["Base, Proposal, builder state, and governance were restored (local-only)."]);
  }

  function deleteSnapshotNow(snapshotId: string) {
    if (!projectId) return;
    const ok = window.confirm("Delete this snapshot? This cannot be undone.");
    if (!ok) return;
    try {
      deleteSnapshot(projectId, snapshotId);
      setSnapshots(listSnapshots(projectId));
      setSnapshotStatus("Snapshot deleted.");
    } catch {
      setSnapshotStatus("Failed to delete snapshot.");
    }
  }

  function saveCurrentProposal() {
    if (!packDiff || !applyablePatch) {
      setNoticeMsg("info", "Import Base + Proposal packs to generate a patch.");
      return;
    }

    const p = {
      schema: "kindred.proposal.v2" as const,
      id: shortId(),
      created_at_utc: new Date().toISOString(),
      summary: proposalSummary.trim() || "Spec Pack proposal",
      patch: { ...applyablePatch, summary: proposalSummary.trim() || applyablePatch.summary },
    };

    const next = saveProposal(p);
    setProposals(next);
    setNoticeMsg("success", "Saved applyable proposal to this browser.");
  }

  function compileSddlEditorToProposal() {
    setSddlStatus("");
    if (!basePack) {
      setSddlStatus("Import a Base pack first.");
      return;
    }
    if (!spelEditorText.trim()) {
      setSddlStatus("SPEL editor is empty.");
      return;
    }

    const r = compileSPELToProposalPack({ basePack, spelText: spelEditorText });
    if (!r.ok) {
      const msg = r.warnings.length ? `${r.error} (warnings: ${r.warnings.join("; ")})` : r.error;
      setSddlStatus(msg);
      return;
    }

    setProposalPack(r.mergedPack);
    setProposalGate(runGates(r.mergedPack));
    setPreviewTab("proposal");
    setSelectedPath("blueprint/hello.spel");
    setProposalSummary("SPEL compile proposal");

    try {
      const bytes = packToZipBytes(r.mergedPack);
      writePackB64("proposal", encodeBase64(bytes));
    } catch {
      // ignore
    }

    if (r.warnings.length > 0) setSddlStatus(`Compiled with warnings: ${r.warnings.join("; ")}`);
    else setSddlStatus("Compiled SPEL into Proposal pack. Review diffs, then save/apply as usual.");
    setNoticeMsg("success", "SPEL compiled into Proposal pack.", ["Review diffs, then Save / Apply as usual."]);
  }

  async function applyPatchAndDownload(patch: SpecPackPatchV1) {
    setApplyStatus("");
    if (locked) {
      setApplyStatus("This project is LOCKED. Unlock before applying a patch to Base.");
      return;
    }
    if (!basePack) {
      setApplyStatus("Import a base pack first.");
      return;
    }

    // Operator safety: snapshot before applying a patch to Base.
    takeSnapshot("Before apply patch", "apply_patch", { silent: true });

    setApplyStatus("Applying patch...");
    try {
      const result = await applyPatchToPack(basePack, patch);
      if (!result.ok) {
        setApplyStatus(`${result.error} (${result.details.length} issues)`);
        return;
      }

      const baseId = baseManifest?.ok ? baseManifest.manifest.project_id : "base";
      const propId = patch.proposal_project_id || "proposal";
      const filename = `spec_pack_merged__${baseId}__patched__${propId}.zip`;
      downloadBytes(filename, result.mergedZip, "application/zip");

      // Also load the merged pack as the new base, so users can continue iterating.
      setBasePack(result.mergedPack);
      setBaseGate(runGates(result.mergedPack));
      try {
        writePackB64("base", encodeBase64(result.mergedZip));
      } catch {
        // ignore
      }
      if (result.warnings.length > 0) setApplyStatus(`Applied with warnings: ${result.warnings.join("; ")}`);
      else setApplyStatus("Applied patch and downloaded merged pack.");
      if (result.warnings.length > 0) {
        setNoticeMsg("warn", "Applied patch with warnings", [
          `Download started: ${filename}`,
          ...result.warnings.map((w) => String(w)),
        ]);
      } else {
        setNoticeMsg("success", "Applied patch and downloaded merged pack.", [
          `Download started: ${filename}`,
          "Merged pack was also loaded into the Base slot for continued iteration.",
        ]);
      }
    } catch (e: any) {
      setApplyStatus(`Failed to apply patch: ${String(e?.message || e)}`);
      setNoticeMsg("error", "Failed to apply patch", [String(e?.message || e)]);
    }
  }

  async function adoptAndLock(patch: SpecPackPatchV1) {
    setGovernanceStatus("");
    if (!projectId) {
      setGovernanceStatus("No current project selected.");
      return;
    }
    if (locked) {
      setGovernanceStatus("This project is already LOCKED. Unlock before adopting a new proposal.");
      return;
    }
    if (!basePack) {
      setGovernanceStatus("Import a Base pack first.");
      return;
    }

    // Operator safety: snapshot before adopting and locking.
    takeSnapshot("Before adopt+lock", "adopt_and_lock", { silent: true });

    let baseZipBytes: Uint8Array;
    try {
      const baseB64 = readPackB64("base") || "";
      baseZipBytes = baseB64 ? decodeBase64(baseB64) : packToZipBytes(basePack);
    } catch {
      baseZipBytes = packToZipBytes(basePack);
    }

    let proposalZipBytes: Uint8Array | undefined;
    if (proposalPack) {
      try {
        const propB64 = readPackB64("proposal") || "";
        proposalZipBytes = propB64 ? decodeBase64(propB64) : packToZipBytes(proposalPack);
      } catch {
        proposalZipBytes = packToZipBytes(proposalPack);
      }
    }

    setGovernanceStatus("Adopting proposal and locking...");
    const res = await lockFromApplyablePatch({ projectId, basePack, baseZipBytes, proposalZipBytes, patch });
    if (!res.ok) {
      const extra = res.details && res.details.length ? ` (${res.details.join("; ")})` : "";
      setGovernanceStatus(`${res.error}${extra}`);
      return;
    }

    // Adopt: make the merged pack the new Base.
    setBasePack(res.mergedPack);
    setBaseGate(runGates(res.mergedPack));
    try {
      writePackB64("base", encodeBase64(res.mergedZip));
    } catch {
      // ignore
    }

    setGovernance(res.governance);
    const short = res.snapshot.pack_sha256.slice(0, 10);
    setGovernanceStatus(`Adopted proposal and LOCKED truth pack (${short}...).`);
    setNoticeMsg("success", "Adopted proposal and locked the Base pack as truth.");
  }

  async function lockCurrentBaseNow() {
    setGovernanceStatus("");
    if (!projectId) {
      setGovernanceStatus("No current project selected.");
      return;
    }
    if (locked) {
      setGovernanceStatus("This project is already LOCKED.");
      return;
    }
    if (!basePack) {
      setGovernanceStatus("Import a Base pack first.");
      return;
    }

    // Operator safety: snapshot before locking.
    takeSnapshot("Before lock current Base", "lock_base", { silent: true });

    let baseZipBytes: Uint8Array;
    try {
      const b64 = readPackB64("base") || "";
      baseZipBytes = b64 ? decodeBase64(b64) : packToZipBytes(basePack);
    } catch {
      baseZipBytes = packToZipBytes(basePack);
    }

    setGovernanceStatus("Locking current Base pack...");
    const res = await lockCurrentBasePack({ projectId, basePack, baseZipBytes });
    if (!res.ok) {
      setGovernanceStatus(res.error);
      return;
    }
    // Ensure Base persists (even if this was loaded from memory only).
    try {
      writePackB64("base", encodeBase64(baseZipBytes));
    } catch {
      // ignore
    }
    setGovernance(res.governance);
    const short = res.snapshot.pack_sha256.slice(0, 10);
    setGovernanceStatus(`LOCKED current Base pack as truth (${short}...).`);
    setNoticeMsg("success", "Locked current Base pack as truth.", [
      `Locked pack hash: ${res.snapshot.pack_sha256}`,
      "Use Unlock only when you intentionally want a new working copy and lineage.",
    ]);
  }

  function unlockNow() {
    setGovernanceStatus("");
    if (!projectId) {
      setGovernanceStatus("No current project selected.");
      return;
    }
    if (!locked) {
      setGovernanceStatus("This project is already unlocked.");
      return;
    }
    const ok = window.confirm(
      "Unlock lineage for this project?\n\nThis does not delete the locked truth snapshot, but it will allow edits again.\nA snapshot will be taken first.",
    );
    if (!ok) return;

    takeSnapshot("Before unlock", "unlock", { silent: true });
    const g = unlockPack(projectId);
    setGovernance(g);
    const from = g.working?.from_locked_pack_sha256 ? g.working.from_locked_pack_sha256.slice(0, 10) : "";
    setGovernanceStatus(from ? `Unlocked (working copy from ${from}...).` : "Unlocked (working copy).");
  }

  const needsBase = !basePack;
  const needsProposal = !proposalPack;

  return (
    <div className="container">
      <div className="hero">
        <h1>Workbench</h1>
        <p>Compare Spec Packs, review deterministic diffs, and save proposal patches.</p>
      </div>

      {notice && (
        <div style={{ marginBottom: 18 }}>
          <Callout
            kind={notice.kind}
            title={notice.headline}
            actions={
              <button className="btn" onClick={clearNotice}>
                Dismiss
              </button>
            }
          >
            {notice.details && notice.details.length > 0 ? (
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {notice.details.map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            ) : (
              <></>
            )}
          </Callout>
        </div>
      )}

      {(needsBase || needsProposal) && (
        <div style={{ marginBottom: 18 }}>
          <Panel title="Getting started">
            <ol className="small" style={{ marginTop: 0 }}>
              <li>
                {needsBase ? <strong>Import a Base pack</strong> : "Base pack loaded"} — export a Spec Pack ZIP from Builder.
              </li>
              <li>
                {needsProposal ? <strong>Import a Proposal pack</strong> : "Proposal pack loaded"} — a second Spec Pack ZIP to compare.
              </li>
              <li>Review diffs → save/apply a proposal patch → adopt + lock.</li>
            </ol>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              <SecondaryButton href="/builder/new">Open Builder</SecondaryButton>
              <SecondaryButton href="/builder/brownfield">Brownfield</SecondaryButton>
              <button className="btn" onClick={loadLastBase}>
                Load last Base
              </button>
              <button className="btn" onClick={loadLastProposal}>
                Load last Proposal
              </button>
            </div>
            <p className="small" style={{ marginBottom: 0 }}>
              Workbench never modifies your packs silently. All changes are exported as explicit patches you can review before applying.
            </p>
          </Panel>
        </div>
      )}

      <div className="grid">
        <Panel title="Base pack">
          <div className="field">
            <label>Base Spec Pack ZIP</label>
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={locked}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadBase(f);
              }}
            />
          </div>

          <div className="field">
            <label>Brownfield Inventory Pack ZIP (sets Base)</label>
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={locked}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadBrownfieldInventoryAsBase(f);
              }}
            />
            <p className="small">
              If you upload a Brownfield Inventory Pack, Workbench converts it into a Current-State Spec Pack so you can
              diff it against a Builder export.
            </p>
          </div>

          <div className="row">
            <button className="btn" onClick={loadLastBase}>
              Load last base
            </button>
            <button
              className="btn"
              onClick={() => {
                if (!basePack) return;
                setBaseGate(runGates(basePack));
              }}
              disabled={!basePack}
            >
              Run gates
            </button>
            <button className="btn" onClick={runVerify} disabled={!projectId}>
              Verify
            </button>
            <button className="btn" onClick={downloadDeterminismReportJson} disabled={!projectId}>
              Determinism report
            </button>
          </div>

          {verifyStatus && (
            <Callout kind={verifyWarnings.length ? "warn" : "success"} title="Verify" compact>
              <div className="small" style={{ marginBottom: verifyWarnings.length ? 6 : 0 }}>
                {verifyStatus}
              </div>
              {verifyWarnings.length > 0 && (
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {verifyWarnings.map((w, i) => (
                    <li key={`${i}-${w}`}>{w}</li>
                  ))}
                </ul>
              )}
            </Callout>
          )}

          <div className="hr" />

          <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <div className="badge">
              <strong>Truth</strong> <span>{locked ? "LOCKED" : "UNLOCKED"}</span>
            </div>
            {basePackHash && (
              <div className="badge">
                <strong>Base SHA</strong> <span>{basePackHash.slice(0, 10)}...</span>
              </div>
            )}
            {governance?.last_locked && (
              <div className="badge">
                <strong>Locked SHA</strong> <span>{governance.last_locked.pack_sha256.slice(0, 10)}...</span>
              </div>
            )}
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            {locked ? (
              <SecondaryButton onClick={unlockNow}>Unlock (create working copy)</SecondaryButton>
            ) : (
              <DangerButton onClick={lockCurrentBaseNow} disabled={!basePack}>
                Lock current Base as truth
              </DangerButton>
            )}
          </div>

          {governance?.last_locked && (
            <p className="small" style={{ marginTop: 6 }}>
              Locked at {governance.last_locked.locked_at_utc}. Provenance: base.zip {governance.last_locked.provenance.base_zip_sha256?.slice(0, 10)}...
              {governance.last_locked.provenance.patch_ops_sha256 ? `, patch.ops ${governance.last_locked.provenance.patch_ops_sha256.slice(0, 10)}...` : ""}
            </p>
          )}

          {governanceStatus && <p className="small">{governanceStatus}</p>}

          <div className="hr" />

          {!basePack && <p className="small">Import a Spec Pack export from Builder.</p>}

          {basePack && (
            <>
              <div className="badge">
                <strong>Files</strong> <span>{basePack.files.length}</span>
              </div>
              {baseManifest?.ok && (
                <div className="badge" style={{ marginLeft: 8 }}>
                  <strong>Project</strong> <span>{baseManifest.manifest.project_id}</span>
                </div>
              )}

              <div className="hr" />

              {baseValidation && (
                <>
                  <div className="badge">
                    <strong>Manifest</strong> <span>{baseValidation.ok ? "PASS" : "FAIL"}</span>
                  </div>
                  <div className="badge" style={{ marginLeft: 8 }}>
                    <strong>Issues</strong> <span>{baseValidation.issues.length}</span>
                  </div>
                </>
              )}

              <div className="hr" />

              {baseSpecValidationReport && (
                <>
                  <div className="badge">
                    <strong>Schema</strong> <span>{baseSpecValidationReport.status.toUpperCase()}</span>
                  </div>
                  <div className="badge" style={{ marginLeft: 8 }}>
                    <strong>Issues</strong> <span>{baseSpecValidationReport.issues.length}</span>
                  </div>
                </>
              )}

              {baseGate && (
                <>
                  <div className="badge">
                    <strong>Gates</strong> <span>{baseGate.status.toUpperCase()}</span>
                  </div>
                  <div className="badge" style={{ marginLeft: 8 }}>
                    <strong>Issues</strong> <span>{baseGate.issues.length}</span>
                  </div>
                </>
              )}
            </>
          )}
        </Panel>

        <Panel title="AI proposals (patch-only)">
          <p className="small">
            Optional. AI never touches truth directly. It returns auditable proposal packs (diffable) that only change the files listed below.
          </p>

          <div className="field">
            <label>Proposal type</label>
            <select value={aiKind} onChange={(e) => setAiKind(e.target.value as AiProposalKind)}>
              <option value="tokens">Tokens</option>
              <option value="lofi_layouts">Low-fi layouts</option>
              <option value="copy_blocks">Copy blocks</option>
            </select>
            <p className="small">
              Targets:{" "}
              {aiKind === "tokens" && (
                <>
                  <code>design/tokens.json</code>, <code>design/tokens_compiled.json</code>
                </>
              )}
              {aiKind === "lofi_layouts" && (
                <>
                  <code>design/lofi_layouts.json</code>
                </>
              )}
              {aiKind === "copy_blocks" && (
                <>
                  <code>content/copy_blocks.json</code>
                </>
              )}
            </p>
          </div>

          <div className="field">
            <label>Goal (optional)</label>
            <input
              value={aiGoal}
              onChange={(e) => setAiGoal(e.target.value)}
              placeholder={
                aiKind === "tokens"
                  ? "e.g. more accessible, calmer, bolder"
                  : aiKind === "lofi_layouts"
                    ? "e.g. minimal, marketing-forward, community-focused"
                    : "e.g. concise, premium, friendly"
              }
            />
          </div>

          <div className="row">
            <SecondaryButton onClick={() => generateAiProposals()}>Generate A/B/C</SecondaryButton>
            {aiStatus && (
              <span className="small" style={{ marginLeft: 10 }}>
                {aiStatus}
              </span>
            )}
          </div>

          {aiProposals.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {aiProposals.map((p) => (
                <div key={p.id} className="step" style={{ marginBottom: 10 }}>
                  <div className="k">AI</div>
                  <div className="t">
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                      <strong>{p.summary}</strong>
                      <span className="small">
                        {p.score !== undefined ? `Score ${p.score}` : ""}
                      </span>
                    </div>
                    {p.score_notes && p.score_notes.length > 0 && (
                      <p className="small" style={{ marginTop: 6 }}>
                        {p.score_notes.join(" · ")}
                      </p>
                    )}
                    {p.rationale && (
                      <p className="small" style={{ marginTop: 6 }}>
                        {p.rationale}
                      </p>
                    )}
                    <div className="row" style={{ marginTop: 8 }}>
                      <SecondaryButton onClick={() => loadAiProposalPack(p.proposal_pack_b64, p.summary)}>Load as Proposal</SecondaryButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Proposal pack">
          <div className="field">
            <label>Proposal Spec Pack ZIP</label>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadProposal(f);
              }}
            />
          </div>

          <div className="row">
            <button className="btn" onClick={loadLastProposal}>
              Load last proposal
            </button>
            <button
              className="btn"
              onClick={() => {
                if (!proposalPack) return;
                setProposalGate(runGates(proposalPack));
              }}
              disabled={!proposalPack}
            >
              Run gates
            </button>
          </div>

          <div className="hr" />

          {!proposalPack && <p className="small">Import a second pack to compare against the base.</p>}

          {proposalPack && (
            <>
              <div className="badge">
                <strong>Files</strong> <span>{proposalPack.files.length}</span>
              </div>
              {proposalManifest?.ok && (
                <div className="badge" style={{ marginLeft: 8 }}>
                  <strong>Project</strong> <span>{proposalManifest.manifest.project_id}</span>
                </div>
              )}

              <div className="hr" />

              {proposalValidation && (
                <>
                  <div className="badge">
                    <strong>Manifest</strong> <span>{proposalValidation.ok ? "PASS" : "FAIL"}</span>
                  </div>
                  <div className="badge" style={{ marginLeft: 8 }}>
                    <strong>Issues</strong> <span>{proposalValidation.issues.length}</span>
                  </div>
                </>
              )}

              <div className="hr" />

              {proposalSpecValidationReport && (
                <>
                  <div className="badge">
                    <strong>Schema</strong> <span>{proposalSpecValidationReport.status.toUpperCase()}</span>
                  </div>
                  <div className="badge" style={{ marginLeft: 8 }}>
                    <strong>Issues</strong> <span>{proposalSpecValidationReport.issues.length}</span>
                  </div>
                </>
              )}

              {proposalGate && (
                <>
                  <div className="badge">
                    <strong>Gates</strong> <span>{proposalGate.status.toUpperCase()}</span>
                  </div>
                  <div className="badge" style={{ marginLeft: 8 }}>
                    <strong>Issues</strong> <span>{proposalGate.issues.length}</span>
                  </div>
                </>
              )}
            </>
          )}
        </Panel>

        <Panel title="Merge proposals (group cherry-pick)">
          <p className="small">
            Build a merged proposal by choosing which file groups come from the Base, the Current Proposal, or a
            Secondary proposal. This is how you do “layout from A + tokens from B” deterministically.
          </p>

          <div className="field">
            <label>Secondary proposal source</label>
            <select value={secondaryKey} onChange={(e) => setSecondaryKey(e.target.value)}>
              <option value="none">None</option>
              <optgroup label="Saved proposals (applyable v2)">
                {proposals
                  .filter((p) => isApplyable(p))
                  .map((p) => {
                    if (!isApplyable(p)) return null;
                    const label = (p.patch.summary || p.summary || "Saved proposal").slice(0, 90);
                    return (
                      <option key={p.id} value={`saved:${p.id}`}>
                        {label}
                      </option>
                    );
                  })}
              </optgroup>
              <optgroup label="AI proposals (this session)">
                {aiProposals.map((p) => (
                  <option key={p.id} value={`ai:${p.id}`}>
                    {(`${p.kind}: ${p.summary || "AI proposal"}${p.score !== undefined ? ` (score ${p.score})` : ""}`).slice(0, 90)}
                  </option>
                ))}
              </optgroup>
            </select>
            {secondaryStatus && <p className="small">{secondaryStatus}</p>}
          </div>

          {secondaryPack && (
            <>
              <div className="badge">
                <strong>Secondary</strong> <span>{secondaryPack.files.length} files</span>
              </div>
              {secondaryGate && (
                <div className="badge" style={{ marginLeft: 8 }}>
                  <strong>Gates</strong> <span>{secondaryGate.status.toUpperCase()}</span>
                </div>
              )}
              <div className="hr" />
            </>
          )}

          <div className="field">
            <label>Tokens group</label>
            <select value={mergeGroups.tokens} onChange={(e) => updateMergeGroup("tokens", e.target.value as MergeSource)}>
              <option value="base">Base</option>
              <option value="current">Current Proposal</option>
              <option value="secondary" disabled={!secondaryPack}>Secondary</option>
            </select>
            <p className="small">Files: <code>design/tokens.json</code>, <code>design/tokens_compiled.json</code></p>
          </div>

          <div className="field">
            <label>Layout group</label>
            <select value={mergeGroups.layout} onChange={(e) => updateMergeGroup("layout", e.target.value as MergeSource)}>
              <option value="base">Base</option>
              <option value="current">Current Proposal</option>
              <option value="secondary" disabled={!secondaryPack}>Secondary</option>
            </select>
            <p className="small">Files: <code>design/ia_tree.json</code>, <code>design/lofi_layouts.json</code></p>
          </div>

          <div className="field">
            <label>Brand group</label>
            <select value={mergeGroups.brand} onChange={(e) => updateMergeGroup("brand", e.target.value as MergeSource)}>
              <option value="base">Base</option>
              <option value="current">Current Proposal</option>
              <option value="secondary" disabled={!secondaryPack}>Secondary</option>
            </select>
            <p className="small">Files: <code>design/profile.json</code>, <code>design/references.json</code>, <code>intent/brief.json</code></p>
          </div>

          <div className="field">
            <label>Copy group</label>
            <select value={mergeGroups.copy} onChange={(e) => updateMergeGroup("copy", e.target.value as MergeSource)}>
              <option value="base">Base</option>
              <option value="current">Current Proposal</option>
              <option value="secondary" disabled={!secondaryPack}>Secondary</option>
            </select>
            <p className="small">Files: <code>content/copy_blocks.json</code></p>
          </div>

          <div className="field">
            <label>UX group</label>
            <select value={mergeGroups.kernel_min} onChange={(e) => updateMergeGroup("ux", e.target.value as MergeSource)}>
              <option value="base">Base</option>
              <option value="current">Current Proposal</option>
              <option value="secondary" disabled={!secondaryPack}>Secondary</option>
            </select>
            <p className="small">Files: <code>kernel_min/actors.json</code>, <code>kernel_min/scenes.json</code>, <code>kernel_min/flows.json</code> <span className="muted">(+ legacy <code>ux/*</code>)</span></p>
          </div>

          <div className="row">
            <SecondaryButton onClick={() => buildMergedProposal()}>Build merged proposal</SecondaryButton>
          </div>

          {mergeBuiltStatus && (
            <>
              <div className="hr" />
              <p className="small">{mergeBuiltStatus}</p>
            </>
          )}
        </Panel>
      </div>

      <div style={{ marginTop: 18 }} className="grid">
        <Panel title="Base gate issues">
          <GateReportView
            report={baseGate}
            emptyHint="Import a base pack, or click Run gates."
            jump={{
              label: "Jump to file",
              onJump: ({ file, issue }) => {
                if (!file) return;
                setSelectedPath(file);
                setSelectedPointer(issue.pointer || null);
                setPreviewTab("base");
                setNoticeMsg("info", `Jumped to base file: ${file}`);
              },
            }}
          />
        </Panel>

        <Panel title="Proposal gate issues">
          <GateReportView
            report={proposalGate}
            emptyHint="Import a proposal pack, or click Run gates."
            jump={{
              label: "Jump to file",
              onJump: ({ file, issue }) => {
                if (!file) return;
                setSelectedPath(file);
                setSelectedPointer(issue.pointer || null);
                setPreviewTab("proposal");
                setNoticeMsg("info", `Jumped to proposal file: ${file}`);
              },
            }}
          />
        </Panel>
      </div>

      <div style={{ marginTop: 18 }} className="grid">
        <Panel title="Base schema validator">
          <ValidationReportView
            report={baseSpecValidationReport}
            title="Base pack"
            onJump={({ file, pointer }) => {
              if (!file) return;
              setSelectedPath(file);
              setSelectedPointer(pointer || null);
              setPreviewTab("base");
              setNoticeMsg("info", `Opened base file: ${file}`);
            }}
          />
        </Panel>

        <Panel title="Proposal schema validator">
          <ValidationReportView
            report={proposalSpecValidationReport}
            title="Proposal pack"
            onJump={({ file, pointer }) => {
              if (!file) return;
              setSelectedPath(file);
              setSelectedPointer(pointer || null);
              setPreviewTab("proposal");
              setNoticeMsg("info", `Opened proposal file: ${file}`);
            }}
          />
        </Panel>
      </div>

      <div style={{ marginTop: 18 }} className="grid">
        <Panel title="Brownfield delta report">
          <BrownfieldDeltaView
            report={brownfieldDelta}
            onOpenFile={(path) => {
              setSelectedPath(path);
              setSelectedPointer(null);
              setPreviewTab("proposal");
              setNoticeMsg("info", `Opened: ${path}`);
            }}
          />
        </Panel>

        <Panel title="Delta report JSON">
          <p className="small">
            Use this when your Base pack is a current-state pack derived from a repo ZIP (Brownfield) and your Proposal pack is your desired spec.
          </p>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <button
              className="btn"
              disabled={!brownfieldDelta}
              onClick={() => {
                if (!brownfieldDelta) return;
                downloadText("brownfield_delta_report.json", JSON.stringify(brownfieldDelta, null, 2));
              }}
            >
              Download delta report
            </button>
            {brownfieldDelta?.base.pack_sha256 && (
              <div className="badge">
                <strong>Base SHA</strong> <span>{brownfieldDelta.base.pack_sha256.slice(0, 10)}...</span>
              </div>
            )}
            {brownfieldDelta?.proposal.pack_sha256 && (
              <div className="badge">
                <strong>Proposal SHA</strong> <span>{brownfieldDelta.proposal.pack_sha256.slice(0, 10)}...</span>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 18 }} className="grid">
        <Panel title="Diff summary">
          {!packDiff && <p className="small">Import base + proposal packs to compute a patch.</p>}

          {packDiff && (
            <>
              <div className="badge">
                <strong>Added</strong> <span>{packDiff.stats.added}</span>
              </div>
              <div className="badge" style={{ marginLeft: 8 }}>
                <strong>Removed</strong> <span>{packDiff.stats.removed}</span>
              </div>
              <div className="badge" style={{ marginLeft: 8 }}>
                <strong>Modified</strong> <span>{packDiff.stats.modified}</span>
              </div>
              <div className="badge" style={{ marginLeft: 8 }}>
                <strong>Unchanged</strong> <span>{packDiff.stats.unchanged}</span>
              </div>

              <div className="hr" />

              <div className="row">
                <button className="btn" onClick={() => setShowUnchanged((v) => !v)}>
                  {showUnchanged ? "Hide unchanged" : "Show unchanged"}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setPatchOverride(null);
                    setPreviewTab("full");
                  }}
                  disabled={!packDiff}
                >
                  View full patch
                </button>
              </div>

              <div className="hr" />

              <div className="small">Click a file to preview. Only changed files are shown by default.</div>
              <div className="hr" />

              <div style={{ maxHeight: 460, overflow: "auto" }}>
                {diffFiles.map((f) => {
                  const active = f.path === selectedPath;
                  const kind = fileKindLabel(f.kind);
                  const hint = f.kind === "unchanged" ? "" : `${kind} • ${humanBytes(f.oldSize)} → ${humanBytes(f.newSize)}`;
                  return (
                    <div
                      key={f.path}
                      className={["step", active ? "active" : ""].join(" ")}
                      style={{ marginBottom: 8, cursor: "pointer" }}
                      onClick={() => {
                        setPatchOverride(null);
                        setSelectedPath(f.path);
                        setSelectedPointer(null);
                        setPreviewTab("patch");
                      }}
                    >
                      <div className="k">{f.kind === "added" ? "+" : f.kind === "removed" ? "-" : f.kind === "modified" ? "~" : ""}</div>
                      <div className="t">
                        <strong>{f.path}</strong>
                        <span>{hint}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

        </Panel>

        <Panel title="Patch + preview">
          {!packDiff && !patchOverride && <p className="small">Patch preview will appear after comparing two packs.</p>}

          {(packDiff || patchOverride) && (
            <>
              <div className="row">
                <button
                  className={"btn"}
                  onClick={() => {
                    setSelectedPath("blueprint/hello.spel");
                    setPreviewTab(proposalPack ? "proposal" : "base");
                  }}
                  disabled={!basePack && !proposalPack}
                >
                  Open SPEL blueprint
                </button>
              </div>

              <div className="hr" />

              <div className="row">
                <button className={"btn"} onClick={() => setPreviewTab("patch")}>
                  Patch
                </button>
                <button className={"btn"} onClick={() => setPreviewTab("base")} disabled={!basePack}>
                  Base
                </button>
                <button className={"btn"} onClick={() => setPreviewTab("proposal")} disabled={!proposalPack}>
                  Proposal
                </button>
                <button className={"btn"} onClick={() => setPreviewTab("full")} disabled={!packDiff}>
                  Full
                </button>
              </div>

              <div className="hr" />

              {previewTab === "patch" && (
                <>
                  {selectedDiff ? (
                    <>
                      <div className="badge">
                        <strong>File</strong> <span>{selectedDiff.path}</span>
                      </div>
                      <div className="badge" style={{ marginLeft: 8 }}>
                        <strong>Kind</strong> <span>{fileKindLabel(selectedDiff.kind)}</span>
                      </div>
                      <div className="hr" />
                      <textarea readOnly value={selectedDiff.patch || "(no patch for unchanged file)"} />
                    </>
                  ) : (
                    <p className="small">Select a changed file to see its patch.</p>
                  )}
                </>
              )}

              {previewTab === "full" && (
                <>
                  <div className="row">
                    <button
                      className="btn"
                      onClick={() => {
                        if (!packDiff) return;
                        const baseId = baseManifest?.ok ? baseManifest.manifest.project_id : "base";
                        const propId = proposalManifest?.ok ? proposalManifest.manifest.project_id : "proposal";
                        downloadText(`spec_pack_patch__${baseId}__to__${propId}.patch`, packDiff.fullPatch);
                      }}
                      disabled={!packDiff}
                    >
                      Download .patch
                    </button>
                    <button className="btn" onClick={saveCurrentProposal} disabled={!packDiff || !applyablePatch}>
                      Save applyable proposal
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        if (!applyablePatch) return;
                        applyPatchAndDownload(applyablePatch);
                      }}
                      disabled={!applyablePatch || !basePack || locked}
                    >
                      Apply patch → download merged pack
                    </button>
                    <DangerButton onClick={() => applyablePatch && adoptAndLock(applyablePatch)} disabled={!applyablePatch || !basePack || locked}>
                      Adopt + Lock
                    </DangerButton>
                    <DangerButton
                      onClick={() => {
                        const ok = window.confirm(
                          "Clear the Base/Proposal slots from the UI?\n\nThis does not delete cached packs; you can reload them via Import → Last used, or restore from Snapshots.",
                        );
                        if (!ok) return;
                        clearAll();
                      }}
                    >
                      Clear UI
                    </DangerButton>
                  </div>

                  <div className="hr" />

                  {governance?.last_locked && (
                    <p className="small">
                      Lineage: base.zip {governance.last_locked.provenance.base_zip_sha256?.slice(0, 10)}...
                      {governance.last_locked.provenance.proposal_zip_sha256 ? ` → proposal.zip ${governance.last_locked.provenance.proposal_zip_sha256.slice(0, 10)}...` : ""}
                      {governance.last_locked.provenance.patch_ops_sha256 ? ` → patch.ops ${governance.last_locked.provenance.patch_ops_sha256.slice(0, 10)}...` : ""}
                      {` → locked.pack ${governance.last_locked.pack_sha256.slice(0, 10)}...`}
                    </p>
                  )}

                  {(patchBuildStatus || applyStatus) && (
                    <>
                      {patchBuildStatus && <p className="small">{patchBuildStatus}</p>}
                      {applyStatus && <p className="small">{applyStatus}</p>}
                      <div className="hr" />
                    </>
                  )}

                  {packDiff && (
                    <>
                      <div className="field">
                        <label>Proposal summary (stored with the patch)</label>
                        <input value={proposalSummary} onChange={(e) => setProposalSummary(e.target.value)} />
                      </div>
                      <textarea readOnly value={packDiff.fullPatch} />
                    </>
                  )}

                  {!packDiff && patchOverride && <textarea readOnly value={patchOverride} />}
                </>
              )}

              {previewTab === "base" && (
                <>
                  {!baseSelectedFile && <p className="small">Base pack does not contain {selectedPath}.</p>}
                  {baseSelectedFile && (
                    <>
                      <div className="badge">
                        <strong>Path</strong> <span>{baseSelectedFile.path}</span>
                      </div>
                      <div className="badge" style={{ marginLeft: 8 }}>
                        <strong>Size</strong> <span>{humanBytes(baseSelectedFile.size)}</span>
                      </div>
                      <div className="hr" />
                      {baseSelectedJson ? (
                        <JsonTree
                          data={baseSelectedJson}
                          selectedPointer={selectedPointer}
                          onSelectPointer={(ptr) => setSelectedPointer(ptr)}
                        />
                      ) : (
                        <textarea readOnly value={baseSelectedText} />
                      )}
                    </>
                  )}
                </>
              )}

              {previewTab === "proposal" && (
                <>
                  {!proposalSelectedFile && <p className="small">Proposal pack does not contain {selectedPath}.</p>}
                  {proposalSelectedFile && (
                    <>
                      <div className="badge">
                        <strong>Path</strong> <span>{proposalSelectedFile.path}</span>
                      </div>
                      <div className="badge" style={{ marginLeft: 8 }}>
                        <strong>Size</strong> <span>{humanBytes(proposalSelectedFile.size)}</span>
                      </div>
                      <div className="hr" />
                      {selectedPath.endsWith(".spel") ? (
                        <>
                          <p className="small">
                            SPEL editor (advanced). Compile changes into a new Proposal pack so you can review a patch
                            before adoption.
                          </p>
                          <textarea value={spelEditorText} onChange={(e) => setSddlEditorText(e.target.value)} />
                          <div className="row" style={{ marginTop: 8 }}>
                            <button className="btn" onClick={() => setSddlEditorText(proposalSelectedText || baseSelectedText)}>
                              Reset editor
                            </button>
                            <button className="btn primary" onClick={compileSddlEditorToProposal} disabled={!basePack}>
                              Compile SPEL → Proposal pack
                            </button>
                          </div>
                          {spelStatus && (
                            <>
                              <div className="hr" />
                              <p className="small">{spelStatus}</p>
                            </>
                          )}
                        </>
                      ) : (
                        proposalSelectedJson ? (
                          <JsonTree
                            data={proposalSelectedJson}
                            selectedPointer={selectedPointer}
                            onSelectPointer={(ptr) => setSelectedPointer(ptr)}
                          />
                        ) : (
                          <textarea readOnly value={proposalSelectedText} />
                        )
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </Panel>
      </div>

      <div style={{ marginTop: 18 }} className="grid">
        <Panel title="Saved proposals (this browser)">
          <p className="small">A proposal is just a stored patch. AI can generate a proposal pack server-side, but adoption is always manual.</p>
          <div className="hr" />

          {proposals.length === 0 && <p className="small">No saved proposals yet.</p>}

          {proposals.length > 0 && (
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              {proposals.map((p) => {
                const applyable = isApplyable(p);
                const patchText = applyable ? p.patch.patch_text : p.patch;
                const stats = applyable ? p.patch.stats : p.stats;
                const baseId = applyable ? p.patch.base_project_id : p.base_project_id;
                const propId = applyable ? p.patch.proposal_project_id : p.proposal_project_id;
                const summary = applyable ? p.patch.summary || p.summary : p.summary;

                return (
                <div key={p.id} className="step" style={{ marginBottom: 10 }}>
                  <div className="k">P</div>
                  <div className="t">
                    <strong>
                      {summary}
                      {applyable ? " (applyable)" : ""}
                    </strong>
                    <span>
                      {p.created_at_utc}
                      {baseId ? ` • base=${baseId}` : ""}
                      {propId ? ` • proposal=${propId}` : ""}
                      {` • +${stats.added} -${stats.removed} ~${stats.modified}`}
                    </span>
                    <div className="row" style={{ marginTop: 8 }}>
                      <button
                        className="btn"
                        onClick={() => {
                          setPatchOverride(patchText);
                          setPreviewTab("full");
                          setNoticeMsg("info", "Viewing saved proposal patch.");
                        }}
                      >
                        View patch
                      </button>
                      <button
                        className="btn"
                        onClick={() => downloadText(`proposal__${p.id}.patch`, patchText)}
                      >
                        Download
                      </button>
                      <button
                        className="btn"
                        onClick={() => {
                          if (!applyable) {
                            setNoticeMsg(
                              "warn",
                              "This is a legacy proposal (v1).",
                              ["Recreate it by comparing two packs, then save as applyable (v2)."],
                            );
                            return;
                          }
                          applyPatchAndDownload(p.patch);
                        }}
                        disabled={!basePack || !applyable}
                      >
                        Apply to current base
                      </button>
                      <button
                        className="btn danger"
                        onClick={() => {
                          const next = deleteProposal(p.id);
                          setProposals(next);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Workflow">
          <p className="small">
            1) Export a Spec Pack from Builder → Review.
            <br />
            2) Make changes (manually, or via server-side AI in non-offline mode) and export another pack.
            <br />
            3) Compare the two packs here. The patch is deterministic and can be reviewed in code review.
          </p>
          <div className="hr" />
          <div className="row">
            <SecondaryButton href="/builder/new">Go to Builder</SecondaryButton>
            <SecondaryButton href="/ai">AI Status</SecondaryButton>
          </div>
        </Panel>
      </div>

      <div style={{ marginTop: 18 }} className="grid">
        <Panel title="Snapshots (local)">
          <p className="small">
            Snapshots are local-only restore points. The app automatically creates snapshots before Apply / Merge / Adopt
            / Unlock / Reset.
          </p>
          {snapshotStatus && (
            <p className="small" style={{ marginTop: 8 }}>
              {snapshotStatus}
            </p>
          )}
          <div className="hr" />

          {snapshots.length === 0 && <p className="small">No snapshots yet.</p>}

          {snapshots.length > 0 && (
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              {snapshots.map((s) => (
                <div key={s.id} className="step" style={{ marginBottom: 10 }}>
                  <div className="k">S</div>
                  <div className="t">
                    <strong>{s.label}</strong>
                    <span>
                      {s.created_at_utc}
                      {s.reason ? ` • ${s.reason}` : ""}
                    </span>
                    <div className="row" style={{ marginTop: 8 }}>
                      <button className="btn" onClick={() => restoreSnapshotNow(s.id)}>
                        Restore
                      </button>
                      <button className="btn danger" onClick={() => deleteSnapshotNow(s.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Danger zone (operator safety)">
          <p className="small">
            These actions only affect the local browser workspace. Back up first if you are unsure.
          </p>
          <div className="hr" />

          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <button className="btn" onClick={() => takeSnapshot("Manual snapshot", "manual")}>Take snapshot</button>
            <button className="btn" onClick={downloadProjectBackupZip}>Download backup ZIP</button>
          </div>

          <div className="hr" />

          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <DangerButton onClick={clearBaseNow} disabled={!projectId}>
              Clear Base
            </DangerButton>
            <DangerButton onClick={clearProposalNow} disabled={!projectId}>
              Clear Proposal
            </DangerButton>
            <DangerButton onClick={discardPatchOpsNow}>
              Discard patch ops
            </DangerButton>
            <DangerButton onClick={unlockNow} disabled={!projectId || !locked}>
              Unlock lineage
            </DangerButton>
          </div>

          <div className="hr" />

          <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={resetBackupFirst}
              onChange={(e) => setResetBackupFirst(e.target.checked)}
            />
            Export backup ZIP before reset
          </label>
          <div className="row" style={{ marginTop: 8 }}>
            <DangerButton onClick={resetProjectSafely} disabled={!projectId}>
              Reset project
            </DangerButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}
