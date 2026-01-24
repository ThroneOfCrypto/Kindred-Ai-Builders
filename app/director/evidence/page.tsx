"use client";

import React from "react";

import { Panel } from "../../../components/Panel";
import { PublishReadyStatusPanel } from "../../../components/PublishReadyStatusPanel";
import { EvidencePanel } from "../../../components/EvidencePanel";
import { FailureCapture } from "../../../components/FailureCapture";
import { ProofStatusPanel } from "../../../components/ProofStatusPanel";

export default function DirectorEvidencePage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Evidence</h1>
        <p>
          This is the truth surface. If a claim matters, it needs evidence: logs, reports, and deterministic bundles.
          Vercel is Deploy Lane only. Proof lives in CI and local executors.
        </p>
      </div>

      <div className="grid">
        <ProofStatusPanel />
        <PublishReadyStatusPanel />
        <EvidencePanel />

        <Panel title="Local proof runners">
          <div className="small">Run these in a real executor (Node 24 + npm registry access):</div>
          <pre className="code" style={{ marginTop: 10 }}>
            <code>npm run doctor

# HARD gate (fails fast, still writes evidence)
npm run proof:gate

# Evidence-only loop (runs everything, even when failing)
npm run proof:loop</code>
          </pre>
          <div className="small" style={{ marginTop: 10 }}>
            Logs land in <code>dist/evidence/</code>. Publish-ready outputs land in <code>dist/</code> and are copied to <code>public/dist/</code>
            when <code>tools/publish_ready.mjs</code> runs.
          </div>
        </Panel>

        <Panel title="Failure capture">
          <div className="small">If something breaks, capture it deterministically. Exportable bundles beat vague bug reports.</div>
          <FailureCapture />
        </Panel>
      </div>
    </div>
  );
}
