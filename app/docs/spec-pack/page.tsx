import { Panel } from "../../../components/Panel";

export default function SpecPackPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>What is a Spec Pack?</h1>
        <p>A Spec Pack is a deterministic ZIP of auditable design and build artefacts.</p>
      </div>

      <div className="grid">
        <Panel title="Why it exists">
          <ul>
            <li><strong>Reviewable</strong>: every change is a file diff, not a chat transcript.</li>
            <li><strong>Deterministic</strong>: the same inputs produce the same pack.</li>
            <li><strong>Portable</strong>: packs can be stored, versioned, and shared as plain ZIPs.</li>
          </ul>
        </Panel>

        <Panel title="What’s inside">
          <p className="small">Common paths (not exhaustive):</p>
          <ul>
            <li><code>spec_pack_manifest.json</code> — project id, file list, versions.</li>
            <li><code>intent/</code> — build intent, constraints, brief.</li>
            <li><code>kernel_min/</code> — actors, scenes, flows (canonical) <span className="muted">(+ legacy <code>ux/</code> aliases)</span>.</li>
            <li><code>design/</code> — tokens, IA tree, low-fi layouts.</li>
            <li><code>content/</code> — copy blocks.</li>
            <li><code>blueprint/hello.spel</code> — optional advanced source for compilation.</li>
          </ul>
        </Panel>

        <Panel title="How it’s used">
          <ol>
            <li>Builder exports a Base pack.</li>
            <li>Workbench imports Base + Proposal packs and computes a patch.</li>
            <li>You apply or adopt a patch, then lock truth with provenance and hashes.</li>
          </ol>
          <p className="small">See: <code>docs/WORKBENCH.md</code> and <code>docs/GATES.md</code>.</p>
        </Panel>

        <Panel title="Determinism and provenance">
          <p className="small">
            Packs include stable manifests, stable JSON formatting, and deterministic ZIP ordering.
            Workbench can generate a determinism report (pack hash + per-file hashes + patch ops hash).
          </p>
        </Panel>

        <Panel title="Next">
          <div className="row">
            <a className="btn" href="/docs/quickstart">Quickstart</a>
            <a className="btn" href="/workbench">Open Workbench</a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
