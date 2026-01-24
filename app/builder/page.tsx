import { Panel } from "../../components/Panel";

export default function BuilderIndexPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Builder</h1>
        <p>
          Start a new build, or bring an existing repo (brownfield). This surface stays generic and composable.
        </p>
        <div className="row">
          <a className="btn" href="/builder/new">Start new</a>
          <a className="btn secondary" href="/builder/brownfield">Bring existing code</a>
          <a className="btn secondary" href="/workbench">Workbench</a>
        </div>
      </div>

      <div className="grid">
        <Panel title="What happens next">
          <p>
            SDDE OS is designed to scale from atomic building blocks to full systems. Beginners can start from a
            simple path and still reach depth later without changing the underlying artifacts.
          </p>
        </Panel>
      </div>
    </div>
  );
}
