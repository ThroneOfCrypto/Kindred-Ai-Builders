"use client";

import React from "react";
import type { BrownfieldDeltaReportV1 } from "../lib/brownfield_delta";

function copyToClipboard(text: string): void {
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      // ignore
    });
    return;
  }
  try {
    // Fallback: create a temporary textarea.
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-10000px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  } catch {
    // ignore
  }
}

export function BrownfieldDeltaView(props: {
  report: BrownfieldDeltaReportV1 | null;
  onOpenFile?: (path: string) => void;
}): JSX.Element {
  const r = props.report;
  if (!r) {
    return <p className="small">Import a Base current-state pack and a Proposal pack to see a delta report.</p>;
  }

  const removed = r.routes.removed;
  const added = r.routes.added;
  const mappingsRemoved = r.routes.mappings.filter((m) => m.status === "removed");

  return (
    <>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="badge">
          <strong>Current routes</strong> <span>{r.routes.current.length}</span>
        </div>
        <div className="badge">
          <strong>Desired routes</strong> <span>{r.routes.desired.length}</span>
        </div>
        <div className="badge">
          <strong>Added</strong> <span>{added.length}</span>
        </div>
        <div className="badge">
          <strong>Removed</strong> <span>{removed.length}</span>
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => props.onOpenFile?.("design/ia_tree.json")}>
          Open IA tree
        </button>
        <button className="btn" onClick={() => props.onOpenFile?.("intent/constraints.json")}>
          Open constraints
        </button>
      </div>

      <div className="hr" />

      <h3 style={{ margin: 0, fontSize: 14 }}>Route mapping</h3>
      <p className="small" style={{ marginTop: 6 }}>
        For every current route, this suggests the closest desired route (when a close match exists). Use this to plan redirects and migration steps.
      </p>

      {mappingsRemoved.length === 0 ? (
        <p className="small">No removed routes detected.</p>
      ) : (
        <div style={{ maxHeight: 260, overflow: "auto" }}>
          {mappingsRemoved.map((m) => (
            <div key={m.current_route} className="step" style={{ marginBottom: 8 }}>
              <div className="k">-</div>
              <div className="t">
                <strong>{m.current_route}</strong>
                <span>
                  {m.suggested_desired_route
                    ? `suggested → ${m.suggested_desired_route}${typeof m.score === "number" ? ` (score ${m.score})` : ""}`
                    : "no suggested route"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="hr" />

      <h3 style={{ margin: 0, fontSize: 14 }}>Env name mapping</h3>
      <p className="small" style={{ marginTop: 6 }}>
        Brownfield inventory captures env <em>names</em> only. Store required names in <code>intent/constraints.json</code> as <code>required_env_names</code>.
      </p>

      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="badge">
          <strong>Current env names</strong> <span>{r.env.current_names.length}</span>
        </div>
        <div className="badge">
          <strong>Desired required env names</strong> <span>{r.env.desired_required_env_names.length}</span>
        </div>
      </div>

      {r.env.suggestions_required_env_names.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            <button
              className="btn"
              onClick={() => copyToClipboard(r.env.suggestions_required_env_names.join("\n"))}
              title="Copies newline-separated env var names"
            >
              Copy suggested required_env_names
            </button>
            <span className="small">({r.env.suggestions_required_env_names.length} names)</span>
          </div>
          <div className="hr" />
        </div>
      )}

      {r.env.required_not_in_current.length > 0 && (
        <p className="small">
          <strong>New required env vars not seen in current:</strong> {r.env.required_not_in_current.join(", ")}
        </p>
      )}

      {r.env.current_not_tracked_in_desired.length > 0 && r.env.desired_required_env_names.length > 0 && (
        <p className="small">
          <strong>Current env vars not listed in desired constraints:</strong> {r.env.current_not_tracked_in_desired.join(", ")}
        </p>
      )}

      <div className="hr" />

      <h3 style={{ margin: 0, fontSize: 14 }}>Risk hints</h3>
      {r.risks.length === 0 ? (
        <p className="small">No risk hints.</p>
      ) : (
        <div style={{ maxHeight: 260, overflow: "auto" }}>
          {r.risks.map((x, i) => (
            <div key={`${x.code}_${i}`} className="issue" style={{ marginBottom: 8 }}>
              <div className={"dot " + (x.severity === "error" ? "err" : x.severity === "warn" ? "warn" : "info")} />
              <div>
                <div style={{ fontWeight: 700 }}>{x.code}</div>
                <div className="small">{x.message}</div>
                {Array.isArray(x.evidence) && x.evidence.length > 0 && (
                  <div className="small" style={{ marginTop: 4 }}>
                    Evidence: {x.evidence.join(", ")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {r.deps.current_dependencies.length > 0 && (
        <>
          <div className="hr" />
          <p className="small">
            <strong>Current dependencies (signals):</strong> {r.deps.current_dependencies.slice(0, 18).join(", ")}
            {r.deps.current_dependencies.length > 18 ? "…" : ""}
          </p>
        </>
      )}
    </>
  );
}
