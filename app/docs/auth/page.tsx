import { Panel } from "../../../components/Panel";

export default function AuthDocsPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Authentication (planned)</h1>
        <p>v1.0.x ships offline-first and single-user by default. Login is an optional future kit.</p>
      </div>

      <div className="grid">
        <Panel title="Targets">
          <ol>
            <li>
              <strong>Cardano wallet login</strong>
              <div className="small">Connect a Cardano-compatible wallet and sign a challenge to prove address ownership.</div>
            </li>
            <li>
              <strong>Cardano social wallet login</strong>
              <div className="small">An on-ramp for users without a wallet installed yet: social login that yields a Cardano address.</div>
            </li>
          </ol>
        </Panel>

        <Panel title="Kernel stance">
          <ul>
            <li>Provider-neutral core. Integrations ship as optional Kits.</li>
            <li>Same identity primitive: a verified Cardano address (and optionally signatures/metadata).</li>
            <li>Offline-first posture remains: no accounts are required to use the core loop.</li>
          </ul>
        </Panel>

        <Panel title="Docs">
          <p className="small">Repo doc: <code>docs/AUTH.md</code></p>
          <div className="row">
            <a className="btn" href="/account">Account page</a>
            <a className="btn" href="/docs/security">Security</a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
