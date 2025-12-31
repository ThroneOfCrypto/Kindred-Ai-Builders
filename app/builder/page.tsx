import SpecPackBuilder from "@/components/SpecPackBuilder";
import WalletConnect from "@/components/WalletConnect";

export default function BuilderPage() {
  return (
    <>
      <h1>Builder</h1>
      <p className="small">
        This is an offline-first wizard. It unfolds step-by-step and generates a Spec Pack ZIP.
        Wallet + AI come later.
      </p>

      <SpecPackBuilder />

      <details className="card" style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Optional: Wallet (later)</summary>
        <p className="small">
          Wallet is not part of the offline builder flow. We’ll attach it last.
        </p>
        <WalletConnect />
      </details>
    </>
  );
}
