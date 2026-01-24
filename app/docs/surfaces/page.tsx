import { Panel } from "../../../components/Panel";

export default function DocsSurfacesPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Work surfaces</h1>
        <p>
          This repo supports two surfaces that share one spine: a beginner-first Website surface (Vercel deploy lane) and a
          Power/IDE surface (copy/paste + patch + export-any-stack).
        </p>
      </div>

      <div className="grid2">
        <Panel title="Website surface (Director)">
          <ul>
            <li>Extremely simple choices: Launch Path → Palettes → Ship.</li>
            <li>Optimized for Vercel limits and beginner success.</li>
            <li>Post-deploy iteration loop uses Preview Deployments + comments + evidence packs.</li>
          </ul>
        </Panel>

        <Panel title="IDE surface (Power)">
          <ul>
            <li>Copy/paste + patch workflow for confident users.</li>
            <li>Export Mode targets any tech stack without losing the SPEL spine.</li>
            <li>Designed for deterministic tinkering, not “freehand chaos.”</li>
          </ul>
          <div className="row">
            <a className="btn" href="/advanced/paste-pack">
              Paste Pack (advanced)
            </a>
            <a className="btn" href="/docs/paste-pack">
              Paste Pack docs
            </a>
          </div>
        </Panel>

        <Panel title="Canonical docs">
          <div className="row">
            <a className="btn" href="/docs/deploy">
              Deploy & debug
            </a>
            <a className="btn" href="/docs/verify">
              Verify
            </a>
            <a className="btn" href="/docs/director">
              Director guide
            </a>
          </div>
          <p className="small">
            See <code>docs/SURFACES.md</code> for the repo-level contract.
          </p>
        </Panel>

        <Panel title="Design control (deterministic)">
          <p>
            Beginners can shape UI aesthetics using tokens and vibe kits without needing design skills. Confident users can
            edit tokens directly.
          </p>
          <div className="row">
            <a className="btn" href="/docs/design-tokens">
              Design tokens
            </a>
            <a className="btn" href="/advanced/design">
              Design (advanced)
            </a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
