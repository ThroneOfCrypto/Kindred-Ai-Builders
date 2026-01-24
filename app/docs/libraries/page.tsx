import { Panel } from "../../../components/Panel";

export default function DocsLibrariesPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Libraries (chips-only)</h1>
        <p>
          Libraries are the lego piece between Palettes and Patterns. A Director selects from a finite catalog (chips only)
          and Kindred writes a real SPEL module into the Spec Pack.
        </p>
      </div>

      <div className="grid">
        <Panel title="Key stance">
          <ul>
            <li>
              Kindred is <strong>not</strong> an IDE. It is a director-first system for composing products from general legos.
            </li>
            <li>
              SDDE OS can still <strong>target</strong> an IDE as a product by selecting the right Surface, Libraries, Patterns, and Kits.
            </li>
            <li>
              Provider specifics belong in <strong>Kits</strong> (kernel-neutral core). The Libraries catalog is capability-only.
            </li>
          </ul>
        </Panel>

        <Panel title="Where the truth lives">
          <p className="small">
            When you adopt a Libraries proposal, Kindred writes this file into the Spec Pack:
          </p>
          <div className="row">
            <code>spel/libraries.spel</code>
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
              <strong>Libraries</strong> — chips-only capability selection (the module that says “we need messaging, feed, search…”)
            </li>
            <li>
              <strong>Patterns</strong> — reusable designs for workflows + data shapes (e.g., feed timeline pattern, moderation pattern)
            </li>
            <li>
              <strong>Kits</strong> — provider adapters and deploy templates (e.g., a wallet bridge kit, object storage kit)
            </li>
            <li>
              <strong>Repo Pack</strong> — a buildable repo template + config + verification harness
            </li>
          </ol>
        </Panel>

        <Panel title="How to use it">
          <ol>
            <li>
              Open <a href="/director/libraries">Director → Libraries</a>.
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
