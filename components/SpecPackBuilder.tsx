"use client";

import { useMemo, useState } from "react";
import launchPaths from "@/sdde/contracts/launch_paths.json";

type Tradeoffs = {
  speedVsQuality: number;
  simplicityVsPower: number;
  safetyVsFreedom: number;
};

type Palette = { id: string; label: string; desc: string };

type LaunchPathDef = {
  id: string;
  category: string;
  label: string;
  desc: string;
  recommendedPalettes: string[];
  defaultTradeoffs: Tradeoffs;
};

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

type Step = 1 | 2 | 3 | 4;

export default function SpecPackBuilder() {
  const catalog = (launchPaths as unknown as LaunchPathDef[]);
  const fallback = catalog.length > 0 ? catalog[0].id : "quick_saas_v1";

  const [step, setStep] = useState<Step>(1);
  const [launchPath, setLaunchPath] = useState<string>(fallback);

  const current = useMemo(() => {
    const found = catalog.find((x) => x.id === launchPath);
    return found ?? catalog[0] ?? {
      id: "quick_saas_v1",
      category: "Build new",
      label: "Quick SaaS",
      desc: "Fallback launch path.",
      recommendedPalettes: ["content_media"],
      defaultTradeoffs: { speedVsQuality: 0, simplicityVsPower: 0, safetyVsFreedom: 0 }
    };
  }, [catalog, launchPath]);

  const [productName, setProductName] = useState("My Project");
  const [oneLiner, setOneLiner] = useState("A project generated via an offline, guided SDDE builder.");

  const [selected, setSelected] = useState<Set<string>>(new Set(current.recommendedPalettes));
  const [tradeoffs, setTradeoffs] = useState<Tradeoffs>({ ...current.defaultTradeoffs });

  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "working" }
    | { kind: "done" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const categories = useMemo(() => {
    const m = new Map<string, LaunchPathDef[]>();
    for (const lp of catalog) {
      const arr = m.get(lp.category) ?? [];
      arr.push(lp);
      m.set(lp.category, arr);
    }
    return Array.from(m.entries());
  }, [catalog]);

  function resetForLaunchPath(nextId: string) {
    setLaunchPath(nextId);
    const lp = catalog.find((x) => x.id === nextId) ?? current;
    setSelected(new Set(lp.recommendedPalettes));
    setTradeoffs({ ...lp.defaultTradeoffs });
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
    return true;
  }

  async function generateZip() {
    setStatus({ kind: "working" });

    const payload = {
      launchPath,
      productName: productName.trim(),
      oneLiner: oneLiner.trim(),
      palettes: Array.from(selected),
      tradeoffs
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
            <div style={{ fontWeight: 700 }}>Offline Builder Wizard</div>
            <div className="small">Step {step} of 4 • No wallet • No keys • No database</div>
          </div>
          <button
            className="btn"
            onClick={() => {
              setStep(1);
              resetForLaunchPath(fallback);
              setProductName("My Project");
              setOneLiner("A project generated via an offline, guided SDDE builder.");
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
        <p className="small">
          Launch Path sets defaults (recommended palettes + tradeoffs) and tells SDDE what kind of build you want.
          This is how we cover everything in the book, including upgrading an existing site.
        </p>

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
                      border: launchPath === lp.id ? "1px solid rgba(255,255,255,0.6)" : undefined
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{lp.label}</div>
                    <div className="small">{lp.desc}</div>
                    <div className="small" style={{ marginTop: 6 }}>
                      Recommended: {lp.recommendedPalettes.join(", ")}
                    </div>
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
        <p className="small">Give the system enough signal to generate a meaningful spec pack.</p>

        <div className="card">
          <div className="small">Selected Launch Path: <b>{current.label}</b></div>
          <div className="small">{current.desc}</div>
        </div>

        <div className="card">
          <div className="row">
            <label className="small" htmlFor="productName">Project name</label>
            <input
              id="productName"
              className="btn"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="My Project"
            />
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <label className="small" htmlFor="oneLiner">One-liner</label>
            <input
              id="oneLiner"
              className="btn"
              value={oneLiner}
              onChange={(e) => setOneLiner(e.target.value)}
              placeholder="What does it do?"
            />
          </div>
        </div>
      </div>
    );
  }

  function Step3PalettesAndTradeoffs() {
    const recommended = current.recommendedPalettes;

    return (
      <div className="card">
        <h2>Palettes & Tradeoffs</h2>
        <p className="small">
          These defaults come from the Launch Path. Keep it small to ship the first slice.
        </p>

        <div className="card">
          <h3>Pick Interaction Palettes</h3>
          <p className="small">Recommended palettes are pre-checked.</p>

          <div style={{ display: "grid", gap: 10 }}>
            {ALL_PALETTES.map((p) => {
              const isRec = recommended.includes(p.id);
              const isOn = selected.has(p.id);
              return (
                <label key={p.id} className="card" style={{ cursor: "pointer" }}>
                  <div className="row">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => togglePalette(p.id)}
                    />
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
          <p className="small">-2 = left, +2 = right. Defaults come from the Launch Path.</p>

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

  function Step4ReviewAndDownload() {
    return (
      <div className="card">
        <h2>Review → Download</h2>
        <p className="small">This generates a ZIP you can later import into SDDE tools.</p>

        <div className="card">
          <div><span className="small">Launch Path:</span> <b>{launchPath}</b></div>
          <div><span className="small">Project:</span> <b>{productName.trim() || "(missing)"}</b></div>
          <div className="small" style={{ marginTop: 6 }}>{oneLiner.trim()}</div>
          <div className="small" style={{ marginTop: 10 }}>
            Palettes: {Array.from(selected).join(", ")}
          </div>
          <div className="small" style={{ marginTop: 10 }}>
            Tradeoffs: speed_vs_quality={tradeoffs.speedVsQuality}, simplicity_vs_power={tradeoffs.simplicityVsPower}, safety_vs_freedom={tradeoffs.safetyVsFreedom}
          </div>
        </div>

        <div className="row">
          <button className="btn" onClick={generateZip} disabled={status.kind === "working" || !productName.trim()}>
            {status.kind === "working" ? "Generating…" : "Download Spec Pack (.zip)"}
          </button>
          {status.kind === "done" && <span className="small">Downloaded ✅</span>}
          {status.kind === "error" && <span className="small">Error: {status.message}</span>}
        </div>

        <p className="small" style={{ marginTop: 10 }}>
          Next: add “Import Pack → Generate first slice” in the web app (still offline).
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
        <button
          className="btn"
          onClick={() => setStep((s) => (s < 4 ? ((s + 1) as Step) : s))}
          disabled={step === 4 || !canNext()}
        >
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
      {step === 3 && <Step3PalettesAndTradeoffs />}
      {step === 4 && <Step4ReviewAndDownload />}

      <NavButtons />
    </div>
  );
}
