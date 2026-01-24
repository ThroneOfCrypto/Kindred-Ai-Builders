import { Panel } from "../../../components/Panel";

export default function DocsPatternsPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Patterns (catalog-driven)</h1>
        <p>
          Patterns are reusable features that compose Libraries into product behaviour. A Director selects from a finite
          catalog (no free-text requirement entry) and Kindred writes a real SPEL module into the Spec Pack.
        </p>
      </div>

      <div className="grid">
        <Panel title="Key stance">
          <ul>
            <li>
              Kindred is <strong>not</strong> an IDE. It is a director-first system for composing products from general legos.
            </li>
            <li>
              SDDE OS can still <strong>target</strong> an IDE-as-product by selecting the right Surface, Libraries, Patterns, and Kits.
            </li>
            <li>
              Patterns describe reusable behaviour; provider specifics belong in <strong>Kits</strong> (kernel-neutral core).
            </li>
          </ul>
        </Panel>

        <Panel title="Where the truth lives">
          <p className="small">When you adopt a Patterns proposal, Kindred writes this file into the Spec Pack:</p>
          <div className="row">
            <code>spel/patterns.spel</code>
          </div>
          <p className="small">
            The file is deterministic (no timestamps) and becomes part of the audited artefacts (hashable packs, patchable diffs).
          </p>
        </Panel>

        <Panel title="Compilation path (no special cases)">
          <ol>
            <li>
              <strong>Surface</strong> — what you ship (web app, mobile app, automation, API service, etc.)
            </li>
            <li>
              <strong>Palettes</strong> — interaction capability bundles (Identity & Access, Content & Media, etc.)
            </li>
            <li>
              <strong>Libraries</strong> — capability selection (what we need)
            </li>
            <li>
              <strong>Patterns</strong> — reusable features (how it behaves)
            </li>
            <li>
              <strong>UI Blueprints</strong> — deterministic UI structure (pages, sections, blocks)
            </li>
            <li>
              <strong>Kits</strong> — provider adapters and deploy templates
            </li>
            <li>
              <strong>Repo Pack</strong> — a buildable repo template + config + verification harness
            </li>
          </ol>
        </Panel>

        <Panel title="How to use it">
          <ol>
            <li>
              Open <a href="/director/patterns">Director → Patterns</a>.
            </li>
            <li>
              Select chips (typing only filters).
            </li>
            <li>
              Click <strong>Create proposal</strong>.
            </li>
            <li>
              Review + accept in <a href="/director/proposals">Director → Proposals</a>.
            </li>
            <li>
              Confirm hashes/provenance in <a href="/director/preview">Director → Preview</a>.
            </li>
          </ol>
        </Panel>
      </div>
    </div>
  );
}
