"use client";

import { useEffect, useMemo, useState } from "react";
import { listWallets, type Cip30Api, type WalletHandle } from "@/lib/wallet";

type WalletState =
  | { status: "disconnected" }
  | { status: "connecting"; wallet: string }
  | { status: "connected"; wallet: string; networkId: number; addressHex: string }
  | { status: "error"; message: string };

export default function WalletConnect() {
  const wallets = useMemo(() => (typeof window === "undefined" ? [] : listWallets()), []);
  const [selected, setSelected] = useState<string>(wallets[0]?.key ?? "");
  const [state, setState] = useState<WalletState>({ status: "disconnected" });

  useEffect(() => {
    if (!selected && wallets.length > 0) setSelected(wallets[0].key);
  }, [selected, wallets]);

  async function connect() {
    const w: WalletHandle | undefined = wallets.find((x) => x.key === selected);
    if (!w) {
      setState({ status: "error", message: "No wallet selected." });
      return;
    }

    setState({ status: "connecting", wallet: w.name });
    try {
      const api: Cip30Api = await w.enable();
      const networkId = await api.getNetworkId();
      const used = await api.getUsedAddresses();
      const addressHex = used[0] ?? "";
      setState({ status: "connected", wallet: w.name, networkId, addressHex });
    } catch (e: any) {
      setState({ status: "error", message: e?.message ?? String(e) });
    }
  }

  function disconnect() {
    setState({ status: "disconnected" });
  }

  return (
    <div className="card">
      <h2>Wallet login (CIP-30)</h2>

      {wallets.length === 0 ? (
        <p className="small">
          No CIP-30 wallets detected in this browser. Install a Cardano wallet extension
          (e.g., Eternl / Nami / Lace) and refresh.
        </p>
      ) : (
        <>
          <div className="row">
            <label className="small" htmlFor="wallet">Wallet</label>
            <select
              id="wallet"
              className="btn"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={state.status === "connecting"}
            >
              {wallets.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.name}
                </option>
              ))}
            </select>

            {state.status === "connected" ? (
              <button className="btn" onClick={disconnect}>
                Disconnect
              </button>
            ) : (
              <button className="btn" onClick={connect} disabled={state.status === "connecting"}>
                {state.status === "connecting" ? "Connecting…" : "Connect"}
              </button>
            )}
          </div>

          <div className="card">
            <div className="small">Status</div>
            <div className="mono">
              {state.status === "disconnected" && "disconnected"}
              {state.status === "connecting" && `connecting to ${state.wallet}`}
              {state.status === "connected" &&
                `connected: ${state.wallet} (networkId=${state.networkId}) addressHex=${state.addressHex || "(none)"}`}
              {state.status === "error" && `error: ${state.message}`}
            </div>
          </div>
        </>
      )}

      <p className="small">
        This is intentionally minimal: it proves “wallet is login” without database or server sessions.
        Next iterations add message-signing + session issuance for server-side gates.
      </p>
    </div>
  );
}
