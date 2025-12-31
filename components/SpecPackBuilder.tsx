"use client";

import { useMemo, useState } from "react";
import launchPaths from "@/sdde/contracts/launch_paths.json";
import AiConnectorsWizard, { AiConnector } from "@/components/AiConnectorsWizard";

type Tradeoffs = {
  speedVsQuality: number;
  simplicityVsPower: number;
  safetyVsFreedom: number;
};

type Actor = { id: string; label: string };
type Scene = { id: string; label: string; kind: "page" | "state" };

type LaunchPathDef = {
  id: string;
  category: string;
  label: string;
  desc: string;
  recommendedPalettes: string[];
  defaultTradeoffs: Tradeoffs;
};

type Palette = { id: string; label: string; desc: string };

const ALL_PALETTES: Palette[] = [
  { id: "identity_access", label: "Identity & Access", desc: "Roles, permissions, sessions (wallet later)." },
  { id: "communication_social", label: "Communication & Social Surfaces", desc: "Messaging, feeds, notifications, community." },
  { id: "content_media", label: "Content & Media", desc: "Posts, pages, uploads, media pipelines." },
  { id: "knowledge_learning", label: "Knowledge & Learning", desc: "Docs, lessons, onboarding, help systems." },
  { id: "search_discovery", label: "Search / Navigation & Discovery", desc: "Search, browse, taxonomy, wayfinding." },
  { id: "matching_recommendation", label: "Matching & Recommendation", desc: "Personalization, ranking, suggested items." },
  { id: "collaboration_work", label: "Collaboration & Work", desc: "Projects, tasks, workflows, review loops." },
  { id: "commerce_value", label: "Commerce & Value Exchange", desc: "Payments, billing, subscriptions, value flows." },
  { id: "governance_policy", label: "Governance / Rules & Policy", desc: "Policies, gates, rules, compliance." },
  { id: "reputation_trust_safety", label: "Reputation / Trust & Safety", desc: "Moderation, reputation, abuse prevention." },
  { id: "game_incentives", label: "Game & Incentive Mechanics", desc: "Points, quests, incentives, reward loops." },
  { id: "automation_agents", label: "Automation / Agents / Workflows", desc: "Automations, agents, orchestration." },
  { id: "infrastructure_data_files", label: "Infrastructure / Data / Files", desc: "Storage, data models, files, backups." },
  { id: "connection_integration", label: "Connection / Integration", desc: "APIs, webhooks, integrations, connectors." }
];

function normalizeId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Step = 1 | 2 | 3 | 4 | 5 | 6;

