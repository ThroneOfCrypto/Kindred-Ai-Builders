import { Panel } from "../../../components/Panel";

export default function DogfoodDocPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Dogfood</h1>
        <p>Self-evolution proof: Kindred can evolve any repo (including itself) via Repo Packs, patches, and locks.</p>
      </div>

      <div className="grid">
        <Panel title="What it is">
          <ul>
            <li>
              <strong>Dogfood mode</strong> generates a deterministic patch (add/edit) against the current Base Repo Pack.
            </li>
            <li>It applies the patch, locks the result, and emits a Dogfood Report with key hashes.</li>
            <li>It does not run arbitrary code. It does not require accounts. It stays offline-first.</li>
          </ul>
        </Panel>

        <Panel title="Where to run it">
          <p className="small" style={{ marginBottom: 0 }}>
            Open <code>/repo</code> and use the Dogfood panel.
          </p>
        </Panel>

        <Panel title="Normative schema">
          <p className="small" style={{ marginBottom: 0 }}>
            Dogfood reports follow <code>contracts/schemas/kindred.dogfood_report.v1.schema.json</code>.
          </p>
          <p className="small" style={{ marginBottom: 0 }}>
            Repo-side operator doc: <code>docs/DOGFOOD.md</code>.
          </p>
        </Panel>
      </div>
    </div>
  );
}
