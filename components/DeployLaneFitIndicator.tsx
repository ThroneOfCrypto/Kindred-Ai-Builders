"use client";

import React, { useMemo } from "react";
import { Panel } from "./Panel";
import type { ProjectState } from "../lib/types";
import { computeDeployLaneFit, deployLaneFitToPill } from "../lib/deploy_lane_fit";

export function DeployLaneFitIndicator(props: { state: ProjectState | null }) {
  const report = useMemo(() => computeDeployLaneFit(props.state), [props.state]);
  const pill = deployLaneFitToPill(report.tri);

  return (
    <Panel title="Deploy Lane Fit">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div className="small">A conservative signal for whether your current plan belongs in Vercel Deploy Lane.</div>
        </div>
        <span className={["pill", pill.className].join(" ")}>{pill.label.toUpperCase()}</span>
      </div>

      <div className="hr" />
      <div className="small"><strong>Reasons</strong></div>
      <ul className="small" style={{ marginTop: 8 }}>
        {report.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>

      {report.recommendations.length ? (
        <>
          <div className="hr" />
          <div className="small"><strong>Recommendations</strong></div>
          <ul className="small" style={{ marginTop: 8 }}>
            {report.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}
