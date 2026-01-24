"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readAdvancedMode } from "../../../lib/advanced_mode";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";

import {
  getCurrentProjectId,
  loadProjectStateById,
  saveProjectStateById,
  lastBasePackKeyForProject,
  LEGACY_LAST_BASE_PACK_KEY,
} from "../../../lib/state";
import type { ProjectState } from "../../../lib/types";
import { PATTERNS_CATALOG_V1, groupPatterns, type PatternChip } from "../../../lib/patterns_catalog";
import { normalizePatternIds, patternsSddlText } from "../../../lib/patterns_spel";
import { saveProposal, type ProposalV2 } from "../../../lib/proposals";
import { decodeBase64, encodeBase64, tryReadZip, type SpecPack } from "../../../lib/spec_pack";
import { diffSpecPacks } from "../../../lib/pack_diff";
import { buildPatchFromPacks } from "../../../lib/spec_pack_patch";
import { zipDeterministic } from "../../../lib/deterministic_zip";
import { stableJsonText } from "../../../lib/stable_json";
import { sha256Hex } from "../../../lib/hash";
import { isPackLocked } from "../../../lib/pack_governance";

function ensureDirectorPatternsShape(s: ProjectState): ProjectState {
  const next: any = { ...s };
  next.director = { ...(next.director || {}), schema: "kindred.director_state.v1" };
  if (!next.director.patterns_v1 || typeof next.director.patterns_v1 !== "object") {
    next.director.patterns_v1 = {
      schema: "kindred.director_patterns.v1",
      catalog_version: "v1",
      draft_pattern_ids: [],
      adopted_pattern_ids: [],
    };
  }
  if (!Array.isArray(next.director.patterns_v1.draft_pattern_ids)) next.director.patterns_v1.draft_pattern_ids = [];
  if (!Array.isArray(next.director.patterns_v1.adopted_pattern_ids)) next.director.patterns_v1.adopted_pattern_ids = [];
  return next;
}

function buildSpecPackWithPatterns(basePack: SpecPack, pattern_ids: string[]): { zip: Uint8Array; pack: SpecPack; warnings: string[] } {
  const warnings: string[] = [];
  const files: Record<string, Uint8Array> = {};
  for (const [path, f] of basePack.fileMap.entries()) files[path] = f.bytes;

  const spelText = patternsSddlText({ pattern_ids });
  files["spel/patterns.spel"] = new TextEncoder().encode(spelText);

  // Update manifest contents to include the new file if missing.
  try {
    const raw = files["spec_pack_manifest.json"];
    const parsed = raw ? JSON.parse(new TextDecoder().decode(raw)) : null;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.contents)) {
      if (!parsed.contents.includes("spel/patterns.spel")) parsed.contents.push("spel/patterns.spel");
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
    throw new Error("Failed to build a Spec Pack with injected patterns module.");
  }
  return { zip, pack: parsed.pack, warnings };
}

