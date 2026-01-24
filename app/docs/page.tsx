import { Panel } from "../../components/Panel";

export default function DocsHomePage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Docs</h1>
        <p>Guides for Directors (product owners) and Operators (deep controls).</p>
      </div>

      <div className="grid">
        <Panel title="Director Mode">
          <p className="small">The world-class team experience: brief → proposals → ship.</p>
          <div className="row">
            <a className="btn primary" href="/docs/director">
              Open Director guide
            </a>
            <a className="btn" href="/docs/director-brief">
              Director Brief
            </a>
            <a className="btn" href="/docs/spel-seed">
              SPEL seed
            </a>
            <a className="btn" href="/director/golden-path">
              Golden Path
            </a>
            <a className="btn" href="/director/start">
              Quickstart (create a project)
            </a>
            <a className="btn" href="/director">
              Open Director Mode
            </a>
          </div>
        </Panel>

        <Panel title="Quickstart (Operator)">
          <p className="small">Deploy, build a pack, compare, patch, adopt, lock.</p>
          <div className="row">
            <a className="btn" href="/docs/quickstart">
              Open Quickstart
            </a>
          </div>
        </Panel>

        <Panel title="Concepts">
          <p className="small">Offline-first posture, packs, storage, and governance.</p>
          <div className="row">
            <a className="btn" href="/docs/spec-pack">
              What is a Spec Pack?
            </a>
            <a className="btn" href="/docs/repo-projects">
              Repo Projects (experimental)
            </a>
            <a className="btn" href="/docs/dogfood">
              Dogfood (self-evolution proof)
            </a>
            <a className="btn" href="/docs/market-landscape">
              Market landscape (vibe tools)
            </a>
            <a className="btn" href="/docs/offline-first">
              Offline-first stance
            </a>
            <a className="btn" href="/docs/libraries">
              Libraries (chips-only)
            </a>
            <a className="btn" href="/docs/patterns">
              Patterns (catalog-driven)
            </a>
            <a className="btn" href="/docs/blueprints">
              UI Blueprints
            </a>
            <a className="btn" href="/docs/security">
              Security & data storage
            </a>
            <a className="btn" href="/docs/deploy">
              Deploy & debug
            </a>
            <a className="btn" href="/docs/vercel-one-move">
              Vercel one-move
            </a>
            <a className="btn" href="/docs/release">
              Release checklist
            </a>
            <a className="btn" href="/docs/governance">
              Governance (normative)
            </a>
            <a className="btn" href="/docs/verify">
              Verification (local-first)
            </a>
            <a className="btn" href="/docs/local-runner-kit">
              Local Runner (planned)
            </a>
            <a className="btn" href="/docs/feedback-loop">
              Feedback loop (FEARR)
            </a>
            <a className="btn" href="/docs/backup">
              Backup & restore
            </a>
            <a className="btn" href="/docs/auth">
              Authentication (planned)
            </a>
          </div>
        </Panel>

        <Panel title="Kits">
          <p className="small">Optional extensions: repo templates and verify adapters (no core special casing).</p>
          <div className="row">
            <a className="btn" href="/docs/kits">
              Open
            </a>
          </div>
        </Panel>

        <Panel title="AI (optional)">
          <p className="small">AI is server-side and proposal-only. Offline mode is default.</p>
          <div className="row">
            <a className="btn" href="/ai">
              AI status & config
            </a>
            <a className="btn" href="/ai/setup">
              Guided AI setup
            </a>
            <a className="btn" href="/docs/ai-keys-and-costs">
              API keys & costs
            </a>
            <a className="btn" href="/usage">
              Spend awareness
            </a>
          </div>
        </Panel>

        <Panel title="More">
          <p className="small">Deep dives in the repo docs folder.</p>
          <div className="row">
            <a className="btn" href="/about">
              About
            </a>
          </div>
        </Panel>

<Panel title="Surfaces & precision controls">
  <p className="small">Website simplicity + IDE power surface. Deterministic design tokens + vibe kits.</p>
  <div className="row">
    <a className="btn" href="/docs/surfaces">
      Surfaces (Website vs IDE)
    </a>
    <a className="btn" href="/docs/paste-pack">
      Paste Pack
    </a>
    <a className="btn" href="/docs/design-tokens">
      Design tokens
    </a>
  </div>
</Panel>
      </div>
    </div>
  );
}
