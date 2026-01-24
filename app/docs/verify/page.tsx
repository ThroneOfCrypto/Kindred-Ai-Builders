import { Panel } from "../../../components/Panel";

export default function VerifyDocsPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Verification (local-first)</h1>
        <p>
          Verification is captured as a plan + report. The app never runs repo code on a server.
        </p>
      </div>

      <div className="grid">
        <Panel title="Open Verify">
          <p className="small">Select a plan, copy the commands, run locally, then upload a report.</p>
          <div className="row">
            <a className="btn primary" href="/verify">Open Verify</a>
          </div>
          <p className="small" style={{ marginBottom: 0 }}>
            Repo doc: <code>docs/VERIFY.md</code>
          </p>
        </Panel>

        <Panel title="Verify Plan">
          <ul>
            <li>
              A Verify Plan is a small JSON document that lists commands and expectations.
            </li>
            <li>
              Schema id: <code>kindred.verify_plan.v1</code>
            </li>
            <li>
              Schema file: <code>contracts/schemas/kindred.verify_plan.v1.schema.json</code>
            </li>
          </ul>
        </Panel>

        <Panel title="Verify Report">
          <ul>
            <li>
              A Verify Report records what happened when you ran the plan locally.
            </li>
            <li>
              Schema id: <code>kindred.verify_report.v1</code>
            </li>
            <li>
              Schema file: <code>contracts/schemas/kindred.verify_report.v1.schema.json</code>
            </li>
          </ul>
        </Panel>

        <Panel title="Release checklist">
          <p className="small">
            The Release checklist reads the latest Verify Report for the current project.
            Missing reports are treated as WARN (optional, but visible).
          </p>
          <div className="row">
            <a className="btn" href="/release-checklist">Release checklist</a>
            <a className="btn" href="/docs/release">Docs</a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
