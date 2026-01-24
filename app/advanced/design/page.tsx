import React from "react";

import { Panel } from "../../../components/Panel";

import designTokens from "../../../blueprint/design_tokens.json";
import vibeManifest from "../../../blueprint/vibe_kits/manifest.json";

export default function AdvancedDesignPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Design (advanced)</h1>
        <p>Deterministic aesthetics controls: tokens + vibe kits. Beginners should start from presets.</p>
      </div>

      <div className="grid2">
        <Panel title="Design tokens (canonical)">
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(designTokens, null, 2)}</pre>
        </Panel>

        <Panel title="Vibe kits (manifest)">
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(vibeManifest, null, 2)}</pre>
          <p className="small">
            Kit files live in <code>blueprint/vibe_kits/*.json</code>.
          </p>
        </Panel>

        <Panel title="Notes">
          <p className="small">
            This is a view surface. Future prompt cycles can add safe sliders and preview controls without breaking the
            token contract.
          </p>
        </Panel>
      </div>
    </div>
  );
}
