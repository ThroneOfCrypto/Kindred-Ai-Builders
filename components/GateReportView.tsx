"use client";

import React, { useMemo, useState } from "react";
import type { GateIssue, GateReport } from "../lib/gates";
import type { BuilderStepId } from "../lib/jump_to_fix";
import { stepForGateIssue, stepLabel } from "../lib/jump_to_fix";
import { anchorForGateIssue } from "../lib/fix_actions";

type JumpAction = {
  label?: string;
  onJump: (args: { file?: string; step?: BuilderStepId | null; anchor?: string | null; issue: GateIssue }) => void;
};

export function GateReportView({
  report,
  jump,
  emptyHint,
}: {
  report: GateReport | null;
  jump?: JumpAction;
  emptyHint?: string;
}) {
  const [showWarnings, setShowWarnings] = useState<boolean>(true);

  const { errors, warns } = useMemo(() => {
    const issues = report?.issues || [];
    const errors = issues.filter((i) => i.severity === "error");
    const warns = issues.filter((i) => i.severity === "warn");
    return { errors, warns };
  }, [report]);

  if (!report) {
    return <p className="small">{emptyHint || "Run gates to see issues."}</p>;
  }

  const issuesToShow = showWarnings ? report.issues : errors;

  return (
    <>
      <div className="badge">
        <strong>Status</strong> <span>{report.status.toUpperCase()}</span>
      </div>
      <div className="badge" style={{ marginLeft: 8 }}>
        <strong>Errors</strong> <span>{errors.length}</span>
      </div>
      <div className="badge" style={{ marginLeft: 8 }}>
        <strong>Warnings</strong> <span>{warns.length}</span>
      </div>

      <div className="hr" />

      <div className="row">
        <button className="btn" onClick={() => setShowWarnings((v) => !v)}>
          {showWarnings ? "Hide warnings" : "Show warnings"}
        </button>
      </div>

      <div className="hr" />

      {issuesToShow.length === 0 && <p className="small">No issues.</p>}

      {issuesToShow.length > 0 && (
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          {issuesToShow.map((issue, idx) => {
            const step = stepForGateIssue(issue);
            const anchor = anchorForGateIssue(issue);
            const k = issue.severity === "error" ? "!" : "W";
            const border = issue.severity === "error" ? "rgba(255, 107, 107, 0.45)" : "rgba(110, 168, 254, 0.45)";
            return (
              <div
                key={`${issue.code}_${idx}`}
                className="step"
                style={{ marginBottom: 10, borderColor: border }}
              >
                <div className="k" style={{ borderColor: border, color: issue.severity === "error" ? "var(--danger)" : "var(--primary)" }}>
                  {k}
                </div>
                <div className="t" style={{ width: "100%" }}>
                  <strong>
                    {issue.code}: {issue.message}
                  </strong>
                  <span>
                    {issue.file ? `file=${issue.file}` : ""}
                    {issue.pointer ? ` • ${issue.pointer}` : ""}
                    {step ? ` • fix in: ${stepLabel(step)}` : ""}
                  </span>
                  {jump && (issue.file || step) && (
                    <div className="row" style={{ marginTop: 8 }}>
                      <button
                        className="btn"
                        onClick={() =>
                          jump.onJump({
                            file: issue.file,
                            step,
                            anchor,
                            issue,
                          })
                        }
                      >
                        {jump.label || "Jump"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
