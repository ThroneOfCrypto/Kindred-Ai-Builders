"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Panel } from "../../../components/Panel";
import { CapabilityPlanPanel } from "../../../components/CapabilityPlanPanel";
import { DeployLaneFitIndicator } from "../../../components/DeployLaneFitIndicator";
import { getCurrentProjectId, loadProjectStateById } from "../../../lib/state";

export default function DirectorCapabilitiesPage() {
  const [projectId, setProjectId] = useState<string>(() => {
    try {
      return getCurrentProjectId();
    } catch {
      return "";
    }
  });

  const pid = projectId || "default";

  useEffect(() => {
    const onChange = () => {
      try {
        setProjectId(getCurrentProjectId());
      } catch {
        setProjectId("");
      }
    };
    window.addEventListener("kindred_project_changed", onChange);
    return () => window.removeEventListener("kindred_project_changed", onChange);
  }, []);

  const [tick, setTick] = useState<number>(0);
  useEffect(() => {
    const bump = () => setTick((x) => x + 1);
    window.addEventListener("kindred_state_changed", bump);
    return () => window.removeEventListener("kindred_state_changed", bump);
  }, []);

  const state = useMemo(() => {
    try {
      return loadProjectStateById(pid);
    } catch {
      return null;
    }
  }, [pid, tick]);

  return (
    <div className="container">
      <div className="hero">
        <h1>Capability Plan</h1>
        <p>
          A beginner-friendly map of what your product needs across data, delivery, security, and governance. This is a tech stack plan
          that stays aligned to physical production constraints.
        </p>
      </div>

      <div className="grid">
        <DeployLaneFitIndicator state={state} />
        <CapabilityPlanPanel state={state} />

        <Panel title="Fast loop">
          <div className="small">
            Proof Lane is where reality lives. Run the strict proof loop locally (Node 24 + npm registry access):
          </div>
          <pre className="code" style={{ marginTop: 10 }}>
            <code>npm ci
npm run proof:loop</code>
          </pre>
          <div className="small" style={{ marginTop: 10 }}>
            Evidence logs are written to <code>dist/evidence/</code> and mirrored into <code>public/dist/</code> by <code>publish_ready</code> when it runs.
          </div>
        </Panel>
      </div>
    </div>
  );
}
