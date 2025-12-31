export default function AboutPage() {
  return (
    <>
      <h1>About</h1>
      <div className="card">
        <p className="small">
          This is an offline-first, beginner-friendly builder. It exports a Spec Pack ZIP containing canonical JSON
          blueprints (intake, palettes, tradeoffs, design primitives, optional AI connector config).
        </p>
        <p className="small">
          Wallet login and any chain-specific logic should be added later. This repo is designed to keep early work simple and deployable.
        </p>
      </div>
    </>
  );
}
