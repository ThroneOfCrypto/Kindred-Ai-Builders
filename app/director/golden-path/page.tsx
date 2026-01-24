"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { PrimaryButton, SecondaryButton } from "../../../components/Buttons";

import { LAUNCH_PATHS, type LaunchPathId } from "../../../lib/launch_paths";
import { createProjectFromLaunchPath, loadProjectStateById, saveProjectStateById } from "../../../lib/state";
import { goldenPathSeedForLaunchPath } from "../../../lib/golden_path";
import { createGoldenPathSeedProposal, type GoldenPathSeedProposalResult } from "../../../lib/golden_path_proposal";
import type { ProjectState } from "../../../lib/types";
import { APP_VERSION } from "../../../lib/version";


function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function demoGoldenPathExportPayload() {
  // Deterministic demo payload (no user data). Intended for CI/demo proof bundles.
  return {
    schema: "kindred.golden_path_export.v1",
    exported_at_utc: "1980-01-01T00:00:00.000Z",
    app_version: APP_VERSION,
    events: [
      { ts_utc: "1980-01-01T00:00:00.000Z", event: "page_view", page: "/director/golden-path", details: { demo: true } },
      { ts_utc: "1980-01-01T00:00:00.000Z", event: "create_project", page: "/director/golden-path", details: { demo: true } },
      { ts_utc: "1980-01-01T00:00:00.000Z", event: "open_ship", page: "/director/ship", details: { demo: true } },
    ],
  };
}

async function saveDemoEvidence() {
  const payload = demoGoldenPathExportPayload();
  const res = await fetch("/api/evidence/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "golden_path_export", payload }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(j?.hint || j?.error || `HTTP ${res.status}`);
  }
  return j;
}

function applySeedDrafts(state: ProjectState, seed: { recommended_library_ids: string[]; recommended_pattern_ids: string[]; recommended_kit_ids: string[] }): ProjectState {
  const s: any = { ...state };
  s.director = { ...(s.director || {}), schema: "kindred.director_state.v1" };

  const libs: any = { ...(s.director.libraries_v1 || {}) };
  libs.schema = "kindred.director_libraries.v1";
  libs.draft_library_ids = Array.isArray(seed.recommended_library_ids) ? seed.recommended_library_ids : [];
  s.director.libraries_v1 = libs;

  const pats: any = { ...(s.director.patterns_v1 || {}) };
  pats.schema = "kindred.director_patterns.v1";
  pats.draft_pattern_ids = Array.isArray(seed.recommended_pattern_ids) ? seed.recommended_pattern_ids : [];
  s.director.patterns_v1 = pats;

  const kits: any = { ...(s.director.kits_v1 || {}) };
  kits.schema = "kindred.director_kits.v1";
  kits.draft_kit_ids = Array.isArray(seed.recommended_kit_ids) ? seed.recommended_kit_ids : [];
  s.director.kits_v1 = kits;

  return s as ProjectState;
}

