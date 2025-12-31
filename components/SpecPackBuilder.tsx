"use client";

import { useMemo, useState } from "react";

type Tradeoffs = {
  speedVsQuality: number;
  simplicityVsPower: number;
  safetyVsFreedom: number;
};

type Palette = { id: string; label: string; desc: string };

const ALL_PALETTES: Palette[] = [
  { id: "identity_access", label: "Identity & Access", desc: "Wallet login, roles, permissions, sessions." },
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
  { id: "connection_integration", label: "Connection / Integration", desc: "APIs, webhooks, integrations, connectors." },
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

export default function SpecPackBuilder() {
  const defaultSelected = useMemo(() => new Set<string>(["content_media", "automation_agents", "commerce_value"]), []);
  const [productName, setProductName] = useState("My SaaS");
  const [oneLiner, setOneLiner] = useState("A beginner-friendly builder that ships a first slice fast.");
  const [selected, setSelected] = useState<Set<string>>(defaultSelected);

  const [tradeoffs, setTradeoffs] = useState({
    speedVsQuality: 0,
    simplicityVsPower: 0,
    safetyVsFreedom: 0,
  });

  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "working" }
    | { kind: "done" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate() {
    setStatus({ kind: "working" });

    const payload = {
      productName: productName.trim(),
      oneLiner: oneLiner.trim(),
      palettes: Array.from(selected),
      tradeoffs,
    };

    try {
      const res = await fetch("/api/spec-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  return (
    <div className="card">
      <h2>Offline Builder (no wallet, no keys)</h2>
      <p className="small">
        Fill this in, then download an SDDE Spec Pack ZIP. This works completely offline (no external API calls).
      </p>

      <div className="card">
        <div className="row">
          <label className="small" htmlFor="productName">Product name</label>
          <input
            id="productName"
            className="btn"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="My SaaS"
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

      <div className="card">
        <h3>Pick Interaction Palettes</h3>
        <p className="small">Choose what your product needs first. You can change this later.</p>

        <div style={{ display: "grid", gap: 10 }}>
          {ALL_PALETTES.map((p) => (
            <label key={p.id} className="card" style={{ cursor: "pointer" }}>
              <div className="row">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{p.label}</div>
                  <div className="small">{p.desc}</div>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Tradeoffs (quick defaults)</h3>
        <p className="small">Set initial posture. -2 = left, +2 = right. (You can refine later.)</p>

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

      <div className="row">
        <button className="btn" onClick={generate} disabled={status.kind === "working"}>
          {status.kind === "working" ? "Generating…" : "Download Spec Pack (.zip)"}
        </button>

        {status.kind === "done" && <span className="small">Downloaded ✅</span>}
        {status.kind === "error" && <span className="small">Error: {status.message}</span>}
      </div>

      <p className="small" style={{ marginTop: 10 }}>
        Next iteration will import this pack into a project workspace and generate the first “Hello SaaS” slice.
      </p>
    </div>
  );
}
