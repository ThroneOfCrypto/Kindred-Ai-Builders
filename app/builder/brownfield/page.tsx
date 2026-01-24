import { Panel } from "../../../components/Panel";

export default function BrownfieldPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Brownfield upgrade</h1>
        <p>
          You already have code. SDDE starts by importing your repo as a deterministic <em>Repo Pack</em>, running a static scan, then proposing a
          minimal patch series that adds lanes, receipts, and governance without rewriting your app.
        </p>
      </div>

      <div className="grid">
        <Panel title="Start here">
          <ol className="small">
            <li>Download your existing repo as a ZIP (GitHub “Download ZIP” works).</li>
            <li>Import it into Repo Hub as your <strong>Base</strong> pack.</li>
            <li>Run <strong>Brownfield scan</strong> (static only, no execution).</li>
            <li>Use Repo Workbench to apply the proposed patch series, then lock and export.</li>
          </ol>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <a className="btn" href="/repo">Open Repo Hub</a>
            <a className="btn secondary" href="/repo-workbench">Open Workbench</a>
            <a className="btn secondary" href="/docs/director/brownfield">Read the guide</a>
          </div>
        </Panel>

        <Panel title="What SDDE will not do">
          <ul className="small">
            <li>It will not run your code in the browser.</li>
            <li>It will not “auto-fix everything” without receipts and review.</li>
            <li>It will not guess secrets. If secrets are detected, you remove them and re-import.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
