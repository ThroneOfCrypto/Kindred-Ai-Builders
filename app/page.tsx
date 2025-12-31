import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <h1>Kindred AI Builders</h1>
      <p className="small">
        Offline-first builder UI. No wallet, no keys, no database required to start.
        Generate a deterministic Spec Pack ZIP, then import it into SDDE tooling later.
      </p>

      <div className="card">
        <h2>Start</h2>
        <div className="row">
          <Link className="btn" href="/builder">Open Builder</Link>
          <a className="btn" href="/api/ai/status">Check AI Status</a>
        </div>
        <p className="small">
          This repo is meant to deploy cleanly on Vercel. It intentionally avoids complex backend state.
        </p>
      </div>

      <div className="card">
        <h2>What you get</h2>
        <ul className="small">
          <li>A step-by-step wizard (Launch Path → Palettes → Design primitives → AI connectors → Export).</li>
          <li>An API route that generates a ZIP with canonical JSON blueprints.</li>
          <li>An optional “AI connectors” wizard (offline / hosted / local) that never stores secrets in files.</li>
        </ul>
      </div>
    </>
  );
}
