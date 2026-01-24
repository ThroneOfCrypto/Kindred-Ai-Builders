import { Panel } from "../../../components/Panel";

export default function QuickstartPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Quickstart</h1>
        <p>In about 10 minutes: deploy, build, export, import, patch, adopt, lock.</p>
      </div>

      <div className="grid">
        <Panel title="1) Deploy (offline mode)">
          <ol>
            <li>Push this repo to GitHub.</li>
            <li>In Vercel: New Project → import the repo.</li>
            <li>Deploy. No environment variables are required for offline mode.</li>
          </ol>
          <p className="small">See repo docs: <code>docs/VERCEL_DEPLOY.md</code>.</p>
        </Panel>

        <Panel title="2) Build a Base pack">
          <ol>
            <li>Open <a href="/builder/new">Builder</a>.</li>
            <li>Choose a Launch Path, palettes, fill brief, check Review.</li>
            <li>Click <strong>Export Spec Pack ZIP</strong>.</li>
          </ol>
          <p className="small">Exported packs are cached as the “last used Base” per project in this browser.</p>
        </Panel>

        <Panel title="3) Compare and patch">
          <ol>
            <li>Open <a href="/workbench">Workbench</a>.</li>
            <li>Import your Base pack.</li>
            <li>Import a Proposal pack (a second export, an AI proposal, or an SPEL compile).</li>
            <li>Review diff → Download <code>.patch</code> or Apply patch.</li>
          </ol>
          <p className="small">Workbench runs deterministic validation + gates locally before you adopt anything.</p>
        </Panel>

        <Panel title="4) Adopt + lock">
          <ol>
            <li>In Workbench, click <strong>Adopt + Lock</strong>.</li>
            <li>The merged pack becomes the new Base and is marked as truth in local governance.</li>
          </ol>
          <p className="small">Locking captures pack hashes and provenance to detect drift later.</p>
        </Panel>

        <Panel title="Next">
          <div className="row">
            <a className="btn" href="/docs/spec-pack">What is a Spec Pack?</a>
            <a className="btn" href="/docs/security">Security & data storage</a>
            <a className="btn" href="/release-checklist">Release checklist</a>
            <a className="btn" href="/ai">AI status & config</a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
