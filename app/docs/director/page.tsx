import { Panel } from "../../../components/Panel";

export default function DirectorDocsPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Director Mode guide</h1>
        <p>
          Kindred is designed to feel like a world-class team responding to your brief. Under the hood it stays rigorous:
          deterministic artefacts, diffs, provenance, and local-first safety.
        </p>
      </div>

      <div className="grid">
        <Panel title="The director loop">
          <ol>
            <li>
              <strong>Set direction</strong>: intent, palettes, constraints, and the brief.
            </li>
            <li>
              <strong>Review proposals</strong>: compare options, accept what you love, reject what you don’t.
            </li>
            <li>
              <strong>Ship & proof</strong>: verify locally, capture evidence, export deterministic deliverables.
            </li>
          </ol>
          <div className="row">
            <a className="btn primary" href="/director">
              Open Director Mode
            </a>
            <a className="btn" href="/director/editor">
              Open Editor
            </a>
            <a className="btn" href="/director/kits">
              Select Integrations
            </a>
            <a className="btn" href="/director/brief">
              Open Director Brief
            </a>
            <a className="btn" href="/director/start">
              Quickstart
            </a>
            <a className="btn" href="/director/golden-path">
              Golden Path
            </a>
            <a className="btn" href="/builder/new?mode=director">
              Start Guided Build
            </a>
            <a className="btn" href="/director/proposals">
              Review proposals
            </a>
            <a className="btn" href="/director/ship">
              Ship (compile Repo Pack)
            </a>
          </div>
          <div className="hr" />
          <p className="small">
            Use <strong>Project status</strong> in Director Mode to see what's complete, what's pending, and the
            recommended next action (build → proposals → verify → backup → release checklist).
          </p>
        </Panel>

        <Panel title="What you can build (any domain)">
          <ul className="small">
            <li>Websites & content surfaces</li>
            <li>Communities and social systems</li>
            <li>Marketplaces and commerce flows (payments can be a later Kit)</li>
            <li>Automation and ops tooling</li>
            <li>Governed systems with rules, proposals, and incentives</li>
            <li>Repo evolution workflows (import → propose → patch → lock → export)</li>
          </ul>
          <div className="hr" />
          <p className="small">
            Repo Projects are the deterministic path from Director selections → Repo Pack → lock → export. This is how the interface can build systems like SDDE OS without special-casing.
          </p>
          <div className="row">
            <a className="btn" href="/repo">
              Open Repos hub
            </a>
            <a className="btn" href="/docs/repo-projects">
              Repo Projects concepts
            </a>
          </div>
        </Panel>

        <Panel title="Editor (greyscale-first)">
          <p className="small">
            The Editor is a guided, commercially familiar workflow: a tree of sections/blocks, a live preview, and a
            properties panel. It stays deterministic and offline-first.
          </p>
          <ul className="small">
            <li>Use it for IA + low-fi layout (structure before styling).</li>
            <li>Create proposals from edits; adopt explicitly in Director → Proposals.</li>
            <li>Provider specifics (payments, login, AI, etc.) belong in Kits, not the kernel.</li>
          </ul>
        </Panel>

        <Panel title="When to switch to Operator Mode">
          <ul className="small">
            <li>You want to inspect diffs, hashes, or raw manifests.</li>
            <li>You need to recover from an import error or diagnose a size cap issue.</li>
            <li>You are curating a patch operation precisely.</li>
          </ul>
          <div className="hr" />
          <p className="small">
            Use the mode switch in the top nav. Operator Mode keeps everything explicit and auditable.
          </p>
        </Panel>
      </div>
    </div>
  );
}
