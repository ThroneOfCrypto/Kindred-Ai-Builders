import { Panel } from "../../../components/Panel";

export default function DocsDesignTokensPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Design tokens</h1>
        <p>
          Deterministic aesthetics control for beginners: tokens + vibe kits + safe sliders. This avoids “freehand design”
          while still enabling meaningful UI control.
        </p>
      </div>

      <div className="grid2">
        <Panel title="Where tokens live">
          <ul>
            <li>
              <code>blueprint/design_tokens.json</code>
            </li>
            <li>
              <code>blueprint/vibe_kits/</code>
            </li>
          </ul>
        </Panel>

        <Panel title="How beginners use it">
          <ol>
            <li>Pick a Vibe Kit (preset).</li>
            <li>Adjust a few safe sliders (density / contrast / motion).</li>
            <li>Ship, get feedback, iterate.</li>
          </ol>
          <div className="row">
            <a className="btn" href="/advanced/design">
              View tokens & kits (advanced)
            </a>
          </div>
        </Panel>

        <Panel title="Repo contract">
          <p className="small">
            Canonical text lives in <code>docs/DESIGN_TOKENS.md</code>.
          </p>
        </Panel>
      </div>
    </div>
  );
}
