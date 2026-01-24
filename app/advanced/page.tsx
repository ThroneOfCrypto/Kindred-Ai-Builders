"use client";

import React, { useEffect, useState } from "react";

import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { PrimaryButton, SecondaryButton } from "../../components/Buttons";

import { readAdvancedMode, writeAdvancedMode } from "../../lib/advanced_mode";

export default function AdvancedModePage() {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    try {
      setEnabled(readAdvancedMode());
    } catch {
      setEnabled(false);
    }
  }, []);

  function set(next: boolean) {
    writeAdvancedMode(next);
    setEnabled(next);
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Advanced mode</h1>
        <p>
          Optional deep controls for tinkerers. The default experience keeps Council DSL (SPEL) in the background.
        </p>
      </div>

      <div className="grid">
        <Panel title="Status">
          <Callout kind={enabled ? "success" : "info"}>
            Advanced mode is <strong>{enabled ? "ON" : "OFF"}</strong>.
          </Callout>

          <p className="small" style={{ marginTop: 10 }}>
            When advanced mode is on, the UI may reveal:
          </p>
          <ul className="small">
            <li>SPEL previews and downloads (Council-facing artefacts)</li>
            <li>Deep audit panels (hashes, pack internals)</li>
            <li>Operator-only workbench tools</li>
          </ul>

          <p className="small">
            Turning this on does <strong>not</strong> change your project. It only reveals additional UI surfaces.
          </p>

          <div className="row" style={{ marginTop: 12 }}>
            {enabled ? (
              <SecondaryButton onClick={() => set(false)}>Turn OFF</SecondaryButton>
            ) : (
              <PrimaryButton onClick={() => set(true)}>Turn ON</PrimaryButton>
            )}
            <a className="btn" href="/docs">
              Docs
            </a>
          </div>
        </Panel>

        <Panel title="What stays true">
          <ul className="small">
            <li>Beginners never need to touch SPEL.</li>
            <li>AI remains proposal-only; nothing auto-edits your project.</li>
            <li>Exported artefacts remain portable and offline-safe.</li>
          </ul>
        </Panel>

        <Panel title="Advanced quick links">
          <p className="small">Useful when you want to inspect Council-facing artefacts.</p>
          <div className="row">
            <a className="btn" href="/docs/spel-seed">
              SPEL seed (advanced)
            </a>
            <a className="btn" href="/workbench">
              Workbench
            </a>
          
<div className="row">
  <a className="btn" href="/advanced/design">
    Design tokens & vibe kits
  </a>
  <a className="btn" href="/advanced/paste-pack">
    Paste Pack viewer
  </a>
</div>
<p className="small">These are opt-in power tools. Beginners should stay on the Golden Path.</p>
</div>
        </Panel>
      </div>
    </div>
  );
}
