import { Panel } from "../../../components/Panel";

export default function OfflineFirstPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Offline-first stance</h1>
        <p>The product works without any network access. AI is optional and never writes directly.</p>
      </div>

      <div className="grid">
        <Panel title="Principles">
          <ul>
            <li><strong>No network required</strong> to build, validate, diff, patch, merge, adopt, or lock.</li>
            <li><strong>AI is proposal-only</strong>: it returns a Spec Pack proposal ZIP that you can diff and gate-check.</li>
            <li><strong>Truth lives in files</strong>: artefacts, patches, and locked provenance.</li>
          </ul>
        </Panel>

        <Panel title="What runs where">
          <ul>
            <li><strong>Client</strong>: Builder UI, Workbench UI, gates, diffs, snapshots (local storage).</li>
            <li><strong>Server</strong>: optional <code>/api/ai/*</code> routes that create proposals. No secrets are stored in packs.</li>
          </ul>
        </Panel>

        <Panel title="AI modes">
          <p className="small">AI mode is controlled by server environment variables:</p>
          <ul>
            <li><code>AI_MODE=offline</code> (default) — deterministic proposals only.</li>
            <li><code>AI_MODE=hosted</code> — OpenAI server-side (requires <code>OPENAI_API_KEY</code>).</li>
            <li><code>AI_MODE=local</code> — OpenAI-compatible local endpoint (requires <code>OPENAI_BASE_URL</code>).</li>
          </ul>
          <div className="row">
            <a className="btn" href="/ai">AI status & config</a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
