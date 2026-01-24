import { Panel } from "../../../components/Panel";

export default function GoldenPathDocsPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Golden Path</h1>
        <p>
          The Golden Path is the beginner-friendly route from spark → deterministic artefacts → a locked Repo Pack, with one next action at each step.
        </p>
      </div>

      <div className="grid">
        <Panel title="What Golden Path does">
          <ul className="small">
            <li>Creates a new project from a generic Launch Path (web, product, community, marketplace, automation, API, governance).</li>
            <li>Seeds a small set of Libraries + Patterns + Kits as a starting point.</li>
            <li>Writes these into the Spec Pack as a proposal so you can adopt explicitly.</li>
            <li>Sends you to <strong>Ship</strong>, where the completion checklist keeps the order correct.</li>
          </ul>
          <div className="hr" />
          <p className="small">
            Important: Kindred is not an IDE. It produces deterministic specs and repo packs that can be used to build many products, including an IDE as a target.
          </p>
        </Panel>

        <Panel title="The guided order">
          <ol className="small">
            <li>Golden Path → create project + seed proposal</li>
            <li>Director → Proposals → accept the seed proposal (the Golden Path highlights the focused one, and “Accept & continue” takes you to Ship)</li>
            <li>Ship → follow the checklist (lock spec → compile blueprint → compile + lock repo pack → verify → backup → release)</li>
          </ol>
          <div className="hr" />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <a className="btn primary" href="/director/golden-path">Open Golden Path</a>
            <a className="btn" href="/director/proposals">Open Proposals</a>
            <a className="btn" href="/director/ship">Open Ship</a>
          </div>
        </Panel>

        <Panel title="How this stays deterministic">
          <ul className="small">
            <li>Every deliverable is a Pack with a SHA-256 hash.</li>
            <li>Proposals are patches against a base pack (diffs are auditable).</li>
            <li>AI (when enabled) is proposal-only and requires explicit adoption.</li>
            <li>Provider-specific decisions live in Kits; the kernel remains neutral.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
