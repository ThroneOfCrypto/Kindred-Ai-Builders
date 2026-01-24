"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readAdvancedMode } from "../../../lib/advanced_mode";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";

import { getCurrentProjectId, loadProjectStateById, saveProjectStateById, lastBasePackKeyForProject, LEGACY_LAST_BASE_PACK_KEY } from "../../../lib/state";
import type { ProjectState } from "../../../lib/types";
import { LIBRARIES_CATALOG_V1, groupLibraries, type LibraryChip } from "../../../lib/libraries_catalog";
import { librariesSddlText, normalizeLibraryIds } from "../../../lib/libraries_spel";
import { saveProposal, type ProposalV2 } from "../../../lib/proposals";
import { decodeBase64, encodeBase64, tryReadZip, type SpecPack } from "../../../lib/spec_pack";
import { diffSpecPacks } from "../../../lib/pack_diff";
import { buildPatchFromPacks } from "../../../lib/spec_pack_patch";
import { zipDeterministic } from "../../../lib/deterministic_zip";
import { stableJsonText } from "../../../lib/stable_json";
import { sha256Hex } from "../../../lib/hash";
import { isPackLocked } from "../../../lib/pack_governance";

function ensureDirectorLibrariesShape(s: ProjectState): ProjectState {
  const next: any = { ...s };
  next.director = { ...(next.director || {}), schema: "kindred.director_state.v1" };
  if (!next.director.libraries_v1 || typeof next.director.libraries_v1 !== "object") {
    next.director.libraries_v1 = {
      schema: "kindred.director_libraries.v1",
      catalog_version: "v1",
      draft_library_ids: [],
      adopted_library_ids: [],
    };
  }
  if (!Array.isArray(next.director.libraries_v1.draft_library_ids)) next.director.libraries_v1.draft_library_ids = [];
  if (!Array.isArray(next.director.libraries_v1.adopted_library_ids)) next.director.libraries_v1.adopted_library_ids = [];
  return next;
}

function buildSpecPackWithLibraries(basePack: SpecPack, library_ids: string[]): { zip: Uint8Array; pack: SpecPack; warnings: string[] } {
  const warnings: string[] = [];
  const files: Record<string, Uint8Array> = {};
  for (const [path, f] of basePack.fileMap.entries()) files[path] = f.bytes;

  const spelText = librariesSddlText({ library_ids });
  files["spel/libraries.spel"] = new TextEncoder().encode(spelText);

  // Update manifest contents to include the new file if missing.
  try {
    const raw = files["spec_pack_manifest.json"];
    const parsed = raw ? JSON.parse(new TextDecoder().decode(raw)) : null;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.contents)) {
      if (!parsed.contents.includes("spel/libraries.spel")) parsed.contents.push("spel/libraries.spel");
      files["spec_pack_manifest.json"] = new TextEncoder().encode(stableJsonText(parsed, 2));
    } else {
      warnings.push("spec_pack_manifest.json could not be updated cleanly; regenerating minimal manifest.");
    }
  } catch {
    warnings.push("spec_pack_manifest.json could not be parsed; regenerating minimal manifest.");
  }

  if (!files["spec_pack_manifest.json"]) {
    // Emergency fallback (should be rare): generate minimal manifest.
    const contentPaths = Object.keys(files).sort((a, b) => a.localeCompare(b));
    const manifest = {
      schema: "kindred.spec_pack_manifest.v1",
      created_at_utc: "1980-01-01T00:00:00.000Z",
      project_id: "(unknown)",
      spec_pack_version: "v1",
      provenance: { app_version: "(unknown)", validator_version: "(unknown)" },
      contents: contentPaths,
    };
    files["spec_pack_manifest.json"] = new TextEncoder().encode(stableJsonText(manifest, 2));
  }

  const zip = zipDeterministic(files, { level: 6 });
  const parsed = tryReadZip(zip);
  if (!parsed.ok) {
    throw new Error("Failed to build a Spec Pack with injected libraries module.");
  }
  return { zip, pack: parsed.pack, warnings };
}

