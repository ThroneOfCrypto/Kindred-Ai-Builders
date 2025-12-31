import WalletConnect from "@/components/WalletConnect";

export default function BuilderPage() {
  return (
    <>
      <h1>Builder</h1>
      <p className="small">
        This is where Palettes → Tradeoffs → First Slice will live. v0 starts with wallet login and AI status.
      </p>

      <WalletConnect />

      <div className="card">
        <h2>AI status</h2>
        <p>
          The server reports AI wiring (mode + whether env vars exist). It does not call external services.
        </p>
        <a className="btn" href="/api/ai/status">Open /api/ai/status</a>
      </div>
    </>
  );
}
