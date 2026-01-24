import { Panel } from "../../components/Panel";

export default function OperatorHomePage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Operator Mode</h1>
        <p>
          Deep controls: diffs, packs, governance, diagnostics, and recovery. Switch back to Director Mode anytime from
          the top nav.
        </p>
      </div>

      <div className="grid">
        <Panel title="Core surfaces">
          <div className="row">
            <a className="btn primary" href="/workbench">
              Spec Workbench
            </a>
            <a className="btn" href="/builder/new">
              Builder
            </a>
            <a className="btn" href="/release-checklist">
              Release checklist
            </a>
            <a className="btn" href="/verify">
              Verify
            </a>
            <a className="btn" href="/backup">
              Backup
            </a>
          </div>
        </Panel>

        <Panel title="Docs">
          <p className="small">Operator docs explain packs, governance, and recovery paths.</p>
          <div className="row">
            <a className="btn" href="/docs">
              Open Docs
            </a>
            <a className="btn" href="/docs/quickstart">
              Quickstart
            </a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
