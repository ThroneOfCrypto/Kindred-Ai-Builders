"use client";

import React, { useMemo, useState } from "react";
import { SPEC_PACK_SCHEMA_REGISTRY_V1, type ValidationIssue, type ValidationReport } from "../lib/validation";

export type ValidationJumpTarget = {
  file?: string;
  pointer?: string;
  issue: ValidationIssue;
};

export function ValidationReportView({
  report,
  onJump,
  title,
}: {
  report: ValidationReport | null;
  onJump?: (target: ValidationJumpTarget) => void;
  title?: string;
}) {
  const [showWarnings, setShowWarnings] = useState(true);

  const grouped = useMemo(() => {
    if (!report) return [] as Array<{ file: string; issues: ValidationIssue[] }>;
    const map = new Map<string, ValidationIssue[]>();
    for (const i of report.issues) {
      if (!showWarnings && i.severity === "warn") continue;
      const f = i.file || "(no file)";
      if (!map.has(f)) map.set(f, []);
      map.get(f)!.push(i);
    }
    const rows = Array.from(map.entries()).map(([file, issues]) => ({ file, issues }));
    rows.sort((a, b) => a.file.localeCompare(b.file));
    return rows;
  }, [report, showWarnings]);

  const schemaByPath = useMemo(() => {
    const m = new Map<string, { schema_id: string; title: string }>();
    for (const e of SPEC_PACK_SCHEMA_REGISTRY_V1) {
      m.set(e.path, { schema_id: e.schema_id, title: e.title });
    }
    return m;
  }, []);

  const counts = useMemo(() => {
    if (!report) return { errors: 0, warns: 0 };
    let errors = 0;
    let warns = 0;
    for (const i of report.issues) {
      if (i.severity === "error") errors += 1;
      else warns += 1;
    }
    return { errors, warns };
  }, [report]);

  if (!report) {
    return <div style={{ color: "var(--muted)" }}>No pack loaded.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{title || "Validation"}</div>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>
            status: <b>{report.status.toUpperCase()}</b> • {counts.errors} errors • {counts.warns} warnings
          </div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
          <input
            type="checkbox"
            checked={showWarnings}
            onChange={(e) => setShowWarnings(e.target.checked)}
          />
          show warnings
        </label>
      </div>

      {grouped.length === 0 ? (
        <div style={{ color: "var(--muted)" }}>No issues.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {grouped.map(({ file, issues }) => {
            const err = issues.filter((i) => i.severity === "error").length;
            const warn = issues.filter((i) => i.severity === "warn").length;
            const schema = schemaByPath.get(file);
            return (
              <details key={file} open>
                <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <span style={{ display: "grid", gap: 2 }}>
                    <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{file}</span>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>{schema ? schema.schema_id : "(unknown schema)"}</span>
                  </span>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>{err}E / {warn}W</span>
                </summary>

                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {issues.map((i, idx) => (
                    (() => {
                      const k = i.severity === "error" ? "!" : "W";
                      const border = i.severity === "error" ? "rgba(255, 107, 107, 0.45)" : "rgba(110, 168, 254, 0.45)";
                      return (
                        <div key={idx} className="step" style={{ marginBottom: 8, borderColor: border }}>
                          <div className="k" style={{ borderColor: border, color: i.severity === "error" ? "var(--danger)" : "var(--primary)" }}>
                            {k}
                          </div>
                          <div className="t" style={{ width: "100%" }}>
                            <strong>
                              {i.code}: {i.message}
                            </strong>
                            <span>
                              {i.file ? `file=${i.file}` : ""}
                              {i.pointer ? ` • ${i.pointer}` : ""}
                            </span>
                            {onJump && (i.file || i.pointer) ? (
                              <div className="row" style={{ marginTop: 8 }}>
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() =>
                                    onJump({
                                      file: i.file,
                                      pointer: i.pointer,
                                      issue: i,
                                    })
                                  }
                                >
                                  Open
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })()
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