export default function DirectorPatternsPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [state, setState] = useState<ProjectState | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [warn, setWarn] = useState<string>("");

  useEffect(() => {
    const refresh = () => {
      const pid = getCurrentProjectId();
      setProjectId(pid);
      const st = ensureDirectorPatternsShape(loadProjectStateById(pid));
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

  const patterns = useMemo(() => {
    const d = (state as any)?.director?.patterns_v1;
    return {
      draft: normalizePatternIds(Array.isArray(d?.draft_pattern_ids) ? d.draft_pattern_ids : []),
      adopted: normalizePatternIds(Array.isArray(d?.adopted_pattern_ids) ? d.adopted_pattern_ids : []),
      adopted_from_spec_pack_sha256: typeof d?.adopted_from_spec_pack_sha256 === "string" ? d.adopted_from_spec_pack_sha256 : "",
      adopted_patterns_spel_sha256: typeof d?.adopted_patterns_spel_sha256 === "string" ? d.adopted_patterns_spel_sha256 : "",
      adopted_at_utc: typeof d?.adopted_at_utc === "string" ? d.adopted_at_utc : "",
    };
  }, [state]);

  const selectedPalettes = useMemo(() => {
    const p = (state as any)?.intent?.palettes;
    return Array.isArray(p) ? p.map((x: any) => String(x || "").trim()).filter((x: string) => x) : [];
  }, [state]);

  const recommended = useMemo(() => {
    const pset = new Set(selectedPalettes);
    const scored = PATTERNS_CATALOG_V1.map((c) => {
      const score = (c.palettes || []).filter((p) => pset.has(p)).length;
      return { chip: c, score };
    })
      .filter((x) => x.score > 0)
      .sort((a, b) => (b.score - a.score) || a.chip.label.localeCompare(b.chip.label));

    // Keep the “recommended” set compact (director UX). The full catalog is still browsable below.
    return scored.slice(0, 10);
  }, [selectedPalettes]);

  const filteredCatalog = useMemo(() => {
    const q = (filter || "").trim().toLowerCase();
    if (!q) return PATTERNS_CATALOG_V1;
    return PATTERNS_CATALOG_V1.filter((c) => {
      const hay = `${c.label} ${c.group} ${c.description} ${(c.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [filter]);

  const groups = useMemo(() => groupPatterns(filteredCatalog), [filteredCatalog]);
  const spelPreview = useMemo(() => patternsSddlText({ pattern_ids: patterns.draft }), [patterns.draft]);

  async function persistDraft(nextDraft: string[]) {
    if (!state) return;
    const next = ensureDirectorPatternsShape({ ...state });
    (next as any).director.patterns_v1.draft_pattern_ids = normalizePatternIds(nextDraft);
    saveProjectStateById(projectId, next);
    setState(next);
    try {
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  }

  function toggle(id: string) {
    const set = new Set(patterns.draft);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    persistDraft(Array.from(set));
  }

  function clearDraft() {
    persistDraft([]);
  }

  async function createPatternsProposal() {
    setStatus("");
    setWarn("");

    if (!state) return;
    if (!projectId) {
      setWarn("No project selected.");
      return;
    }

    if (isPackLocked(projectId)) {
      setWarn("Spec Pack is locked for this project. Unlock it before creating a patterns proposal.");
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

    // Build proposal pack by injecting only the patterns module (and manifest update if needed).
    const proposalBuilt = buildSpecPackWithPatterns(basePack, patterns.draft);
    for (const w of proposalBuilt.warnings) warningsToCallout(w, setWarn);

    // Diff + patch
    const diff = diffSpecPacks(basePack, proposalBuilt.pack);
    const patch = await buildPatchFromPacks({
      base: basePack,
      proposal: proposalBuilt.pack,
      patch_text: diff.fullPatch,
      summary: `Patterns update (${patterns.draft.length} selections)`,
      stats: diff.stats,
    });

    // Make proposal record
    const now = new Date().toISOString();
    const summary = `Patterns update: ${patterns.draft.length} selections`;
    const proposal: ProposalV2 = {
      schema: "kindred.proposal.v2",
      id: `p_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      created_at_utc: now,
      summary,
      patch: { ...patch, summary },
    };

    saveProposal(proposal);

    const baseSha = baseZip ? await sha256Hex(baseZip) : "";
    const propSha = await sha256Hex(proposalBuilt.zip);
    setStatus(`Created proposal: base ${baseSha.slice(0, 12)}… → proposed ${propSha.slice(0, 12)}…`);
  }

  function warningsToCallout(msg: string, set: (s: string) => void) {
    set((prev) => (prev ? `${prev}\n${msg}` : msg));
  }

  function chipButton(c: PatternChip) {
    const selected = patterns.draft.includes(c.id);
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
          <h1>Patterns</h1>
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Patterns</h1>
        <p>
          Select reusable features (catalog only). Typing here only filters the catalog — nothing you type is treated as a requirement.
        </p>
      </div>

      {status ? <Callout kind="success">{status}</Callout> : null}
      {warn ? <Callout kind="warn">{warn}</Callout> : null}

      <div className="grid">
        <Panel title="Select patterns (chips-only)">
          <div className="field">
            <label>Filter (typing only filters)</label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter patterns…" />
          </div>

          <div className="row" style={{ marginBottom: 10 }}>
            <button className="btn" onClick={clearDraft} type="button">Clear</button>
            <button className="btn primary" onClick={createPatternsProposal} type="button">Create proposal</button>
            <a className="btn" href="/director/proposals">Review proposals</a>
          </div>

          <p className="small">
            Draft chips: <strong>{patterns.draft.length}</strong> · Adopted chips: <strong>{patterns.adopted.length}</strong>
          </p>

          <Callout title="Palette-aware suggestions (non-binding)">
            <p className="small">
              Your palettes: <strong>{selectedPalettes.length ? selectedPalettes.join(", ") : "(none)"}</strong>
            </p>
            {recommended.length === 0 ? (
              <p className="small">No suggestions yet. Pick palettes first (or type in the filter).</p>
            ) : (
              <div>
                <p className="small">
                  Suggested patterns based on palette overlap (top {recommended.length}). These are just chips. You still decide.
                </p>
                <div className="chipGrid">
                  {recommended.map((r) => (
                    <div key={r.chip.id}>
                      {chipButton(r.chip)}
                      <div className="small dim" style={{ marginTop: 4 }}>
                        Match: {r.score}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Callout>

          {Object.keys(groups).map((g) => (
            <div key={g} style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{g}</div>
              <div className="chipGrid">
                {groups[g].map((c) => chipButton(c))}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Patterns SPEL (preview from draft)">
          <p className="small">
            This is the deterministic module that will be written into the Spec Pack when you adopt the proposal.
          </p>
          <pre className="codeBlock">{spelPreview}</pre>
          <div className="hr" />
          <p className="small">
            Adopted provenance (from last accepted Spec Pack):
            <br />
            Spec Pack sha: <code>{patterns.adopted_from_spec_pack_sha256 ? `${patterns.adopted_from_spec_pack_sha256.slice(0, 12)}…` : "(none)"}</code>
            <br />
            patterns.spel sha: <code>{patterns.adopted_patterns_spel_sha256 ? `${patterns.adopted_patterns_spel_sha256.slice(0, 12)}…` : "(none)"}</code>
            <br />
            Adopted at: <code>{patterns.adopted_at_utc || "(none)"}</code>
          </p>
        </Panel>
      </div>
    </div>
  );
}
