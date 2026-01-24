"use client";

import React from "react";

import {
  CAPABILITY_DOMAINS,
  CAPABILITY_LEVELS,
  type CapabilityDomainId,
  type CapabilityLevel,
  type CapabilityVectorV1,
} from "../lib/capability_vector";

function levelLabel(level: CapabilityLevel): string {
  return CAPABILITY_LEVELS.find((x) => x.id === level)?.label || String(level);
}

function levelHint(level: CapabilityLevel): string {
  return CAPABILITY_LEVELS.find((x) => x.id === level)?.hint || "";
}

export function CapabilityVectorMap(props: {
  value: CapabilityVectorV1;
  onChange: (next: CapabilityVectorV1) => void;
  compact?: boolean;
}) {
  const vec = props.value;
  const compact = !!props.compact;

  function setLevel(domain: CapabilityDomainId, level: CapabilityLevel) {
    props.onChange({
      schema: "kindred.capability_vector.v1",
      levels: {
        ...vec.levels,
        [domain]: level,
      } as any,
    });
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap" }}>
        <div>
          <div className="small" style={{ opacity: 0.9 }}>
            Capability vector
          </div>
          <div className="small" style={{ opacity: 0.75, marginTop: 4, maxWidth: 760 }}>
            Choose what matters. This is deterministic and composable. It steers what operators and proposal engines should prioritize.
          </div>
        </div>
        <div className="small" style={{ opacity: 0.75, marginTop: 6 }}>
          0=Off · 1=Basic · 2=Serious · 3=Enterprise
        </div>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        {CAPABILITY_DOMAINS.map((d) => {
          const current = vec.levels[d.id];
          return (
            <div key={d.id} className="card" style={{ padding: 14 }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <div>
                  <div style={{ fontWeight: 650 }}>{d.label}</div>
                  <div className="small" style={{ opacity: 0.75, marginTop: 4 }}>
                    {d.hint}
                  </div>
                </div>
                <div className="small" style={{ opacity: 0.85 }} title={levelHint(current)}>
                  {levelLabel(current)}
                </div>
              </div>

              <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {CAPABILITY_LEVELS.map((l) => {
                  const selected = current === l.id;
                  return (
                    <button
                      key={`${d.id}:${l.id}`}
                      type="button"
                      className={["chip", selected ? "chip--selected" : ""].join(" ")}
                      onClick={() => setLevel(d.id, l.id)}
                      title={l.hint}
                      aria-label={`${d.label}: ${l.label}`}
                    >
                      <span className="chip__label">{l.label}</span>
                      <span className="chip__meta">{l.id}</span>
                    </button>
                  );
                })}
              </div>

              <div className="small" style={{ opacity: 0.75, marginTop: 10 }}>
                {levelHint(current)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
