import { Panel } from "../../../components/Panel";

export default function DocsMarketLandscapePage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Market landscape</h1>
        <p>
          Review of vibe-coding tools and what we borrow without compromising determinism, portability, and our
          Cardano-first posture.
        </p>
      </div>

      <div className="grid2">
        <Panel title="What this is">
          <ul>
            <li>Taxonomy of popular tools: agents, editors, builders, hosting, design, monetization, and web3.</li>
            <li>UX patterns we can adopt safely.</li>
            <li>Anti-patterns we refuse: lock-in, silent edits, and custody-by-default.</li>
          </ul>
        </Panel>

        <Panel title="Where canonical text lives">
          <p className="small">
            Canonical text lives in <code>docs/COMPETITIVE_REVIEW__VIBE_CODING_TOOLS.md</code>.
          </p>
        </Panel>

        <Panel title="Use it">
          <div className="row">
            <a className="btn" href="/docs">
              Back to docs
            </a>
            <a className="btn primary" href="/director/start">
              Start a project
            </a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
