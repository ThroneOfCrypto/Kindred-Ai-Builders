"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { DirectorProposalSummary } from "../../../components/DirectorProposalSummary";

import {
  getCurrentProjectId,
  loadState,
  saveState,
  lastBasePackKeyForProject,
  lastProposalPackKeyForProject,
  LEGACY_LAST_BASE_PACK_KEY,
  LEGACY_LAST_PROPOSAL_PACK_KEY,
} from "../../../lib/state";

import type { IntentProposalV1, ProjectState } from "../../../lib/types";
import { applyIntentProposalToState } from "../../../lib/intent_pack";

import { getPackGovernance, isPackLocked, unlockPack, type PackGovernanceV1 } from "../../../lib/pack_governance";
import { decodeBase64, encodeBase64, tryReadZip, type SpecPack } from "../../../lib/spec_pack";
import { applyPatchToPack, type SpecPackPatchV1 } from "../../../lib/spec_pack_patch";
import { deleteProposal, isApplyable, loadProposals, type ProposalV2 } from "../../../lib/proposals";
import { parseLibrariesSddl, normalizeLibraryIds } from "../../../lib/libraries_spel";
import { parsePatternsSddl, normalizePatternIds } from "../../../lib/patterns_spel";
import { parseKitsSddl, normalizeKitIds } from "../../../lib/kits_spel";
import { parseDataBindingsSddl, normalizeDataBindings } from "../../../lib/data_bindings_spel";
import { saveEnabledKits } from "../../../lib/project_kits";
import { sha256Hex } from "../../../lib/hash";

import {
  clearRepoWorkbenchPack,
  getRepoWorkbenchPackBytes,
  getRepoWorkbenchPackMeta,
  setRepoWorkbenchPackBytes,
  type RepoWorkbenchPackMetaV1,
} from "../../../lib/repo_pack_bytes_store";

import { getRepoPackGovernance, isRepoPackLocked, unlockRepoPack, type RepoPackGovernanceV1 } from "../../../lib/repo_pack_governance";

function humanCount(n: number): string {
  if (n === 0) return "0";
  if (n === 1) return "1";
  return String(n);
}

function humanBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function readLS(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeLS(key: string, value: string) {
  try {
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function readSpecPackSlotB64(projectId: string, side: "base" | "proposal"): string {
  const scoped = side === "base" ? lastBasePackKeyForProject(projectId) : lastProposalPackKeyForProject(projectId);
  const legacy = side === "base" ? LEGACY_LAST_BASE_PACK_KEY : LEGACY_LAST_PROPOSAL_PACK_KEY;
  return readLS(scoped) || readLS(legacy) || "";
}

function writeSpecPackSlotB64(projectId: string, side: "base" | "proposal", b64: string) {
  const scoped = side === "base" ? lastBasePackKeyForProject(projectId) : lastProposalPackKeyForProject(projectId);
  const legacy = side === "base" ? LEGACY_LAST_BASE_PACK_KEY : LEGACY_LAST_PROPOSAL_PACK_KEY;
  writeLS(scoped, b64);
  // Keep legacy key as a fallback (older screens still read it).
  writeLS(legacy, b64);
}

function parseSpecPackFromB64(b64: string): { ok: true; bytes: Uint8Array; pack: SpecPack } | { ok: false; error: string } {
  if (!b64) return { ok: false, error: "No pack present." };
  try {
    const bytes = decodeBase64(b64);
    const read = tryReadZip(bytes);
    if (!read.ok) return { ok: false, error: read.error.message };
    return { ok: true, bytes, pack: read.pack };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function isLikelyCurrentProjectProposal(projectId: string, p: ProposalV2): boolean {
  const base = (p.patch.base_project_id || "").trim();
  if (!base) return true; // legacy/unspecified
  return base === projectId;
}

function patchOpsPreview(patch: SpecPackPatchV1, limit: number): string[] {
  const ops = Array.isArray(patch.ops) ? patch.ops.slice(0, limit) : [];
  return ops.map((op) => {
    const verb = op.op === "add" ? "ADD" : op.op === "remove" ? "REMOVE" : "MODIFY";
    return `${verb} ${op.path}`;
  });
}


function summarizeSpecProposal(p: ProposalV2): { title: string; whatChanged: string[]; why: string[]; risks: string[]; next: string[] } {
  const ops = p.patch?.ops || [];
  const counts: Record<string, number> = {};
  for (const op of ops as any[]) {
    const k = String((op && (op.op || op.type)) || "unknown");
    counts[k] = (counts[k] || 0) + 1;
  }
  const whatChanged: string[] = [];
  whatChanged.push(`Ops: ${humanCount(ops.length)}`);
  const byType = Object.keys(counts).sort().map((k) => `${k}:${counts[k]}`);
  if (byType.length > 0) whatChanged.push(`By type: ${byType.join(", ")}`);
  if (p.patch?.stats) {
    whatChanged.push(`Adds: ${humanCount(p.patch.stats.added)} · Modifies: ${humanCount(p.patch.stats.modified)} · Removes: ${humanCount(p.patch.stats.removed)}`);
  }

  // Deterministic "why" cues (derived from op targets)
  const why: string[] = [];
  const paths: string[] = [];
  for (const op of ops as any[]) {
    const path = String(op?.path || op?.to || op?.from || "");
    if (path) paths.push(path);
  }
  const uniq = Array.from(new Set(paths)).slice(0, 8);
  if (uniq.length > 0) why.push(`Touches: ${uniq.join(", ")}${paths.length > uniq.length ? " …" : ""}`);
  why.push("This proposal is a deterministic patch to your Spec Pack (no hidden side-effects).");

  // Risks: heuristics based on op types/targets
  const risks: string[] = [];
  const hasDelete = ops.some((op: any) => String(op?.op || "").toLowerCase().includes("remove") || String(op?.op || "").toLowerCase().includes("delete"));
  const hasMove = ops.some((op: any) => String(op?.op || "").toLowerCase().includes("move"));
  if (hasDelete) risks.push("Includes removals. Review carefully before accepting.");
  if (hasMove) risks.push("Includes moves/renames. Downstream references may need review.");
  if (uniq.some((p) => p.includes("contracts/") || p.includes("milestones"))) risks.push("Touches governance/contracts. Expect stricter scrutiny.");
  if (risks.length === 0) risks.push("No obvious high-risk operations detected from patch metadata.");

  const next: string[] = [];
  next.push("Accept if the summary matches your intent.");
  next.push("Open evidence to inspect full diff/patch ops/hashes if needed.");

  return { title: p.summary || "Spec proposal", whatChanged, why, risks, next };
}

function summarizeRepoProposal(base: RepoWorkbenchPackMetaV1 | null, proposal: RepoWorkbenchPackMetaV1 | null): { title: string; whatChanged: string[]; why: string[]; risks: string[]; next: string[] } {
  const title = "Repo proposal";
  const whatChanged: string[] = [];
  if (!proposal) {
    whatChanged.push("No proposal loaded.");
  } else {
    whatChanged.push(`Proposal: ${proposal.name || "(unnamed)"}`);
    if (typeof proposal.file_count === "number") whatChanged.push(`Files: ${proposal.file_count}`);
    if (typeof proposal.total_bytes === "number") whatChanged.push(`Size: ${humanBytes(proposal.total_bytes)}`);
    if (proposal.pack_sha256) whatChanged.push(`Pack SHA: ${proposal.pack_sha256.slice(0, 12)}…`);
  }
  if (base && proposal) {
    const df = (proposal.file_count ?? 0) - (base.file_count ?? 0);
    const db = (proposal.total_bytes ?? 0) - (base.total_bytes ?? 0);
    if (Number.isFinite(df) && df !== 0) whatChanged.push(`Δ files: ${df > 0 ? "+" : ""}${df}`);
    if (Number.isFinite(db) && db !== 0) whatChanged.push(`Δ size: ${db > 0 ? "+" : ""}${humanBytes(Math.abs(db))}`);
  }

  const why: string[] = [];
  why.push("Repo proposals are deterministic snapshots (base vs proposal) governed by lock/adopt/export.");

  const risks: string[] = [];
  if (!proposal) risks.push("No proposal present to accept.");
  if (proposal && proposal.total_bytes && proposal.total_bytes > 50 * 1024 * 1024) risks.push("Large repo pack. Ensure import rules/caps match your expectations.");
  if (risks.length === 0) risks.push("No obvious risk signals detected from metadata alone.");

  const next: string[] = [];
  next.push("Accept to replace Base with Proposal (then Lock/Export when ready).");
  next.push("Open evidence in Repo Workbench for detailed diffs and rules diagnostics.");

  return { title, whatChanged, why, risks, next };
}

export default function DirectorProposalsPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [projectState, setProjectState] = useState<ProjectState | null>(null);

  const [specGov, setSpecGov] = useState<PackGovernanceV1 | null>(null);
  const [repoGov, setRepoGov] = useState<RepoPackGovernanceV1 | null>(null);

  const [specBasePresent, setSpecBasePresent] = useState<boolean>(false);
  const [specProposalPresent, setSpecProposalPresent] = useState<boolean>(false);

  const [repoBaseMeta, setRepoBaseMeta] = useState<RepoWorkbenchPackMetaV1 | null>(null);
  const [repoProposalMeta, setRepoProposalMeta] = useState<RepoWorkbenchPackMetaV1 | null>(null);

  const [specProposals, setSpecProposals] = useState<ProposalV2[]>([]);
  const [otherProjectProposals, setOtherProjectProposals] = useState<ProposalV2[]>([]);

  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<"info" | "success" | "warn" | "error">("info");
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = String(searchParams.get("focus") || "").trim();
  const nextHref = String(searchParams.get("next") || "").trim();

  const focusFound = useMemo(() => {
    if (!focusId) return false;
    return specProposals.some((p) => p.id === focusId);
  }, [specProposals, focusId]);

  const orderedSpecProposals = useMemo(() => {
    if (!focusId) return specProposals;
    const idx = specProposals.findIndex((p) => p.id === focusId);
    if (idx < 0) return specProposals;
    const focused = specProposals[idx];
    const rest = specProposals.filter((p) => p.id !== focusId);
    return [focused, ...rest];
  }, [specProposals, focusId]);


  useEffect(() => {
    function refresh() {
      try {
        const pid = getCurrentProjectId();
        setProjectId(pid);

        try {
          setProjectState(loadState());
        } catch {
          setProjectState(null);
        }

        const baseB64 = readSpecPackSlotB64(pid, "base");
        const propB64 = readSpecPackSlotB64(pid, "proposal");
        setSpecBasePresent(Boolean(baseB64));
        setSpecProposalPresent(Boolean(propB64));

        setSpecGov(getPackGovernance(pid));
        setRepoGov(getRepoPackGovernance(pid));

        setRepoBaseMeta(getRepoWorkbenchPackMeta(pid, "base"));
        setRepoProposalMeta(getRepoWorkbenchPackMeta(pid, "proposal"));

        const all = loadProposals().filter(isApplyable);
        const mine: ProposalV2[] = [];
        const others: ProposalV2[] = [];
        for (const p of all) {
          if (isLikelyCurrentProjectProposal(pid, p)) mine.push(p);
          else others.push(p);
        }
        setSpecProposals(mine);
        setOtherProjectProposals(others);
      } catch {
        setProjectId("");
        setProjectState(null);
        setSpecGov(null);
        setRepoGov(null);
        setRepoBaseMeta(null);
        setRepoProposalMeta(null);
        setSpecProposals([]);
        setOtherProjectProposals([]);
      }
    }

    refresh();
    window.addEventListener("kindred_project_changed", refresh);
    window.addEventListener("kindred_state_changed", refresh);
    window.addEventListener("kindred_governance_changed", refresh);
    window.addEventListener("kindred_repo_workbench_changed", refresh);
    window.addEventListener("kindred_repo_governance_changed", refresh);

    return () => {
      window.removeEventListener("kindred_project_changed", refresh);
      window.removeEventListener("kindred_state_changed", refresh);
      window.removeEventListener("kindred_governance_changed", refresh);
      window.removeEventListener("kindred_repo_workbench_changed", refresh);
      window.removeEventListener("kindred_repo_governance_changed", refresh);
    };
  }, []);

  const specLocked = useMemo(() => {
    if (!projectId) return false;
    return isPackLocked(projectId);
  }, [projectId, specGov]);

  const repoLocked = useMemo(() => {
    if (!projectId) return false;
    return isRepoPackLocked(projectId);
  }, [projectId, repoGov]);

  const intentProposals = useMemo(() => {
    const raw: any = (projectState as any)?.director?.intent_proposals;
    return Array.isArray(raw) ? (raw as IntentProposalV1[]) : [];
  }, [projectState]);

  const selectedIntentProposalId = useMemo(() => {
    return String((projectState as any)?.director?.selected_intent_proposal_id || "");
  }, [projectState]);

  function onAdoptIntentProposal(p: IntentProposalV1) {
    if (!projectState) return;
    try {
      const next = applyIntentProposalToState(projectState, p);
      saveState(next);
      setProjectState(next);
      setStatusKind("success");
      setStatus(`Adopted director option: ${p.title}.`);
    } catch {
      setStatusKind("error");
      setStatus("Could not adopt director option.");
    }
  }

  async function onUnlockSpec() {
    if (!projectId) return;
    unlockPack(projectId);
    setStatusKind("success");
    setStatus("Spec Pack unlocked. You can now accept proposals.");
  }

  async function onUnlockRepo() {
    if (!projectId) return;
    unlockRepoPack(projectId);
    setStatusKind("success");
    setStatus("Repo Pack unlocked. You can now accept repo proposals.");
  }

  async function acceptSpecProposal(p: ProposalV2): Promise<boolean> {
    if (!projectId) return false;

    if (specLocked) {
      setStatusKind("warn");
      setStatus("Spec Pack is locked. Unlock it before accepting proposals.");
      return false;
    }

    const baseB64 = readSpecPackSlotB64(projectId, "base");
    const base = parseSpecPackFromB64(baseB64);
    if (!base.ok) {
      setStatusKind("error");
      setStatus(`Cannot accept proposal: base Spec Pack missing or invalid (${base.error}).`);
      return false;
    }

    setStatusKind("info");
    setStatus("Applying proposal patch...");

    const applied = await applyPatchToPack(base.pack, p.patch);
    if (!applied.ok) {
      setStatusKind("error");
      setStatus(applied.error);
      return false;
    }

    const nextB64 = encodeBase64(applied.mergedZip);
    writeSpecPackSlotB64(projectId, "base", nextB64);

    // Director ergonomics: accepting a proposal implies clearing the "proposal slot" if one was loaded.
    writeSpecPackSlotB64(projectId, "proposal", "");

    // Adopt-sync: after accepting a Spec Pack proposal, sync Director Libraries state from the merged Spec Pack.
    // (Draft is director-local, but adopted state should reflect audited artefacts.)
    try {
      const st = loadState();
      const next: any = { ...st };
      next.director = { ...(next.director || {}), schema: "kindred.director_state.v1" };
      if (!next.director.libraries_v1 || typeof next.director.libraries_v1 !== "object") {
        next.director.libraries_v1 = {
          schema: "kindred.director_libraries.v1",
          catalog_version: "v1",
          draft_library_ids: [],
          adopted_library_ids: [],
        };
      }

      if (!next.director.patterns_v1 || typeof next.director.patterns_v1 !== "object") {
        next.director.patterns_v1 = {
          schema: "kindred.director_patterns.v1",
          catalog_version: "v1",
          draft_pattern_ids: [],
          adopted_pattern_ids: [],
        };
      }

      if (!next.director.kits_v1 || typeof next.director.kits_v1 !== "object") {
        next.director.kits_v1 = {
          schema: "kindred.director_kits.v1",
          catalog_version: "v1",
          draft_kit_ids: [],
          adopted_kit_ids: [],
        };
      }

      if (!next.director.data_bindings_v1 || typeof next.director.data_bindings_v1 !== "object") {
        next.director.data_bindings_v1 = {
          schema: "kindred.director_data_bindings.v1",
          catalog_version: "v1",
          draft: { source_id: "", sink_ids: [], trigger_id: "" },
          adopted: { source_id: "", sink_ids: [], trigger_id: "" },
        };
      }

      const libsFile = applied.mergedPack.fileMap.get("spel/libraries.spel");
      const libsText = libsFile ? new TextDecoder().decode(libsFile.bytes) : "";
      const parsed = parseLibrariesSddl(libsText);
      const adoptedIds = parsed.ok ? normalizeLibraryIds(parsed.library_ids) : [];
      const specSha = await sha256Hex(applied.mergedZip);
      const fileSha = libsFile ? await sha256Hex(libsFile.bytes) : "";

      next.director.libraries_v1.draft_library_ids = adoptedIds;
      next.director.libraries_v1.adopted_library_ids = adoptedIds;
      next.director.libraries_v1.adopted_from_spec_pack_sha256 = specSha;
      next.director.libraries_v1.adopted_libraries_spel_sha256 = fileSha;
      next.director.libraries_v1.adopted_at_utc = new Date().toISOString();

      // Patterns adopt-sync (same rule: adopted reflects audited artefacts).
      const patternsFile = applied.mergedPack.fileMap.get("spel/patterns.spel");
      const patternsText = patternsFile ? new TextDecoder().decode(patternsFile.bytes) : "";
      const parsedPatterns = parsePatternsSddl(patternsText);
      const adoptedPatterns = parsedPatterns.ok ? normalizePatternIds(parsedPatterns.pattern_ids) : [];
      const patternsSha = patternsFile ? await sha256Hex(patternsFile.bytes) : "";

      next.director.patterns_v1.draft_pattern_ids = adoptedPatterns;
      next.director.patterns_v1.adopted_pattern_ids = adoptedPatterns;
      next.director.patterns_v1.adopted_from_spec_pack_sha256 = specSha;
      next.director.patterns_v1.adopted_patterns_spel_sha256 = patternsSha;
      next.director.patterns_v1.adopted_at_utc = new Date().toISOString();

      // Kits adopt-sync: bindings live here. This is the only allowed place for provider/product specifics.
      const kitsFile = applied.mergedPack.fileMap.get("spel/kits.spel");
      const kitsText = kitsFile ? new TextDecoder().decode(kitsFile.bytes) : "";
      const parsedKits = parseKitsSddl(kitsText);
      const adoptedKits = parsedKits.ok ? normalizeKitIds(parsedKits.kit_ids) : [];
      const kitsSha = kitsFile ? await sha256Hex(kitsFile.bytes) : "";

      next.director.kits_v1.draft_kit_ids = adoptedKits;
      next.director.kits_v1.adopted_kit_ids = adoptedKits;
      next.director.kits_v1.adopted_from_spec_pack_sha256 = specSha;
      next.director.kits_v1.adopted_kits_spel_sha256 = kitsSha;
      next.director.kits_v1.adopted_at_utc = new Date().toISOString();

      // Keep legacy enabled-kits store aligned with adopted kits (used by backups + optional kit tooling).
      try {
        saveEnabledKits(projectId, { schema: "kindred.enabled_kits.v1", updated_at_utc: new Date().toISOString(), kit_ids: adoptedKits });
      } catch {
        // ignore
      }

      // Data bindings adopt-sync: generic wiring (source/sinks/triggers). Provider specifics remain in Kits.
      const dataFile = applied.mergedPack.fileMap.get("spel/data_bindings.spel");
      const dataText = dataFile ? new TextDecoder().decode(dataFile.bytes) : "";
      const parsedData = parseDataBindingsSddl(dataText);
      const adoptedBindings = parsedData.ok ? normalizeDataBindings(parsedData.bindings) : { source_id: "", sink_ids: [], trigger_id: "" };
      const dataSha = dataFile ? await sha256Hex(dataFile.bytes) : "";

      next.director.data_bindings_v1.draft = adoptedBindings;
      next.director.data_bindings_v1.adopted = adoptedBindings;
      next.director.data_bindings_v1.adopted_from_spec_pack_sha256 = specSha;
      next.director.data_bindings_v1.adopted_data_bindings_spel_sha256 = dataSha;
      next.director.data_bindings_v1.adopted_at_utc = new Date().toISOString();

      saveState(next);
    } catch {
      // Best-effort only.
    }

    setStatusKind("success");
    setStatus(`Accepted proposal. Applied ${humanCount(p.patch.stats.added)} add, ${humanCount(p.patch.stats.modified)} modify, ${humanCount(p.patch.stats.removed)} remove ops.`);

    try {
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }

    return true;

  }

  function removeProposalRecord(id: string) {
    try {
      const next = deleteProposal(id);
      const applyable = next.filter(isApplyable) as ProposalV2[];
      const mine: ProposalV2[] = [];
      const others: ProposalV2[] = [];
      for (const p of applyable) {
        if (projectId && isLikelyCurrentProjectProposal(projectId, p)) mine.push(p);
        else others.push(p);
      }
      setSpecProposals(mine);
      setOtherProjectProposals(others);
      setStatusKind("success");
      setStatus("Removed proposal record.");
    } catch {
      setStatusKind("error");
      setStatus("Could not remove proposal record.");
    }
  }

  async function acceptRepoProposal() {
    if (!projectId) return;

    if (repoLocked) {
      setStatusKind("warn");
      setStatus("Repo Pack is locked. Unlock it before accepting repo proposals.");
      return;
    }

    setStatusKind("info");
    setStatus("Accepting repo proposal (copying proposal → base)...");

    const bytes = await getRepoWorkbenchPackBytes(projectId, "proposal");
    if (!bytes) {
      setStatusKind("error");
      setStatus("No repo proposal bytes found.");
      return;
    }

    const meta = getRepoWorkbenchPackMeta(projectId, "proposal");
    const name = meta?.name || "proposal.zip";

    const ok = await setRepoWorkbenchPackBytes(projectId, "base", bytes, {
      name,
      repo_id: meta?.repo_id,
      pack_sha256: meta?.pack_sha256,
      total_bytes: meta?.total_bytes,
      file_count: meta?.file_count,
    });

    if (!ok) {
      setStatusKind("error");
      setStatus("Could not store repo base bytes (IndexedDB write failed).");
      return;
    }

    await clearRepoWorkbenchPack(projectId, "proposal");

    setStatusKind("success");
    setStatus("Accepted repo proposal. Base updated.");
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Proposals (Director)</h1>
        <p>
          Review options like a creative director: pick what you love, reject what you don’t, and keep deterministic
          evidence under the hood.
        </p>
      </div>

      {status ? <Callout kind={statusKind} title="Status" compact details={[status]} /> : null}

      {focusId ? (
        <Callout
          kind={focusFound ? "info" : "warn"}
          title={focusFound ? "Focused proposal" : "Focused proposal not found"}
          compact
          details={
            focusFound
              ? [
                  "This page was opened with a focused proposal.",
                  nextHref ? `After accepting, you will continue to: ${nextHref}` : "After accepting, continue to the next step.",
                ]
              : [
                  "A focus id was provided, but no matching proposal is stored for this project.",
                  "Open Workbench to generate or import proposals.",
                ]
          }
        />
      ) : null}

      <div className="grid">
        <Panel title="At-a-glance">
          <div className="row">
            <span className="badge">
              <strong>Project</strong>: {projectId || "(none)"}
            </span>
            <span className="badge">
              <strong>Spec</strong>: {specBasePresent ? "Base" : "No base"} / {specProposalPresent ? "Proposal loaded" : "No proposal"}
            </span>
            <span className="badge">
              <strong>Spec status</strong>: {specLocked ? "Locked" : "Unlocked"}
            </span>
          </div>
          <div className="row">
            <span className="badge">
              <strong>Repo</strong>: {repoBaseMeta ? "Base" : "No base"} / {repoProposalMeta ? "Proposal" : "No proposal"}
            </span>
            <span className="badge">
              <strong>Repo status</strong>: {repoLocked ? "Locked" : "Unlocked"}
            </span>
          </div>

          <div className="hr" />
          <p className="small">
            Need deep evidence? Use <a href="/workbench">Workbench</a> (spec) and <a href="/repo-workbench">Repo Workbench</a>.
          </p>
        </Panel>

        <Panel title="Director options (Intent proposals)">
          <p className="small">
            These options are deterministic and derived from your brief + constraints. Adopting one updates Intent + Palettes and then re-derives Journey + IA.
          </p>

          <div className="row">
            <a className="btn" href="/director/brief">
              Open Director Brief
            </a>
            <a className="btn" href="/builder/new?mode=director">
              Open Guided Build
            </a>
          </div>

          {intentProposals.length === 0 ? (
            <Callout kind="info" title="No director options yet" details={["Generate 3 options in Director Brief to see them here."]} />
          ) : (
            <div className="cards" style={{ marginTop: 12 }}>
              {intentProposals.map((p) => {
                const selected = selectedIntentProposalId === p.id;
                return (
                  <div key={p.id} className={"card" + (selected ? " active" : "")}
                    style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <h3 style={{ marginBottom: 4 }}>{p.title}</h3>
                      <p style={{ marginTop: 0 }}>{p.tagline}</p>
                      <p className="small">
                        Sets: {p.recommended.build_intent} • {p.recommended.primary_surface} • {p.recommended.palettes.length} palettes
                      </p>
                    </div>

                    <ul className="small" style={{ marginTop: 0 }}>
                      {p.rationale.slice(0, 4).map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>

                    <div className="row" style={{ marginTop: "auto" }}>
                      <button className="btn primary" onClick={() => onAdoptIntentProposal(p)}>
                        Adopt
                      </button>
                      {selected ? <span className="pill pill--success">SELECTED</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Spec proposals">
          {specLocked ? (
            <Callout
              kind="warn"
              title="Spec Pack is locked"
              details={["Unlock to accept proposals. Locking is for freezing truth before exporting."]}
              actions={
                <div className="row">
                  <button className="btn primary" onClick={onUnlockSpec}>
                    Unlock Spec Pack
                  </button>
                  <a className="btn" href="/workbench">
                    Open evidence
                  </a>
                </div>
              }
            />
          ) : null}

          {!specLocked && !specBasePresent ? (
            <Callout
              kind="info"
              title="No base Spec Pack yet"
              details={["Create a project in Build, or export a Spec Pack from the Builder to establish a base."]}
              actions={
                <div className="row">
                  <a className="btn primary" href="/builder/new?mode=director">
                    Start Guided Build
                  </a>
                </div>
              }
            />
          ) : null}

          {specProposals.length === 0 ? (
            <Callout
              kind="info"
              title="No stored proposals"
              details={["When AI or a compiler produces proposals, they will appear here as reviewable options."]}
              actions={
                <div className="row">
                  <a className="btn" href="/workbench">
                    Open Workbench
                  </a>
                </div>
              }
            />
          ) : (
            <div className="cards">
              {orderedSpecProposals.map((p) => (
                <div className={p.id === focusId ? "card active" : "card"} key={p.id}>
                  {(() => {
                    const s = summarizeSpecProposal(p);
                    return <DirectorProposalSummary {...s} />;
                  })()}
                  <p className="small" style={{ marginTop: 0 }}>
                    Created: <strong>{p.created_at_utc}</strong>
                  </p>

                  <div className="row">
                    <span className="badge">
                      +{humanCount(p.patch.stats.added)} add
                    </span>
                    <span className="badge">
                      ~{humanCount(p.patch.stats.modified)} modify
                    </span>
                    <span className="badge">
                      -{humanCount(p.patch.stats.removed)} remove
                    </span>
                  </div>

                  <details>
                    <summary className="small">Evidence (optional)</summary>
                    <div className="hr" />
                    <p className="small" style={{ marginTop: 0 }}>
                      Patch ops preview:
                    </p>
                    <ul className="small" style={{ marginTop: 0 }}>
                      {patchOpsPreview(p.patch, 6).map((line, idx) => (
                        <li key={idx}>{line}</li>
                      ))}
                    </ul>
                  </details>

                  <div className="row">
                    <button
                      className="btn primary"
                      disabled={!specBasePresent || specLocked}
                      onClick={async () => {
                        const ok = await acceptSpecProposal(p);
                        if (ok && p.id === focusId && nextHref) router.push(nextHref);
                      }}
                      title={!specBasePresent ? "Create a base Spec Pack first" : specLocked ? "Unlock to accept" : ""}
                    >
                      {p.id === focusId && nextHref ? "Accept & continue" : "Accept"}
                    </button>
                    <a className="btn" href="/workbench">
                      Open evidence
                    </a>
                    <button className="btn danger" onClick={() => removeProposalRecord(p.id)}>
                      Remove record
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {otherProjectProposals.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <details>
                <summary className="small">Other project proposals ({otherProjectProposals.length})</summary>
                <div className="hr" />
                <ul className="small" style={{ margin: 0 }}>
                  {otherProjectProposals.slice(0, 10).map((p) => (
                    <li key={p.id}>
                      {p.created_at_utc}: {p.summary}
                    </li>
                  ))}
                </ul>
                <p className="small">Open Workbench for full history.</p>
              </details>
            </div>
          ) : null}
        </Panel>

        <Panel title="Repo proposals">
          {repoLocked ? (
            <Callout
              kind="warn"
              title="Repo Pack is locked"
              details={["Unlock to accept repo proposals. Locking is for freezing a repo snapshot before export."]}
              actions={
                <div className="row">
                  <button className="btn primary" onClick={onUnlockRepo}>
                    Unlock Repo Pack
                  </button>
                  <a className="btn" href="/repo-workbench">
                    Open Repo Workbench
                  </a>
                </div>
              }
            />
          ) : null}

          {!repoProposalMeta ? (
            <Callout
              kind="info"
              title="No repo proposal yet"
              details={["Import a repo ZIP or generate a repo proposal in the Repo Workbench."]}
              actions={
                <div className="row">
                  <a className="btn" href="/repo">
                    Go to Repos
                  </a>
                  <a className="btn" href="/repo-workbench">
                    Open Repo Workbench
                  </a>
                </div>
              }
            />
          ) : (
            <div>
              {(() => {
                const s = summarizeRepoProposal(repoBaseMeta, repoProposalMeta);
                return <DirectorProposalSummary {...s} />;
              })()}

              <p className="small" style={{ marginTop: 0 }}>
                Proposal: <strong>{repoProposalMeta.name}</strong>
                {typeof repoProposalMeta.file_count === "number" ? ` · ${repoProposalMeta.file_count} files` : ""}
                {typeof repoProposalMeta.total_bytes === "number" ? ` · ${humanBytes(repoProposalMeta.total_bytes)}` : ""}
              </p>
              <div className="row">
                <button className="btn primary" disabled={repoLocked} onClick={acceptRepoProposal}>
                  Accept repo proposal
                </button>
                <a className="btn" href="/repo-workbench">
                  Open evidence
                </a>
              </div>
              <p className="small">
                Tip: accepting updates the repo <strong>Base</strong> to match the proposal. Use Lock when you’re ready to freeze truth.
              </p>
            </div>
          )}

          {repoBaseMeta ? (
            <div style={{ marginTop: 12 }}>
              <details>
                <summary className="small">Current repo base</summary>
                <div className="hr" />
                <p className="small" style={{ margin: 0 }}>
                  Base: <strong>{repoBaseMeta.name}</strong>
                  {typeof repoBaseMeta.file_count === "number" ? ` · ${repoBaseMeta.file_count} files` : ""}
                  {typeof repoBaseMeta.total_bytes === "number" ? ` · ${humanBytes(repoBaseMeta.total_bytes)}` : ""}
                </p>
              </details>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
