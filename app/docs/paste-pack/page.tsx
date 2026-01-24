import { Panel } from "../../../components/Panel";

export default function DocsPastePackPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Paste Pack</h1>
        <p>
          Paste Packs bridge the website surface to the IDE surface. They produce deterministic copy/paste instructions and a
          best-effort patch.
        </p>
      </div>

      <div className="grid2">
        <Panel title="What it generates">
          <ul>
            <li>
              <code>dist/paste_pack.md</code> (human instructions)
            </li>
            <li>
              <code>dist/patch.diff</code> (apply with git)
            </li>
            <li>
              <code>dist/changeset.json</code> (structured plan, placeholder)
            </li>
          </ul>
        </Panel>

        <Panel title="How to use">
          <ol>
            <li>Run proof lane: <code>npm run publish_ready</code></li>
            <li>Open <code>dist/paste_pack.md</code> and follow steps.</li>
            <li>Optional: apply <code>dist/patch.diff</code> with <code>git apply</code>.</li>
          </ol>
          <div className="row">
            <a className="btn" href="/advanced/paste-pack">
              Open Paste Pack viewer (advanced)
            </a>
          </div>
        </Panel>

        <Panel title="Repo contract">
          <p className="small">
            Canonical text lives in <code>docs/PASTE_PACK.md</code> and <code>docs/SURFACES.md</code>.
          </p>
        </Panel>
      </div>
    </div>
  );
}