export default function DirectorGoldenPathPage() {
  const router = useRouter();

  const [filter, setFilter] = useState<string>("");
  const [selected, setSelected] = useState<LaunchPathId>("content_site_basic");
  const [projectName, setProjectName] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<GoldenPathSeedProposalResult | null>(null);
  const [status, setStatus] = useState<string>("");

  const filtered = useMemo(() => {
    const q = norm(filter);
    if (!q) return LAUNCH_PATHS;
    return LAUNCH_PATHS.filter((p) => {
      const hay = norm(`${p.title} ${p.desc} ${p.intent.build_intent} ${p.intent.primary_surface} ${p.intent.palettes.join(" ")}`);
      return hay.includes(q);
    });
  }, [filter]);

  const selectedLaunch = useMemo(() => LAUNCH_PATHS.find((x) => x.id === selected) || LAUNCH_PATHS[0], [selected]);

  async function createGoldenProject() {
    setBusy(true);
    setResult(null);
    setStatus("");

    try {
      const name = (projectName || selectedLaunch.title || "Untitled Project").trim();
      const entry = createProjectFromLaunchPath({ launch_path_id: selected, name });

      // Re-load to ensure normalization ran, then seed drafts deterministically.
      const state = loadProjectStateById(entry.id);
      const seed = goldenPathSeedForLaunchPath(selected);
      const seeded = applySeedDrafts(state, {
        recommended_library_ids: seed.recommended_library_ids,
        recommended_pattern_ids: seed.recommended_pattern_ids,
        recommended_kit_ids: seed.recommended_kit_ids,
      });
      saveProjectStateById(entry.id, seeded);
      try {
        window.dispatchEvent(new CustomEvent("kindred_state_changed"));
      } catch {
        // ignore
      }

      // Create a single seed proposal that writes real SPEL modules.
      setStatus("Creating Golden Path seed proposal…");
      const r = await createGoldenPathSeedProposal({ project_id: entry.id, state: seeded, seed });
      setResult(r);

      if (r.ok) {
        setStatus("Golden Path seed proposal created.");
        // Route through the schema-locked Intent Card step (chips-only intake + check answers).
        router.push(`/director/intent?focus=${encodeURIComponent(r.proposal_id)}&next=${encodeURIComponent("/director/ship")}`);
      } else {
        setStatus("Golden Path seed proposal failed.");
      }
    } catch (e: any) {
      setStatus(`Create failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Golden Path</h1>
        <p>
          A single guided route from spark → locked Repo Pack. You select a starter, Kindred creates one deterministic proposal that writes
          real SPEL modules (Libraries / Patterns / Integrations), then you adopt it and follow Ship.
        </p>
      </div>

      <Callout title="Director-first, deterministic" tone="info">
        <p className="small" style={{ margin: 0 }}>
          No free-text requirement entry. Typing is only used for filtering. The system remains offline-first and auditable. AI is still
          proposal-only and server-side.
        </p>
      </Callout>

      <div className="grid">
        <Panel title="Create a Golden Path project">
          <div className="field">
            <label>Project name (optional)</label>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g., My first product" />
            <p className="small" style={{ marginTop: 8 }}>
              If blank, Kindred uses the selected starter name.
            </p>
          </div>

          <div className="field">
            <label>Filter starters (typing only)</label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="e.g., website, community, api" />
          </div>

          <div className="field">
            <label>Selected starter</label>
            <div className="small">
              <strong>{selectedLaunch.title}</strong> — {selectedLaunch.desc}
            </div>
          </div>

          {status ? <p className="small">{status}</p> : null}

          {result && !result.ok ? (
            <Callout title={result.error} tone="warn">
              <pre style={{ whiteSpace: "pre-wrap" }}>{(result.details || []).slice(0, 10).join("\n")}</pre>
            </Callout>
          ) : null}

          <div className="hr" />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <PrimaryButton onClick={createGoldenProject} disabled={busy}>
              Create Golden Path project
            </PrimaryButton>
            <SecondaryButton href="/director/ship">Ship (checklist)</SecondaryButton>
            <SecondaryButton href="/docs/golden-path">Read guide</SecondaryButton>
            <SecondaryButton
              onClick={async () => {
                try {
                  setBusy(true);
                  setStatus("Saving demo evidence…");
                  const j = await saveDemoEvidence();
                  setStatus("Saved: " + (j?.wrote || []).join(", "));
                } catch (e: any) {
                  setStatus(String(e?.message || e || "Failed")); 
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Generate demo Golden Path evidence
            </SecondaryButton>
          </div>
        </Panel>

        <Panel title={`Starters (${filtered.length})`}>
          <div className="cards">
            {filtered.map((lp) => {
              const isSel = lp.id === selected;
              return (
                <div
                  key={lp.id}
                  className={isSel ? "card active" : "card"}
                  onClick={() => setSelected(lp.id)}
                  style={{ cursor: "pointer" }}
                >
                  <h3>{lp.title}</h3>
                  <p>{lp.desc}</p>
                  <p className="small">
                    Sets: {lp.intent.build_intent} • {lp.intent.primary_surface} • {lp.intent.palettes.length} palettes
                  </p>
                </div>
              );
            })}
          </div>

          <div className="hr" />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <a className="btn" href="/director/start">Quickstart (classic)</a>
            <a className="btn" href="/director">Back to Director Home</a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
