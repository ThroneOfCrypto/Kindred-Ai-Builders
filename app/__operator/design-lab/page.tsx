"use client";

import React, { useMemo, useState } from "react";
import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";

// Operator-only surface.
// Purpose: side-by-side comparison of proposal variants.
// This is intentionally NOT linked from Director routes.

type CreativePush = "safe" | "balanced" | "bold";

type Proposal = {
  id: string;
  name: string;
  scope: "starter" | "standard" | "ambitious";
  summary: string;
  features: string[];
  risks_handled: string[];
  complexity: "simple" | "medium" | "high";
  timeline: string;
};

function uniq(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const k = String(x || "").trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function makeVariant(creative: CreativePush): Proposal[] {
  const base = ["Homepage", "Core pages", "Simple admin", "Search"];
  const safeAdds = creative === "safe" ? [] : ["Notifications"];
  const boldAdds = creative === "bold" ? ["Referral link", "Simple automations", "Audit history"] : [];

  const starter: Proposal = {
    id: `${creative}.starter`,
    name: "Starter",
    scope: "starter",
    summary: "Focused day‑1 build with safe defaults.",
    features: uniq(base.concat(safeAdds).filter((f) => f !== "Audit history")),
    risks_handled: ["Safe defaults"],
    complexity: "simple",
    timeline: "Days → weeks",
  };

  const standard: Proposal = {
    id: `${creative}.standard`,
    name: "Standard",
    scope: "standard",
    summary: "Practical product build: the safety pieces people forget until it hurts.",
    features: uniq(base.concat(safeAdds, ["User accounts", "Receipts & history"])),
    risks_handled: uniq(["Safe defaults", "Accounts ready", "Basic reliability"]),
    complexity: "medium",
    timeline: "Weeks",
  };

  const ambitious: Proposal = {
    id: `${creative}.ambitious`,
    name: "Ambitious",
    scope: "ambitious",
    summary: "More operations, richer admin tools, and growth‑ready structure.",
    features: uniq(base.concat(safeAdds, boldAdds, ["Background jobs", "Uptime & errors"])),
    risks_handled: uniq(["Safe defaults", "Ops ready", "Good history for decisions"]),
    complexity: "high",
    timeline: "Months",
  };

  return [starter, standard, ambitious];
}

function jsonCopy(obj: unknown) {
  const s = JSON.stringify(obj, null, 2);
  void navigator.clipboard?.writeText(s);
}

export default function DesignLabPage() {
  const [selected, setSelected] = useState<CreativePush>("balanced");

  const variants = useMemo(() => {
    return {
      safe: makeVariant("safe"),
      balanced: makeVariant("balanced"),
      bold: makeVariant("bold"),
    } as const;
  }, []);

  const current = variants[selected];

  return (
    <Panel title="Operator Design Lab: Proposal Variants">
      <Callout title="Not for Directors" tone="warn">
        <p className="small" style={{ margin: 0 }}>
          This page is for Operators/LLMs to compare proposal variants. The Director journey stays human‑simple.
        </p>
      </Callout>

      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        {(["safe", "balanced", "bold"] as const).map((c) => (
          <button
            key={c}
            type="button"
            className={"btn" + (selected === c ? " primary" : "")}
            onClick={() => setSelected(c)}
          >
            {c === "safe" ? "Safe" : c === "balanced" ? "Balanced" : "Bold"}
          </button>
        ))}
        <button type="button" className="btn" onClick={() => jsonCopy(current)}>
          Copy JSON
        </button>
      </div>

      <div className="cards" style={{ marginTop: 12 }}>
        {current.map((p) => (
          <div key={p.id} className="card" style={{ cursor: "default" }}>
            <h3>{p.name}</h3>
            <p className="small">{p.summary}</p>
            <p className="small">
              Complexity: {p.complexity} • Timeline: {p.timeline}
            </p>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {p.risks_handled.map((r) => (
                <span key={r} className="chip active">
                  {r}
                </span>
              ))}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {p.features.map((f) => (
                <span key={f} className="chip">
                  {f}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
