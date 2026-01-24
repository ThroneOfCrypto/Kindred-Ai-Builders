import { Panel } from "../../../components/Panel";

export default function BuilderFallbackPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Builder</h1>
        <p>This route exists to avoid dead ends while the Builder UX evolves.</p>
        <div className="row">
          <a className="btn" href="/repo-builder">Create a repo pack</a>
          <a className="btn secondary" href="/repo">Import existing repo</a>
          <a className="btn secondary" href="/workbench">Workbench</a>
        </div>
      </div>

      <div className="grid">
        <Panel title="Where you probably meant to go">
          <div className="row">
            <a className="btn" href="/repo-builder">Repo Builder</a>
            <a className="btn" href="/repo">Repo hub</a>
            <a className="btn" href="/docs">Docs</a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
