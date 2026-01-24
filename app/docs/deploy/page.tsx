import React from "react";

import { Panel } from "../../../components/Panel";

export default function DocsDeploy() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Deploy and debug</h1>
        <p>
          Kindred is a director-grade workflow for shipping. It does not lock you in: the output is a standard repo
          (Repo Pack ZIP) you can deploy anywhere. This page documents the simplest beginner path and how to capture
          failure records for reliable debugging.
        </p>
      </div>

      <div className="grid2">
        <Panel title="Beginner path (one surface)">
          <ol>
            <li>
              Go to <strong>Director → Ship</strong>.
            </li>
            <li>
              Follow the checklist in order: <strong>Lock Spec → Compile Blueprint → Compile + lock Repo Pack → Verify → Backup</strong>.
            </li>
            <li>
              When the gate is green, click <strong>Download locked Repo Pack</strong>.
            </li>
            <li>
              Optional: use <strong>Ship → Connect & Deploy Wizard</strong> to download a deterministic <strong>Deployment Pack</strong> (env.example + checklist).
            </li>
            <li>Deploy the ZIP in your preferred environment.</li>
            <li>
              If something fails, paste the build/deploy/runtime logs into <strong>Ship → Deploy & Debug</strong> to create a Failure
              Record and get a deterministic diagnosis (and optional AI suggestions).
            </li>
          </ol>
        </Panel>

        <Panel title="No lock-in">
          <p>
            Your Repo Pack includes embedded provenance (<code>.kindred/spec_pack</code> and <code>.kindred/blueprint_pack</code>).
            That means you can reproduce the same output later and keep an audit trail, even if you migrate platforms.
          </p>
          <ul>
            <li>
              <strong>Kernel-neutral:</strong> provider specifics belong in Kits and optional docs.
            </li>
            <li>
              <strong>Proposal-only AI:</strong> AI can suggest, but never silently edits.
            </li>
            <li>
              <strong>Deterministic artefacts:</strong> packs and hashes make drift visible.
            </li>
          </ul>
        </Panel>

        <Panel title="Optional: Vercel + GitHub + Codespaces">
          <p>
            Many beginners prefer a single environment. A common path is: store your repo in GitHub, develop or reproduce builds in
            Codespaces, and deploy using Vercel. These are optional rails, not requirements.
          </p>
          <ul>
            <li>
              GitHub is the canonical source of truth for your repo history (no lock-in).
            </li>
            <li>
              Codespaces gives a consistent developer environment you can share and reproduce.
            </li>
            <li>
              Vercel provides simple deploy previews and production deploys for web products.
            </li>
            <li>On Preview deployments, the Vercel Toolbar can be used for Comments, a11y checks, and performance hints (optional).</li>
            <li>For our in-app loop, use <strong>/feedback</strong> (exportable JSON), or read <a href="/docs/feedback-loop">Feedback loop (FEARR)</a>.</li>
          </ul>
        </Panel>

        <Panel title="Failure Records">
          <p>
            A Failure Record is an artefact: logs + hashes + deterministic diagnosis. Store the first failure (do not overwrite) so you
            can compare fixes over time.
          </p>
          <ul>
            <li>
              Capture: stage (build/deploy/runtime), environment (Vercel/Codespaces/local), and the full log text.
            </li>
            <li>
              Diagnose: deterministic rules run offline; optional AI can suggest additional steps.
            </li>
            <li>
              Resolve: mark the record resolved once you have a verified fix.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
