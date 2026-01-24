import React from "react";
import { Callout } from "@/components/Callout";
import { Panel } from "@/components/Panel";
import { SecondaryButton } from "@/components/Buttons";

export default function SupportPage() {
  return (
    <div style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Support</h1>
      <p style={{ opacity: 0.85 }}>
        Kindred AI Builders is offline-first. When something fails, the fastest path to resolution is to capture evidence and
        share the proof bundle (or a failure record) with your maintainer team.
      </p>

      <Callout
        title="Jump to fix"
        tone="info"
        details={[
          "Use Ship to run gates and generate evidence bundles.",
          "Use Evidence to download reports and artefacts.",
          "Use Backups to export/restore projects (deterministic proof supported).",
        ]}
      />

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <SecondaryButton href="/director/ship">Go to Ship</SecondaryButton>
        <SecondaryButton href="/director/evidence">Open Evidence</SecondaryButton>
        <SecondaryButton href="/backup">Backups</SecondaryButton>
        <SecondaryButton href="/release-checklist">Release checklist</SecondaryButton>
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
        <Panel title="How to file a useful bug report">
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Open <code>/director/ship</code> and click <b>Generate ALL demo evidence</b> (if available).</li>
            <li>Run the repo-side gate: <code>node tools/publish_ready.mjs --skip-build --skip-lint</code>.</li>
            <li>Attach <code>dist/publish_ready_bundle_ci.zip</code> (or at minimum <code>dist/publish_ready_report.md</code>).</li>
            <li>If the issue is project-specific, export a backup ZIP from <code>/backup</code>.</li>
          </ol>
        </Panel>

        <Panel title="Security / responsible disclosure">
          <p style={{ marginTop: 0, opacity: 0.85 }}>
            If you believe you found a security issue, do not post it publicly. Capture evidence and share it privately.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Include steps to reproduce.</li>
            <li>Include affected version (see footer or Ship page).</li>
            <li>Include a proof bundle if possible.</li>
          </ul>
        </Panel>

        <Panel title="Operational runbook (owner handbook)">
          <p style={{ marginTop: 0, opacity: 0.85 }}>
            This app is designed to be deployed on Vercel (or any Node/Next host). The publish-ready tooling produces a
            deterministic proof bundle you can archive per release.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>
              Before deploying: run <code>npm run publish_ready</code> (or the skip-build/lint variant) and archive{" "}
              <code>dist/publish_ready_bundle_ci.zip</code>.
            </li>
            <li>
              After deploying: verify <code>/dist/publish_ready_summary.json</code> and <code>/dist/publish_ready_checklist.json</code>{" "}
              are reachable on the deployed site.
            </li>
            <li>
              For public release claims: generate <b>Release signoff</b> from <code>/director/ship</code> and re-run{" "}
              <code>publish_ready</code> to confirm checklist PASS.
            </li>
          </ul>
        </Panel>

        <Panel title="Policies and legal">
          <p style={{ marginTop: 0, opacity: 0.85 }}>
            These are templates intended to be adapted for your organization. Review before public launch.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <SecondaryButton href="/privacy">Privacy Policy</SecondaryButton>
            <SecondaryButton href="/terms">Terms</SecondaryButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}
