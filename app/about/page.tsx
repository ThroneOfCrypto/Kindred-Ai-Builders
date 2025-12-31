export default function AboutPage() {
  return (
    <>
      <h1>About</h1>
      <div className="card">
        <p>
          This is a minimal greenfield web app intended to become the public
          “builder-first” surface for SDDE OS.
        </p>
        <p className="small">
          v0 intentionally avoids auth providers, databases, and complex infra.
        </p>
      </div>
    </>
  );
}
