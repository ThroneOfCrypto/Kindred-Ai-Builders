import { Panel } from "../../../components/Panel";

export default function BlueprintsDocsPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>UI Blueprints</h1>
        <p>
          A <strong>UI Blueprint</strong> is a deterministic, machine-readable description of your product’s screens, routes, and layouts.
          It is compiled from the same general legos (Surface → Palettes → Libraries → Patterns → Kits) plus your IA tree and low-fi layouts.
        </p>
      </div>

      <div className="grid">
        <Panel title="Where it fits">
          <ol>
            <li>
              <strong>Surface</strong> — the primary product form (e.g. website, app, marketplace, community)
            </li>
            <li>
              <strong>Palettes</strong> — capability bands (Identity & Access, Content, Commerce, etc.)
            </li>
            <li>
              <strong>Libraries</strong> — your building blocks (chips-only selection)
            </li>
            <li>
              <strong>Patterns</strong> — reusable features (catalog-driven)
            </li>
            <li>
              <strong>Kits</strong> — provider bindings and product-specific adapters (optional)
            </li>
            <li>
              <strong>UI Blueprint</strong> — compiled layout + routes + tokens (kernel-neutral)
            </li>
            <li>
              <strong>Repo Pack</strong> — a deployable repository that embeds the packs for auditability
            </li>
          </ol>
        </Panel>

        <Panel title="Deterministic output">
          <p className="small">
            Blueprint Pack is compiled deterministically. The same adopted state produces the same blueprint JSON and the same hash.
            Wall-clock timestamps are not included in the pack (only optional metadata in your local project state).
          </p>
          <ul>
            <li>
              Blueprint Pack file path inside generated repos:
              <code> .kindred/blueprint_pack/blueprint_pack.v1.json</code>
            </li>
            <li>
              Spec Pack is embedded for auditability at:
              <code> .kindred/spec_pack/</code>
            </li>
          </ul>
        </Panel>

        <Panel title="Why it is not an IDE">
          <p className="small">
            Kindred is a Director-guided builder that outputs artefacts. It is not an IDE.
            However, <em>SDDE OS can target an IDE</em> as a product by selecting patterns and kits that produce an IDE-style product.
          </p>
        </Panel>

        <Panel title="Blueprint Viewer">
          <p className="small">
            Director Mode includes a read-only Blueprint Viewer that lets you inspect the latest compiled Blueprint Pack
            offline (pages, routes, and greyscale layout sections). To propose changes, use the Editor to generate a deterministic Spec proposal,
            then adopt + lock via Proposals.
          </p>
          <div className="row">
            <a className="btn" href="/director/blueprints">Open Blueprint Viewer</a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
