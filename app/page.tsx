import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <h1>Kindred v2</h1>
      <p className="small">
        Greenfield foundation: deploy-first, then add the builder workflow.
      </p>

      <div className="card">
        <h2>Start building</h2>
        <p>
          Go to the Builder screen, connect a Cardano wallet (CIP-30), and begin
          the guided flow.
        </p>
        <div className="row">
          <Link className="btn" href="/builder">Open Builder</Link>
          <a className="btn" href="/api/ai/status">AI Status (JSON)</a>
        </div>
        <p className="small">
          No database. No required env vars. Designed to deploy cleanly.
        </p>
      </div>

      <div className="card">
        <h2>What’s next</h2>
        <ul>
          <li>Palettes → scenes → first “Hello SaaS” slice.</li>
          <li>AI mode switch: Offline / Hosted / Local (env + contracts).</li>
          <li>Usage credits (non-custodial) once the flow is stable.</li>
        </ul>
      </div>
    </>
  );
}
