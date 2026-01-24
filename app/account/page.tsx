"use client";

import React from "react";
import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { getAuthMode, authModeLabel, authModeSummary } from "../../lib/auth";

export default function AccountPage() {
  const mode = getAuthMode();
  const enabled = mode !== "off";

  return (
    <div className="container">
      <div className="hero">
        <h1>Account</h1>
        <p>Authentication status for this deployment.</p>
      </div>

      <div className="grid">
        <Panel title="Authentication">
          <Callout kind={enabled ? "warn" : "info"} title={`Mode: ${authModeLabel(mode)}`}>
            <p className="small" style={{ marginTop: 0 }}>{authModeSummary(mode)}</p>
            {!enabled && (
              <p className="small" style={{ marginBottom: 0 }}>
                When you are ready to add login, the intended targets are Cardano wallet login and a Cardano social wallet on-ramp.
              </p>
            )}
          </Callout>

          <div className="row" style={{ marginTop: 12 }}>
            <a className="btn" href="/docs/auth">Auth docs</a>
            <a className="btn" href="/docs/security">Security & data storage</a>
          </div>
        </Panel>

        <Panel title="Notes">
          <ul>
            <li>This app is offline-first: packs and project state are stored locally in your browser.</li>
            <li>v1.0.x does not require accounts to run the full Builder → Workbench → Adopt+Lock loop.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
