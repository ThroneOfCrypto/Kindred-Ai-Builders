"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "../../../components/EmptyState";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";

import { LAUNCH_PATHS } from "../../../lib/launch_paths";
import { createProjectFromLaunchPath } from "../../../lib/state";
import { readAdvancedMode, ADVANCED_MODE_EVENT } from "../../../lib/advanced_mode";

const JOURNEY_KEY = "kindred.director_journey.v1";

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function goalFromBuildIntent(buildIntent: string): any {
  const b = String(buildIntent || "").toLowerCase();
  if (b.includes("market") || b.includes("commerce") || b.includes("retail") || b.includes("store")) return "sell";
  if (b.includes("community") || b.includes("social") || b.includes("forum") || b.includes("club")) return "organise";
  if (b.includes("learn") || b.includes("edu") || b.includes("course")) return "teach";
  if (b.includes("content") || b.includes("docs") || b.includes("wiki") || b.includes("media")) return "share";
  if (b.includes("match") || b.includes("people") || b.includes("dating")) return "match";
  if (b.includes("govern") || b.includes("dao") || b.includes("vote")) return "govern";
  if (b.includes("autom") || b.includes("ops") || b.includes("api") || b.includes("integration")) return "automate";
  return "manage";
}

function seedJourneyFromLaunchPath(args: { title: string; build_intent: string }) {
  try {
    const goal = goalFromBuildIntent(args.build_intent);
    const s = {
      v: 1,
      step: 0,
      brief_section: 0,
      seed: {
        goal,
        seriousness: "prototype",
        one_sentence: `Build ${args.title}`,
      },
    };
    localStorage.setItem(JOURNEY_KEY, JSON.stringify(s));
    try {
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
}

export default function DirectorStartPage() {
  const [filter, setFilter] = useState<string>("");
  const [projectName, setProjectName] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const [advanced, setAdvanced] = useState<boolean>(false);
  useEffect(() => {
    const refresh = () => {
      try {
        setAdvanced(readAdvancedMode());
      } catch {
        setAdvanced(false);
      }
    };
    refresh();
    const on = () => refresh();
    window.addEventListener(ADVANCED_MODE_EVENT as any, on as any);
    return () => window.removeEventListener(ADVANCED_MODE_EVENT as any, on as any);
  }, []);

  const filtered = useMemo(() => {
    const q = norm(filter);
    if (!q) return LAUNCH_PATHS;
    return LAUNCH_PATHS.filter((p) => {
      const hay = norm(`${p.title} ${p.desc} ${p.intent.build_intent} ${p.intent.primary_surface} ${p.intent.palettes.join(" ")}`);
      return hay.includes(q);
    });
  }, [filter]);

  function createFrom(lp: any) {
    setStatus("");
    try {
      // AI-first: if AI is disconnected and the Director has not explicitly opted out,
      // route them to Connect AI first (no silent downgrade).
      if (!isAiReady()) {
        window.location.href = "/director/connect-ai?next=" + encodeURIComponent("/director/start");
        return;
      }
      const name = (projectName || lp.title || "Untitled Project").trim();
      const entry = createProjectFromLaunchPath({ launch_path_id: lp.id as any, name });
      setStatus(`Created project "${entry.name}".`);

      // Seed the Director Journey so the next page feels continuous.
      seedJourneyFromLaunchPath({ title: lp.title, build_intent: String(lp.intent?.build_intent || "") });

      // Route to the staged Journey (Grandma-safe surface).
      window.location.href = "/director/journey";
    } catch (e: any) {
      setStatus(`Create failed: ${String(e?.message || e)}`);
    }
  }

  function isAiReady(): boolean {
    try {
      const opt = localStorage.getItem('kindred.ai.opt_out.v1');
      if (opt === '1' || opt === 'true') return true;
      const raw = localStorage.getItem('kindred.ai.connection.v2') || localStorage.getItem('kindred.ai.connection.v1');
      if (!raw) return false;
      const j = JSON.parse(raw);
      return Boolean(j && j.connected === true);
    } catch {
      return false;
    }
  }

  function goStartFresh() {
    if (!isAiReady()) {
      window.location.href = '/director/connect-ai';
      return;
    }
    window.location.href = '/director/journey';
  }

  function goImport() {
    if (!isAiReady()) {
      window.location.href = '/director/connect-ai';
      return;
    }
    window.location.href = '/director/import';
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Welcome</h1>
        <p>
          Choose a starter that matches your idea. Kindred will create a project and take you into a simple staged journey.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button className="btn secondary" type="button" onClick={goImport}>Import an existing repo</button>
          <button className="btn" type="button" onClick={goStartFresh}>Start from scratch</button>
          <Link className="btn secondary" href="/director/health">Health check</Link>
        </div>
      </div>

      <Callout title="Starters are deterministic" tone="info">
        <p className="small mb0">
          Starters help you begin with a sensible structure. You can still refine the plan in the Journey.
        </p>
      </Callout>

      <div className="grid">
        <Panel title="Create a new project">
          <div className="field">
            <label>Project name (optional)</label>
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g., My first product" />
          </div>

          <div className="field">
            <label>Filter starters (optional)</label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="e.g., content, community, automation" />
            <p className="small mt1">This filter only helps you find a starter. It does not change your requirements.</p>
          </div>

          {status ? <p className="small">{status}</p> : null}

          <div className="hr" />
          <div className="row">
            <Link className="btn" href="/director">Back to Director Home</Link>
            <Link className="btn" href="/docs/director">Read Director guide</Link>
          </div>
        </Panel>

        <Panel title={`Starters (${filtered.length})`}>
          {filtered.length === 0 ? (
            <EmptyState
              title="No starters match your filter"
              description="Clear the filter or try a broader term."
              actions={
                <>
                  <button className="btn" onClick={() => setFilter("")}>Clear filter</button>
                  <button className="btn" type="button" onClick={goStartFresh}>Open Journey</button>
                </>
              }
            />
          ) : (
            <div className="cards">
              {filtered.map((lp: any) => (
                <div key={lp.id} className="card">
                  <h3>{lp.title}</h3>
                  <p>{lp.desc}</p>
                  <p className="small">Focus: {lp.intent.build_intent}</p>
                  <div className="row mt1">
                    <button className="btn primary" onClick={() => createFrom(lp)}>Use starter</button>
                    {advanced ? (
                      <Link className="btn" href={`/builder/new?mode=director&step=launch`}>Advanced customize</Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
