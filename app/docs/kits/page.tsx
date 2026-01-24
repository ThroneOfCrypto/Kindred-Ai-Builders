import { Panel } from "../../../components/Panel";

export default function KitsDocPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Kits</h1>
        <p>
          Kits package repo templates and verify adapters so the Kindred core stays kernel-neutral and does not special-case SDDE OS.
        </p>
      </div>

      <div className="grid">
        <Panel title="What a Kit is">
          <ul>
            <li>
              A <strong>Kit</strong> is a shipped bundle that contributes <strong>repo seed templates</strong> and/or <strong>verify plans</strong>.
            </li>
            <li>Core code loads Kits through a generic registry; it must not branch on SDDE-specific identifiers.</li>
            <li>Kits can be added/removed without changing Repo Pack, Repo Workbench, or the Proposal loop.</li>
          </ul>
        </Panel>

        <Panel title="Selecting kits in Director Mode">
          <p>
            Directors enable kits via <code>/director/kits</code>. Selection is chips-only: typing only filters the catalog.
            Changes flow through <strong>proposal → adopt → lock</strong> just like everything else.
          </p>
          <ul>
            <li>
              Output: <code>spel/kits.spel</code> (deterministic, diffable)
            </li>
            <li>
              Audit: Preview shows kit count + hashes/provenance after you adopt.
            </li>
          </ul>
          <p className="small" style={{ marginBottom: 0 }}>
            Why: Kits are the only allowed place for provider/product specifics (wallet auth adapters, hosting targets, payments, storage, etc.).
          </p>
        </Panel>

        <Panel title="How kits compile">
          <p>
            The compilation path is consistent across products:
          </p>
          <ol className="small">
            <li>Surface → Palettes (what you are building)</li>
            <li>Libraries → Patterns (what capabilities and features you want)</li>
            <li><strong>Kits</strong> (how those features bind to real providers/targets)</li>
            <li>Repo Pack (seed templates + integration stubs + verify plans)</li>
          </ol>
          <p className="small" style={{ marginBottom: 0 }}>
            Kindred is not an IDE; an IDE is simply another possible product target produced through the same path.
          </p>
        </Panel>

        <Panel title="Normative schema">
          <p className="small" style={{ marginBottom: 0 }}>
            Kit manifests are described by <code>contracts/schemas/kindred.kit_manifest.v1.schema.json</code>.
          </p>
        </Panel>

        <Panel title="Current shipped kit: SDDE OS Kernel Seed">
          <p>
            The SDDE OS Kernel Seed Kit is a proof that the interface can create an SDDE-style kernel repo without any SDDE-specific branching in core.
          </p>
          <ul>
            <li>
              Kit ID: <code>sdde_os_kernel_seed_v1</code>
            </li>
            <li>
              Repo seed template: <code>sdde_os_kernel_minimal_v1</code>
            </li>
            <li>
              Verify plan: <code>sdde_os_kernel_seed_verify_v1</code>
            </li>
          </ul>
          <p className="small" style={{ marginBottom: 0 }}>
            Repo-side operator doc: <code>docs/KITS.md</code>
          </p>
        </Panel>
      </div>
    </div>
  );
}
