import { Panel } from "../../../components/Panel";

export default function SpelSeedDocPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>SPEL seed</h1>
        <p>A deterministic Council-facing DSL seed derived from your project state (advanced).</p>
      </div>

      <div className="grid">
        <Panel title="What it is">
          <ul className="small">
            <li>The SPEL seed is a small, human-readable starting point for downstream design and build proposals.</li>
            <li>It is generated deterministically from your project state. No AI execution is required.</li>
            <li>It exists to keep direction auditable: every expansion remains reviewable and adoptable.</li>
          </ul>
        </Panel>

        <Panel title="When you need it">
          <ul className="small">
            <li>You are auditing what the Council would see.</li>
            <li>You want to tinker with DSL outputs directly.</li>
            <li>You are building tooling that consumes SPEL.</li>
          </ul>
        </Panel>

        <Panel title="How to generate it">
          <ol className="small">
            <li>Enable <a href="/advanced">Advanced mode</a>.</li>
            <li>Open <a href="/director/brief">Director → Brief</a>.</li>
            <li>Set your canonical intake selections (and optionally adjust structure in the Builder).</li>
            <li>Click <strong>Download SPEL seed</strong> (advanced) to download <code>__seed.spel</code>.</li>
          </ol>
        </Panel>

        <Panel title="Why it preserves control">
          <ul className="small">
            <li>The seed is an <em>evidence layer</em>. It does not mutate your project.</li>
            <li>Any future “team” output is a proposal. You accept or reject explicitly.</li>
            <li>Operators can inspect diffs, patch ops, hashes, and locked snapshots at any time.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