export default function SpecPackBuilder() {
  const catalog = (launchPaths as unknown as LaunchPathDef[]);
  const fallback = catalog.length > 0 ? catalog[0].id : "quick_saas_v1";

  const [step, setStep] = useState<Step>(1);
  const [launchPath, setLaunchPath] = useState<string>(fallback);

  const current = useMemo(() => {
    return catalog.find((x) => x.id === launchPath) ?? catalog[0];
  }, [catalog, launchPath]);

  const categories = useMemo(() => {
    const m = new Map<string, LaunchPathDef[]>();
    for (const lp of catalog) {
      const arr = m.get(lp.category) ?? [];
      arr.push(lp);
      m.set(lp.category, arr);
    }
    return Array.from(m.entries());
  }, [catalog]);

  const [productName, setProductName] = useState("My Project");
  const [oneLiner, setOneLiner] = useState("A project generated via an offline, guided SDDE builder.");

  const [selected, setSelected] = useState<Set<string>>(new Set(current?.recommendedPalettes ?? ["content_media"]));
  const [tradeoffs, setTradeoffs] = useState<Tradeoffs>({ ...(current?.defaultTradeoffs ?? { speedVsQuality: 0, simplicityVsPower: 0, safetyVsFreedom: 0 }) });

  const [actors, setActors] = useState<Actor[]>([
    { id: "visitor", label: "Visitor" },
    { id: "member", label: "Member" },
    { id: "admin", label: "Admin" },
    { id: "system", label: "System" }
  ]);

  const [scenes, setScenes] = useState<Scene[]>([
    { id: "landing", label: "Landing", kind: "page" },
    { id: "builder", label: "Builder", kind: "page" }
  ]);

  const [ai, setAi] = useState<AiConnector>({
    mode: "offline",
    hosted: { base_url: "https://api.openai.com/v1", default_model: "gpt-4.1-mini" },
    local: { base_url: "http://localhost:11434/v1", default_model: "llama3.1" },
    policy: { confirm_before_spend: true, daily_spend_cap_usd: null }
  });

  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "working" }
    | { kind: "done" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function resetForLaunchPath(nextId: string) {
    setLaunchPath(nextId);
    const lp = catalog.find((x) => x.id === nextId) ?? current;
    if (lp) {
      setSelected(new Set(lp.recommendedPalettes));
      setTradeoffs({ ...lp.defaultTradeoffs });
    }
    setStatus({ kind: "idle" });
  }

  function togglePalette(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function canNext(): boolean {
    if (step === 1) return true;
    if (step === 2) return productName.trim().length > 0;
    if (step === 3) return selected.size > 0;
    if (step === 4) return actors.filter(a => normalizeId(a.id) && a.label.trim()).length > 0
                      && scenes.filter(s => normalizeId(s.id) && s.label.trim()).length > 0;
    return true;
  }

  async function generateZip() {
    setStatus({ kind: "working" });

    const payload = {
      launchPath,
      productName: productName.trim(),
      oneLiner: oneLiner.trim(),
      palettes: Array.from(selected),
      tradeoffs,
      actors: actors
        .map((a) => ({ id: normalizeId(a.id), label: a.label.trim() }))
        .filter((a) => a.id && a.label),
      scenes: scenes
        .map((s) => ({ id: normalizeId(s.id), label: s.label.trim(), kind: s.kind }))
        .filter((s) => s.id && s.label),
      ai
    };

    try {
      const res = await fetch("/api/spec-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error (${res.status}): ${text}`);
      }

      const blob = await res.blob();
      downloadBlob(blob, "sdde_spec_pack.zip");
      setStatus({ kind: "done" });
    } catch (e: any) {
      setStatus({ kind: "error", message: e?.message ?? String(e) });
    }
  }

  function StepHeader() {
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700 }}>Builder Wizard</div>
            <div className="small">Step {step} of 6 • Offline-first • Deterministic export</div>
          </div>
          <button
            className="btn"
            onClick={() => {
              setStep(1);
              resetForLaunchPath(fallback);
              setProductName("My Project");
              setOneLiner("A project generated via an offline, guided SDDE builder.");
              setActors([
                { id: "visitor", label: "Visitor" },
                { id: "member", label: "Member" },
                { id: "admin", label: "Admin" },
                { id: "system", label: "System" }
              ]);
              setScenes([
                { id: "landing", label: "Landing", kind: "page" },
                { id: "builder", label: "Builder", kind: "page" }
              ]);
              setAi({
                mode: "offline",
                hosted: { base_url: "https://api.openai.com/v1", default_model: "gpt-4.1-mini" },
                local: { base_url: "http://localhost:11434/v1", default_model: "llama3.1" },
                policy: { confirm_before_spend: true, daily_spend_cap_usd: null }
              });
              setStatus({ kind: "idle" });
            }}
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  function Step1LaunchPath() {
    return (
      <div className="card">
        <h2>Choose a Launch Path</h2>
        <p className="small">This sets defaults. You refine design and connectors later.</p>

        <div style={{ display: "grid", gap: 16 }}>
          {categories.map(([cat, items]) => (
            <div key={cat} className="card">
              <h3 style={{ marginTop: 0 }}>{cat}</h3>
              <div style={{ display: "grid", gap: 12 }}>
                {items.map((lp) => (
                  <button
                    key={lp.id}
                    className="btn"
                    onClick={() => resetForLaunchPath(lp.id)}
                    style={{
                      textAlign: "left",
                      border: launchPath === lp.id ? "1px solid rgba(255,255,255,0.30)" : undefined
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{lp.label}</div>
                    <div className="small">{lp.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function Step2Basics() {
    return (
      <div className="card">
        <h2>Basics</h2>
        <div className="card">
          <div className="small">Selected Launch Path: <b>{current?.label ?? launchPath}</b></div>
          <div className="small">{current?.desc ?? ""}</div>
        </div>

        <div className="card">
          <div className="row">
            <label className="small" htmlFor="productName">Project name</label>
            <input id="productName" className="btn" value={productName} onChange={(e) => setProductName(e.target.value)} />
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <label className="small" htmlFor="oneLiner">One-liner</label>
            <input id="oneLiner" className="btn" value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} />
          </div>
        </div>
      </div>
    );
  }

  function Step3PalettesTradeoffs() {
    const recommended = current?.recommendedPalettes ?? [];
    return (
      <div className="card">
        <h2>Palettes & Tradeoffs</h2>

        <div className="card">
          <h3>Pick Interaction Palettes</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {ALL_PALETTES.map((p) => {
              const isRec = recommended.includes(p.id);
              const isOn = selected.has(p.id);
              return (
                <label key={p.id} className="card" style={{ cursor: "pointer" }}>
                  <div className="row">
                    <input type="checkbox" checked={isOn} onChange={() => togglePalette(p.id)} />
                    <div>
                      <div style={{ fontWeight: 600 }}>
                        {p.label} {isRec ? <span className="small">• recommended</span> : null}
                      </div>
                      <div className="small">{p.desc}</div>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3>Tradeoffs</h3>
          <p className="small">-2 = left, +2 = right.</p>

          <div className="card">
            <div className="small">Speed (-2) ↔ Quality (+2): {tradeoffs.speedVsQuality}</div>
            <input
              type="range"
              min={-2}
              max={2}
              step={1}
              value={tradeoffs.speedVsQuality}
              onChange={(e) => setTradeoffs((t) => ({ ...t, speedVsQuality: Number(e.target.value) }))}
              style={{ width: "100%" }}
            />
          </div>

          <div className="card">
            <div className="small">Simplicity (-2) ↔ Power (+2): {tradeoffs.simplicityVsPower}</div>
            <input
              type="range"
              min={-2}
              max={2}
              step={1}
              value={tradeoffs.simplicityVsPower}
              onChange={(e) => setTradeoffs((t) => ({ ...t, simplicityVsPower: Number(e.target.value) }))}
              style={{ width: "100%" }}
            />
          </div>

          <div className="card">
            <div className="small">Safety (-2) ↔ Freedom (+2): {tradeoffs.safetyVsFreedom}</div>
            <input
              type="range"
              min={-2}
              max={2}
              step={1}
              value={tradeoffs.safetyVsFreedom}
              onChange={(e) => setTradeoffs((t) => ({ ...t, safetyVsFreedom: Number(e.target.value) }))}
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </div>
    );
  }

  function Step4DesignStudio() {
    return (
      <div className="card">
        <h2>Design Studio v0</h2>
        <p className="small">
          Define Actors and Scenes. This is the beginning of “specific design” without ambiguity.
        </p>

        <div className="card">
          <h3>Actors</h3>
          {actors.map((a, idx) => (
            <div key={idx} className="row" style={{ gap: 8, marginTop: 8 }}>
              <input
                className="btn"
                value={a.id}
                onChange={(e) => {
                  const next = [...actors];
                  next[idx] = { ...next[idx], id: e.target.value };
                  setActors(next);
                }}
                placeholder="actor_id"
              />
              <input
                className="btn"
                value={a.label}
                onChange={(e) => {
                  const next = [...actors];
                  next[idx] = { ...next[idx], label: e.target.value };
                  setActors(next);
                }}
                placeholder="Label"
              />
              <button className="btn" onClick={() => setActors(actors.filter((_, i) => i !== idx))}>Remove</button>
            </div>
          ))}
          <button className="btn" onClick={() => setActors([...actors, { id: "new_actor", label: "New Actor" }])} style={{ marginTop: 10 }}>
            Add Actor
          </button>
        </div>

        <div className="card">
          <h3>Scenes</h3>
          {scenes.map((s, idx) => (
            <div key={idx} className="row" style={{ gap: 8, marginTop: 8 }}>
              <input
                className="btn"
                value={s.id}
                onChange={(e) => {
                  const next = [...scenes];
                  next[idx] = { ...next[idx], id: e.target.value };
                  setScenes(next);
                }}
                placeholder="scene_id"
              />
              <input
                className="btn"
                value={s.label}
                onChange={(e) => {
                  const next = [...scenes];
                  next[idx] = { ...next[idx], label: e.target.value };
                  setScenes(next);
                }}
                placeholder="Label"
              />
              <select
                className="btn"
                value={s.kind}
                onChange={(e) => {
                  const next = [...scenes];
                  const kind = e.target.value === "state" ? "state" : "page";
                  next[idx] = { ...next[idx], kind };
                  setScenes(next);
                }}
              >
                <option value="page">page</option>
                <option value="state">state</option>
              </select>
              <button className="btn" onClick={() => setScenes(scenes.filter((_, i) => i !== idx))}>Remove</button>
            </div>
          ))}
          <button className="btn" onClick={() => setScenes([...scenes, { id: "new_scene", label: "New Scene", kind: "page" }])} style={{ marginTop: 10 }}>
            Add Scene
          </button>
        </div>
      </div>
    );
  }

  function Step5AiConnectors() {
    return (
      <div className="card">
        <h2>AI Connectors</h2>
        <AiConnectorsWizard value={ai} onChange={setAi} />
      </div>
    );
  }

  function Step6ReviewDownload() {
    return (
      <div className="card">
        <h2>Review → Download</h2>

        <div className="card">
          <div><span className="small">Launch Path:</span> <b>{launchPath}</b></div>
          <div><span className="small">Project:</span> <b>{productName.trim() || "(missing)"}</b></div>
          <div className="small" style={{ marginTop: 6 }}>{oneLiner.trim()}</div>

          <div className="small" style={{ marginTop: 10 }}>Palettes: {Array.from(selected).join(", ")}</div>
          <div className="small" style={{ marginTop: 10 }}>Actors: {actors.map((a) => normalizeId(a.id)).filter(Boolean).join(", ")}</div>
          <div className="small" style={{ marginTop: 10 }}>Scenes: {scenes.map((s) => normalizeId(s.id)).filter(Boolean).join(", ")}</div>
          <div className="small" style={{ marginTop: 10 }}>AI mode: {ai.mode}</div>
        </div>

        <div className="row">
          <button className="btn" onClick={generateZip} disabled={status.kind === "working" || !productName.trim()}>
            {status.kind === "working" ? "Generating…" : "Download Spec Pack (.zip)"}
          </button>
          {status.kind === "done" && <span className="small">Downloaded ✅</span>}
          {status.kind === "error" && <span className="small">Error: {status.message}</span>}
        </div>

        <p className="small" style={{ marginTop: 10 }}>
          The ZIP includes blueprint JSON files plus a secrets placement guide. Secrets are never stored in project files.
        </p>
      </div>
    );
  }

  function NavButtons() {
    return (
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn" onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))} disabled={step === 1}>
          Back
        </button>
        <button className="btn" onClick={() => setStep((s) => (s < 6 ? ((s + 1) as Step) : s))} disabled={step === 6 || !canNext()}>
          Next
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <StepHeader />
      {step === 1 && <Step1LaunchPath />}
      {step === 2 && <Step2Basics />}
      {step === 3 && <Step3PalettesTradeoffs />}
      {step === 4 && <Step4DesignStudio />}
      {step === 5 && <Step5AiConnectors />}
      {step === 6 && <Step6ReviewDownload />}
      <NavButtons />
    </div>
  );
}
