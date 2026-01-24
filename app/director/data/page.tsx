"use client";

import React, { useEffect, useMemo, useState } from "react";

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

import { DATA_SOURCES_V1, DATA_SINKS_V1, DATA_TRIGGERS_V1 } from "../../../lib/data_catalog";
import { dataBindingsSddlText, normalizeDataBindings, type DataBindingsV1 } from "../../../lib/data_bindings_spel";

import { readAdvancedMode } from "../../../lib/advanced_mode";
import { saveProposal, type ProposalV2 } from "../../../lib/proposals";
import { decodeBase64, encodeBase64, tryReadZip, type SpecPack } from "../../../lib/spec_pack";
import { diffSpecPacks } from "../../../lib/pack_diff";
import { buildPatchFromPacks } from "../../../lib/spec_pack_patch";
import { zipDeterministic } from "../../../lib/deterministic_zip";
import { stableJsonText } from "../../../lib/stable_json";
import { sha256Hex } from "../../../lib/hash";
import { isPackLocked } from "../../../lib/pack_governance";

function ensureDirectorDataBindingsShape(s: ProjectState): ProjectState {
  const next: any = { ...s };
  next.director = { ...(next.director || {}), schema: "kindred.director_state.v1" };
  if (!next.director.data_bindings_v1 || typeof next.director.data_bindings_v1 !== "object") {
    next.director.data_bindings_v1 = {
      schema: "kindred.director_data_bindings.v1",
      catalog_version: "v1",
      draft: { source_id: "", sink_ids: [], trigger_id: "" },
      adopted: { source_id: "", sink_ids: [], trigger_id: "" },
    };
  }
  if (!next.director.data_bindings_v1.draft || typeof next.director.data_bindings_v1.draft !== "object") {
    next.director.data_bindings_v1.draft = { source_id: "", sink_ids: [], trigger_id: "" };
  }
  if (!next.director.data_bindings_v1.adopted || typeof next.director.data_bindings_v1.adopted !== "object") {
    next.director.data_bindings_v1.adopted = { source_id: "", sink_ids: [], trigger_id: "" };
  }
  next.director.data_bindings_v1.draft = normalizeDataBindings(next.director.data_bindings_v1.draft);
  next.director.data_bindings_v1.adopted = normalizeDataBindings(next.director.data_bindings_v1.adopted);
  return next;
}

function warningsToCallout(w: string, setWarn: (s: string) => void) {
  setWarn((prev) => {
    const next = prev ? `${prev}\n• ${w}` : `• ${w}`;
    return next;
  });
}

function buildSpecPackWithDataBindings(basePack: SpecPack, bindings: DataBindingsV1): { zip: Uint8Array; pack: SpecPack; warnings: string[] } {
  const warnings: string[] = [];
  const files: Record<string, Uint8Array> = {};
  for (const [path, f] of basePack.fileMap.entries()) files[path] = f.bytes;

  const spelText = dataBindingsSddlText({ bindings });
  files["spel/data_bindings.spel"] = new TextEncoder().encode(spelText);

  // Update manifest contents to include the new file if missing.
  try {
    const raw = files["spec_pack_manifest.json"];
    const parsed = raw ? JSON.parse(new TextDecoder().decode(raw)) : null;
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.contents)) {
      if (!parsed.contents.includes("spel/data_bindings.spel")) parsed.contents.push("spel/data_bindings.spel");
      files["spec_pack_manifest.json"] = new TextEncoder().encode(stableJsonText(parsed, 2));
    } else {
      warnings.push("spec_pack_manifest.json could not be updated cleanly; regenerating minimal manifest.");
    }
  } catch {
    warnings.push("spec_pack_manifest.json could not be parsed; regenerating minimal manifest.");
  }

  if (!files["spec_pack_manifest.json"]) {
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
  if (!parsed.ok) throw new Error("Failed to build a Spec Pack with injected data bindings module.");
  return { zip, pack: parsed.pack, warnings };
}

