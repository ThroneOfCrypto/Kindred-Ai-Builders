"use client";

import React, { useMemo } from "react";
import type { ProjectState } from "../lib/types";
import { Panel } from "./Panel";
import { computeCapabilityPlan } from "../lib/capability_plan";

function pillForRel(rel: string): { className: string; label: string } {
  if (rel === "core") return { className: "pill--success", label: "CORE" };
  if (rel === "avoid") return { className: "pill--error", label: "AVOID" };
  return { className: "pill--warn", label: "OPTIONAL" };
}

export function CapabilityPlanPanel(props: { state: ProjectState | null }) {
  const plan = useMemo(() => computeCapabilityPlan(props.state), [props.state]);

  return (
    <Panel title="Capability Plan">
      <div className="small">
        {plan.summary.map((s, i) => (
          <div key={i}>{s}</div>
        ))}
      </div>

      <div className="hr" />

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {plan.domains.map((d) => {
          const p = pillForRel(d.intent_relevance);
          return (
            <div key={d.id} className="card" style={{ padding: 14 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <strong>{d.title}</strong>
                <span className={"pill " + p.className}>{p.label}</span>
              </div>
              <div className="small" style={{ marginTop: 8 }}>
                {d.items.map((it) => (
                  <div key={it.id} style={{ marginTop: 10 }}>
                    <div><strong>{it.label}</strong> <span className="small">({it.complexity})</span></div>
                    <div className="small">{it.description}</div>
                    {it.notes.length ? (
                      <ul className="small" style={{ marginTop: 6, paddingLeft: 18 }}>
                        {it.notes.map((n, idx) => (
                          <li key={idx}>{n}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
