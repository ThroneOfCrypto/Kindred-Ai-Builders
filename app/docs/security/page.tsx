import { Panel } from "../../../components/Panel";

export default function SecurityPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Security & data storage</h1>
        <p>Offline-first by default. Secrets stay server-side. Local data lives in your browser.</p>
      </div>

      <div className="grid">
        <Panel title="What is stored locally">
          <ul>
            <li>Project state (Builder JSON) per project id.</li>
            <li>Last-used Base/Proposal Spec Pack ZIPs (base64 in local storage).</li>
            <li>Snapshots (local-only, created before destructive operations).</li>
            <li>Governance state (locked truth pack hashes + provenance lineage).</li>
          </ul>
          <p className="small">You can clear local storage at any time to remove all local data.</p>
        </Panel>

        <Panel title="What is never stored in packs">
          <ul>
            <li>API keys and secrets (no <code>NEXT_PUBLIC_*</code> secrets, no server-side env dumps).</li>
            <li>Raw repository source code (unless you intentionally upload a repo ZIP in Brownfield).</li>
          </ul>
        </Panel>

        <Panel title="API hardening (baseline)">
          <p className="small">
            API routes are protected by a lightweight middleware rate limit and request-size guard (see <code>middleware.ts</code>).
            Debug log analysis redacts common secret patterns before sending anything to hosted/local AI.
            This is in-memory and intended as a baseline; for GA you should use a durable store or platform-native rate limiting.
          </p>
        </Panel>

        <Panel title="Hosted deployment">
          <p className="small">
            When you enable Hosted AI, secrets are configured as server environment variables in your hosting
            platform (e.g. Vercel). The UI and exported Spec Packs remain secret-free.
          </p>
          <p className="small">See repo docs: <code>docs/AI.md</code> and <code>docs/VERCEL_DEPLOY.md</code>.</p>
        </Panel>
      </div>
    </div>
  );
}
