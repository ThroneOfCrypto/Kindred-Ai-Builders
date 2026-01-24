import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <div className="container">
        <div className="hero">
          <h1>Kindred AI Builders</h1>
          <p>
            Describe what you want to build. Get 3–7 coherent proposals. Choose, refine, and ship a handoff your team can build.
          </p>

          <div className="row mt2">
            <Link className="btn primary" href="/director/journey">
              Start building
            </Link>
            <Link className="btn" href="/director/import">
              Import an existing project
            </Link>
          </div>
        </div>

        <div className="grid">
          <section className="panel">
            <h2 className="h2">What this is</h2>
            <ul className="list">
              <li>A Director-first journey that feels like working with a consultancy.</li>
              <li>AI generates proposals. Mechanical checks prevent missing safety basics.</li>
              <li>Exports a ship pack (spec + plan + handoff) that a team can build.</li>
            </ul>
            <p className="small mb0">No secrets are stored in your browser.</p>
          </section>

          <section className="panel">
            <h2 className="h2">Where to start</h2>
            <div className="cards">
              <Link className="card" href="/director/journey">
                <h3>Director Journey</h3>
                <p>Brief → proposals → choose → refine → ship.</p>
              </Link>
              <Link className="card" href="/director/import">
                <h3>Import a repo</h3>
                <p>Reverse engineer an existing codebase into a build plan.</p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