export default function DirectorLibrariesPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [state, setState] = useState<ProjectState | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [warn, setWarn] = useState<string>("");

  useEffect(() => {
    const refresh = () => {
      const pid = getCurrentProjectId();
      setProjectId(pid);
      const st = ensureDirectorLibrariesShape(loadProjectStateById(pid));
      setState(st);
    };
    refresh();
    window.addEventListener("kindred_state_changed", refresh);
    window.addEventListener("kindred_project_changed", refresh);
    return () => {
      window.removeEventListener("kindred_state_changed", refresh);
      window.removeEventListener("kindred_project_changed", refresh);
    };
  }, []);

  const libs = useMemo(() => {
    const d = (state as any)?.director?.libraries_v1;
    return {
      draft: normalizeLibraryIds(Array.isArray(d?.draft_library_ids) ? d.draft_library_ids : []),
      adopted: normalizeLibraryIds(Array.isArray(d?.adopted_library_ids) ? d.adopted_library_ids : []),
      adopted_from_spec_pack_sha256: typeof d?.adopted_from_spec_pack_sha256 === "string" ? d.adopted_from_spec_pack_sha256 : "",
      adopted_libraries_spel_sha256: typeof d?.adopted_libraries_spel_sha256 === "string" ? d.adopted_libraries_spel_sha256 : "",
      adopted_at_utc: typeof d?.adopted_at_utc === "string" ? d.adopted_at_utc : "",
    };
  }, [state]);

  const filteredCatalog = useMemo(() => {
    const q = (filter || "").trim().toLowerCase();
    if (!q) return LIBRARIES_CATALOG_V1;
    return LIBRARIES_CATALOG_V1.filter((c) => {
      const hay = `${c.label} ${c.group} ${c.description} ${(c.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filter]);

  const groups = useMemo(() => groupLibraries(filteredCatalog), [filteredCatalog]);

  const spelPreview = useMemo(() => librariesSddlText({ library_ids: libs.draft }), [libs.draft]);

  async function persistDraft(nextDraft: string[]) {
    if (!state) return;
    const next = ensureDirectorLibrariesShape({ ...state });
    (next as any).director.libraries_v1.draft_library_ids = normalizeLibraryIds(nextDraft);
    saveProjectStateById(projectId, next);
    setState(next);
    try {
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  }

  function toggle(id: string) {
    const set = new Set(libs.draft);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    persistDraft(Array.from(set));
  }

  function clearDraft() {
    persistDraft([]);
  }

  async function createLibrariesProposal() {
    setStatus("");
    setWarn("");

    if (!state) return;
    if (!projectId) {
      setWarn("No project selected.");
      return;
    }

    if (isPackLocked(projectId)) {
      setWarn("Spec Pack is locked for this project. Unlock it before creating a libraries proposal.");
      return;
    }

    // Load (or synthesize) base Spec Pack.
    let basePack: SpecPack | null = null;
    let baseZip: Uint8Array | null = null;
    try {
      const key = lastBasePackKeyForProject(projectId);
      const b64 = localStorage.getItem(key) || localStorage.getItem(LEGACY_LAST_BASE_PACK_KEY) || "";
      if (b64) {
        const decoded = decodeBase64(b64);
        const parsed = tryReadZip(decoded);
        if (parsed.ok) {
          basePack = parsed.pack;
          baseZip = decoded;
        }
      }
    } catch {
      basePack = null;
      baseZip = null;
    }

    if (!basePack) {
      // Synthesize a base pack from current state and store it so adoption can apply.
      const synthesizedZip = (await import("../../../lib/export_pack")).buildSpecPack(state, { include_council_dsl: readAdvancedMode() });
      const parsed = tryReadZip(synthesizedZip);
      if (!parsed.ok) {
        setWarn("Could not synthesize a Base Spec Pack.");
        return;
      }
      basePack = parsed.pack;
      baseZip = synthesizedZip;
      try {
        const b64 = encodeBase64(synthesizedZip);
        localStorage.setItem(lastBasePackKeyForProject(projectId), b64);
        localStorage.setItem(LEGACY_LAST_BASE_PACK_KEY, b64);
      } catch {
        // ignore
      }
    }

    // Build proposal pack by injecting only the libraries module (and manifest update if needed).
    const proposalBuilt = buildSpecPackWithLibraries(basePack, libs.draft);
    for (const w of proposalBuilt.warnings) warningsToCallout(w, setWarn);

    // Diff + patch
    const diff = diffSpecPacks(basePack, proposalBuilt.pack);
    const patch = await buildPatchFromPacks({
      base: basePack,
      proposal: proposalBuilt.pack,
      patch_text: diff.fullPatch,
      summary: `Libraries update (${libs.draft.length} selections)`,
      stats: diff.stats,
    });

    // Make proposal record (applyable patch record).
    const now = new Date().toISOString();
    const summary = `Libraries update: ${libs.draft.length} selections`;
    const proposal: ProposalV2 = {
      schema: "kindred.proposal.v2",
      id: `p_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      created_at_utc: now,
      summary,
      patch: { ...patch, summary },
    };

    // Persist proposal record (local-first). Director will adopt from Director → Proposals.
    saveProposal(proposal);

    // Compute sha for transparency (not a requirement, but useful in Director loops).
    const baseSha = baseZip ? await sha256Hex(baseZip) : "";
    const propSha = await sha256Hex(proposalBuilt.zip);
    setStatus(`Created proposal: base ${baseSha.slice(0, 12)}… → proposed ${propSha.slice(0, 12)}…`);
  }

  function warningsToCallout(msg: string, set: (s: string) => void) {
    set((prev) => (prev ? `${prev}\n${msg}` : msg));
  }

  function chipButton(c: LibraryChip) {
    const selected = libs.draft.includes(c.id);
    return (
      <button
        key={c.id}
        className={`chip ${selected ? "chip--selected" : ""}`}
        onClick={() => toggle(c.id)}
        title={c.description}
        type="button"
      >
        <span className="chip__label">{c.label}</span>
        <span className="chip__meta">{c.id}</span>
      </button>
    );
  }

  if (!state) {
    return (
      <div className="container">
        <div className="hero">
          <h1>Libraries</h1>
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Libraries</h1>
        <p>
          Chips-only selection. Typing here only filters the catalog — nothing you type is treated as a requirement.
        </p>
      </div>

      {status ? <Callout kind="success">{status}</Callout> : null}
      {warn ? <Callout kind="warn">{warn}</Callout> : null}

      <div className="grid">
        <Panel title="Select libraries (chips-only)">
          <div className="field">
            <label>Filter (typing only filters)</label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter libraries…" />
          </div>

          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn" onClick={clearDraft} type="button">Clear</button>
            <button className="btn primary" onClick={createLibrariesProposal} type="button">Create proposal</button>
            <a className="btn" href="/director/proposals">Review proposals</a>
          </div>

          <p className="small">
            Draft chips: <strong>{libs.draft.length}</strong> · Adopted chips: <strong>{libs.adopted.length}</strong>
          </p>

          {Object.keys(groups).map((g) => (
            <div key={g} style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{g}</div>
              <div className="chipGrid">
                {groups[g].map((c) => chipButton(c))}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Libraries SPEL (preview from draft)">
          <p className="small">This is the deterministic module that will be written into the Spec Pack when you adopt the proposal.</p>
          <pre className="codeBlock">{spelPreview}</pre>
          <div className="hr" />
          <p className="small">
            Adopted provenance (from last accepted Spec Pack):
            <br />
            Spec Pack sha: <code>{libs.adopted_from_spec_pack_sha256 ? `${libs.adopted_from_spec_pack_sha256.slice(0, 12)}…` : "(none)"}</code>
            <br />
            libraries.spel sha: <code>{libs.adopted_libraries_spel_sha256 ? `${libs.adopted_libraries_spel_sha256.slice(0, 12)}…` : "(none)"}</code>
            <br />
            Adopted at: <code>{libs.adopted_at_utc || "(none)"}</code>
          </p>
        </Panel>
      </div>
    </div>
  );
}
