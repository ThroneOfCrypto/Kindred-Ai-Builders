import { Panel } from "../../../components/Panel";

export default function ReleaseDocsPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Release checklist</h1>
        <p>Local-only checks that confirm the core trust properties before you share a repo or pack.</p>
      </div>

      <div className="grid">
        <Panel title="Open the checklist">
          <p className="small">The checklist runs against the current project in this browser.</p>
          <div className="row">
            <a className="btn primary" href="/release-checklist">Open Release Checklist</a>
          </div>
          <p className="small" style={{ marginBottom: 0 }}>
            Repo doc: <code>docs/RELEASE_CHECKLIST.md</code>
          </p>
        </Panel>

        <Panel title="What it verifies">
          <ul>
            <li>Base/Proposal packs are present and readable</li>
            <li>Validator status (errors vs warnings)</li>
            <li>Gates summary (pass/warn/fail)</li>
            <li>Lock provenance present (hashes + versions)</li>
            <li>Locked drift detection</li>
            <li>Latest verification report (optional, local-first)</li>
          </ul>
        </Panel>

        <Panel title="Next">
          <div className="row">
            <a className="btn" href="/workbench">Workbench</a>
            <a className="btn" href="/docs/security">Security</a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