export default function DirectorDataBindingsPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [state, setState] = useState<ProjectState | null>(null);
  const [status, setStatus] = useState<string>("");
  const [warn, setWarn] = useState<string>("");

  useEffect(() => {
    const refresh = () => {
      const pid = getCurrentProjectId();
      setProjectId(pid);
      const st = ensureDirectorDataBindingsShape(loadProjectStateById(pid));
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

  const bindings = useMemo(() => {
    const d = (state as any)?.director?.data_bindings_v1;
    return {
      draft: normalizeDataBindings(d?.draft || { source_id: "", sink_ids: [], trigger_id: "" }),
      adopted: normalizeDataBindings(d?.adopted || { source_id: "", sink_ids: [], trigger_id: "" }),
      adopted_from_spec_pack_sha256: typeof d?.adopted_from_spec_pack_sha256 === "string" ? d.adopted_from_spec_pack_sha256 : "",
      adopted_data_bindings_spel_sha256: typeof d?.adopted_data_bindings_spel_sha256 === "string" ? d.adopted_data_bindings_spel_sha256 : "",
      adopted_at_utc: typeof d?.adopted_at_utc === "string" ? d.adopted_at_utc : "",
    };
  }, [state]);

  const spelPreview = useMemo(() => dataBindingsSddlText({ bindings: bindings.draft }), [bindings.draft]);

  async function persistDraft(nextDraft: DataBindingsV1) {
    if (!state) return;
    const next = ensureDirectorDataBindingsShape({ ...state });
    (next as any).director.data_bindings_v1.draft = normalizeDataBindings(nextDraft);
    saveProjectStateById(projectId, next);
    setState(next);
    try {
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  }

  function setSource(source_id: string) {
    persistDraft({ ...bindings.draft, source_id });
  }

  function setTrigger(trigger_id: string) {
    persistDraft({ ...bindings.draft, trigger_id });
  }

  function toggleSink(id: string) {
    const set = new Set(bindings.draft.sink_ids);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    persistDraft({ ...bindings.draft, sink_ids: Array.from(set) });
  }

  function resetDraft() {
    persistDraft({ source_id: "", sink_ids: [], trigger_id: "" });
  }

  async function createDataBindingsProposal() {
    setStatus("");
    setWarn("");

    if (!state) return;
    if (!projectId) {
      setWarn("No project selected.");
      return;
    }

    if (isPackLocked(projectId)) {
      setWarn("Spec Pack is locked for this project. Unlock it before creating a data bindings proposal.");
      return;
    }

    // Load (or synthesize) base Spec Pack.
    let basePack: SpecPack | null = null;
    try {
      const key = lastBasePackKeyForProject(projectId);
      const b64 = localStorage.getItem(key) || localStorage.getItem(LEGACY_LAST_BASE_PACK_KEY) || "";
      if (b64) {
        const decoded = decodeBase64(b64);
        const parsed = tryReadZip(decoded);
        if (parsed.ok) basePack = parsed.pack;
      }
    } catch {
      basePack = null;
    }

    if (!basePack) {
      const synthesizedZip = (await import("../../../lib/export_pack")).buildSpecPack(state, { include_council_dsl: readAdvancedMode() });
      const parsed = tryReadZip(synthesizedZip);
      if (!parsed.ok) {
        setWarn("Could not synthesize a Base Spec Pack.");
        return;
      }
      basePack = parsed.pack;
      try {
        const b64 = encodeBase64(synthesizedZip);
        localStorage.setItem(lastBasePackKeyForProject(projectId), b64);
        localStorage.setItem(LEGACY_LAST_BASE_PACK_KEY, b64);
      } catch {
        // ignore
      }
    }

    const proposalBuilt = buildSpecPackWithDataBindings(basePack, bindings.draft);
    for (const w of proposalBuilt.warnings) warningsToCallout(w, setWarn);

    const diff = diffSpecPacks(basePack, proposalBuilt.pack);
    const patch = await buildPatchFromPacks({
      base: basePack,
      proposal: proposalBuilt.pack,
      patch_text: diff.fullPatch,
      report: diff.report,
      summary: "Data bindings module (sources/sinks/triggers)",
      base_project_id: state.project.id,
    });

    const proposalZip = proposalBuilt.zip;
    const baseSha = ""; // base hash isn't required for proposal record
    const proposalSha = await sha256Hex(proposalZip);
    const spelSha = await sha256Hex(new TextEncoder().encode(spelPreview));

    const proposal: ProposalV2 = {
      schema: "kindred.proposal.v2",
      id: `proposal_${proposalSha.slice(0, 12)}`,
      kind: "spec_pack_patch",
      created_at_utc: new Date().toISOString(),
      summary: "Wire data in/out (Data Bindings)",
      rationale: [
        "This proposal adds a provider-neutral SPEL module describing where data comes from and where it goes.",
        "No secrets are included. Provider specifics belong in integrations.",
      ],
      patch,
      evidence: {
        base_pack_sha256: baseSha,
        proposal_pack_sha256: proposalSha,
        spel_file_sha256: spelSha,
      },
      apply: {
        next_step_href: "/director/proposals",
        next_step_label: "Review proposals",
      },
    };

    try {
      saveProposal(proposal);
      setStatus("Created proposal. Go to Proposals to accept it.");

      // Update local director draft record (keeps the screen consistent)
      const next = ensureDirectorDataBindingsShape({ ...state });
      (next as any).director.data_bindings_v1.catalog_version = "v1";
      saveProjectStateById(projectId, next);
      setState(next);
    } catch (e: any) {
      setWarn(`Could not save proposal: ${String(e?.message || e)}`);
    }
  }

  const adoptedSummary = useMemo(() => {
    if (!bindings.adopted_from_spec_pack_sha256) return "(not adopted yet)";
    return `Adopted from Spec Pack ${bindings.adopted_from_spec_pack_sha256.slice(0, 12)}… at ${bindings.adopted_at_utc || "(time unknown)"}`;
  }, [bindings.adopted_from_spec_pack_sha256, bindings.adopted_at_utc]);

  return (
    <div className="container">
      <div className="hero">
        <h1>Data In/Out</h1>
        <p>
          Pick <strong>where data comes from</strong>, <strong>where it goes</strong>, and <strong>when it propagates</strong>.
          This stays provider-neutral and composes with your 14 palettes and pattern selections.
        </p>
      </div>

      <div className="grid">
        <Panel title="Draft wiring (schema-locked)">
          <p className="small">
            Current project: <strong>{projectId || "(none selected)"}</strong>
          </p>
          <div className="hr" />

          <label className="small">Source</label>
          <select className="input" value={bindings.draft.source_id} onChange={(e) => setSource(e.target.value)}>
            <option value="">(unset)</option>
            {DATA_SOURCES_V1.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <p className="small dim">{DATA_SOURCES_V1.find((x) => x.id === bindings.draft.source_id)?.description || ""}</p>

          <div className="hr" />

          <label className="small">Trigger</label>
          <select className="input" value={bindings.draft.trigger_id} onChange={(e) => setTrigger(e.target.value)}>
            <option value="">(unset)</option>
            {DATA_TRIGGERS_V1.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="small dim">{DATA_TRIGGERS_V1.find((x) => x.id === bindings.draft.trigger_id)?.description || ""}</p>

          <div className="hr" />

          <label className="small">Sinks</label>
          <div className="cards">
            {DATA_SINKS_V1.map((k) => {
              const on = bindings.draft.sink_ids.includes(k.id);
              return (
                <button key={k.id} className={`card ${on ? "active" : ""}`} onClick={() => toggleSink(k.id)}>
                  <h3>{k.label}</h3>
                  <p className="small">{k.description}</p>
                </button>
              );
            })}
          </div>

          <div className="row">
            <button className="btn" onClick={resetDraft}>
              Reset
            </button>
            <button className="btn primary" onClick={createDataBindingsProposal}>
              Create proposal
            </button>
            <a className="btn" href="/director/proposals">
              Proposals
            </a>
          </div>

          {status ? <Callout kind="success" title="Status" lines={[status]} /> : null}
          {warn ? <Callout kind="warn" title="Warnings" lines={warn.split("\n")} /> : null}
        </Panel>

        <Panel title="Preview (SPEL module)">
          <p className="small">This is the provider-neutral wiring file that gets injected into your Spec Pack.</p>
          <pre className="code">{spelPreview}</pre>
          <div className="hr" />
          <p className="small dim">{adoptedSummary}</p>
          {bindings.adopted_data_bindings_spel_sha256 ? (
            <p className="small dim">Adopted file SHA: {bindings.adopted_data_bindings_spel_sha256.slice(0, 12)}…</p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
