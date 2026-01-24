"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "../../../components/Panel";
import { Stepper } from "../../../components/Stepper";
import { getCurrentProjectId, loadState } from "../../../lib/state";
import { deriveDoneSteps } from "../../../lib/state";
import {
  DIRECTOR_PHASES,
  directorPhaseDone,
  pickBuilderStepForDirectorPhase,
  type DirectorPhaseId,
} from "../../../lib/director_steps";

function safePhaseId(raw: string): DirectorPhaseId {
  const s = (raw || "").trim();
  if (s === "brief" || s === "structure" || s === "style" || s === "review") return s;
  return "brief";
}

export default function DirectorBuildPage() {
  const [active, setActive] = useState<DirectorPhaseId>("brief");
  const [doneBuilder, setDoneBuilder] = useState<Set<string>>(() => new Set());
  const [projectId, setProjectId] = useState<string>("");

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const phase = safePhaseId(url.searchParams.get("phase") || "");
      setActive(phase);
    } catch {
      setActive("brief");
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      try {
        const pid = getCurrentProjectId();
        setProjectId(pid);
        const s = loadState();
        setDoneBuilder(deriveDoneSteps(s));
      } catch {
        setDoneBuilder(new Set());
      }
    };
    refresh();
    window.addEventListener("kindred_state_changed", refresh);
    window.addEventListener("kindred_project_changed", refresh);
    return () => {
      window.removeEventListener("kindred_state_changed", refresh);
      window.removeEventListener("kindred_project_changed", refresh);
    };
  }, []);

  const donePhases = useMemo(() => {
    const s = new Set<string>();
    for (const p of DIRECTOR_PHASES) {
      if (directorPhaseDone(p.id, doneBuilder)) s.add(p.id);
    }
    return s;
  }, [doneBuilder]);

  function openBuilderForPhase(phase: DirectorPhaseId) {
    const step = pickBuilderStepForDirectorPhase(phase, doneBuilder);
    window.location.href = `/builder/new?mode=director&step=${encodeURIComponent(step)}`;
  }

  const activeInfo = DIRECTOR_PHASES.find((p) => p.id === active) || DIRECTOR_PHASES[0];

  return (
    <div className="container">
      <div className="hero">
        <h1>Guided Build</h1>
        <p>
          A guided path from spark → blueprint. Every step writes deterministic artefacts under the hood.
        </p>
      </div>

      <div className="grid">
        <Panel title="Director phases">
          <Stepper steps={DIRECTOR_PHASES} activeId={active} doneIds={donePhases} onSelect={(id) => setActive(id as DirectorPhaseId)} />
          <div className="hr" />
          <p className="small">
            Current project: <strong>{projectId || "(none selected)"}</strong>
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => openBuilderForPhase(active)}>
              Continue ({activeInfo.title})
            </button>
            <a className="btn" href="/director/proposals">
              Review proposals
            </a>
            <a className="btn" href="/director/preview">
              Preview packs
            </a>
          </div>
        </Panel>

        <Panel title={activeInfo.title}>
          {active === "brief" ? (
            <div>
              <p>
                Set direction: what you’re making, who it’s for, what success looks like, and what constraints matter.
              </p>
              <ul className="small">
                <li>Pick a Launch Path (starter), then adjust Intent + Palettes.</li>
                <li>Write the brief like you’re briefing a world-class team.</li>
                <li>Be explicit about non-goals and constraints (offline-first, no payments, etc).</li>
              </ul>
            </div>
          ) : null}

          {active === "structure" ? (
            <div>
              <p>Turn your direction into journeys and pages: actors, scenes, and the information architecture.</p>
              <ul className="small">
                <li>Define the main flows a user should complete.</li>
                <li>Build the page tree and low-fidelity sections.</li>
                <li>Keep it minimal. You can iterate later via proposals.</li>
              </ul>
            </div>
          ) : null}

          {active === "style" ? (
            <div>
              <p>Give the work its voice and guardrails: copy blocks, tone, and design tokens.</p>
              <ul className="small">
                <li>Draft key headlines + calls-to-action.</li>
                <li>Set token knobs (spacing, radius, typography scale) — consistent beats &gt; custom chaos.</li>
              </ul>
            </div>
          ) : null}

          {active === "review" ? (
            <div>
              <p>Review and export deterministic deliverables. Use Ship to attach proof (verify reports + backups).</p>
              <ul className="small">
                <li>Run gates, fix issues, then export your Spec Pack.</li>
                <li>Prefer “lock” when you want to freeze truth before iterating again.</li>
              </ul>
            </div>
          ) : null}

          <div className="hr" />
          <div className="row">
            <button className="btn" onClick={() => openBuilderForPhase(active)}>
              Continue in Builder
            </button>
            <a className="btn" href="/director/proposals">
              Review proposals
            </a>
            <a className="btn" href="/director/ship">Ship & proof</a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
