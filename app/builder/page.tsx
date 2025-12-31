import SpecPackBuilder from "@/components/SpecPackBuilder";
import WalletConnect from "@/components/WalletConnect";

export default function BuilderPage() {
  return (
    <>
      <h1>Builder</h1>
      <p className="small">
        Offline-first builder: generate a Spec Pack ZIP with no wallet, no keys, no database.
        AI + wallet come later.
      </p>

      <SpecPackBuilder />

      <details className="card" style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Optional: Wallet login (later)</summary>
        <p className="small">
          Wallet is not required for the offline builder. We’ll attach wallet last.
        </p>
        <WalletConnect />
      </details>

      <div className="card">
        <h2>AI status</h2>
        <p className="small">
          The server reports AI wiring (mode + whether env vars exist). It does not call external services.
        </p>
        <a className="btn" href="/api/ai/status">Open /api/ai/status</a>
      </div>
    </>
  );
}
