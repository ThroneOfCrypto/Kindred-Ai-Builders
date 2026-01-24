"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { LocalNetworkAccessHelp, isLikelyLocalNetworkAccessBlock } from "../_components/local_network_access_help";

// Director Health (Deploy Lane helper)
// - Designed for non-technical Directors.
// - Helps confirm: browser can reach local connector + pairing is correct.
// - Does not expose internal implementation details.

const AI_CONN_KEY_V2 = "kindred.ai.connection.v2";
const AI_CONN_KEY_V1 = "kindred.ai.connection.v1";
const CONNECTOR_BASE_DEFAULT = "http://127.0.0.1:6174";

type AiConn = {
  connected: boolean;
  connector_url?: string;
  pairing_code?: string;
};

async function fetchJson(url: string, init: any, timeoutMs = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...( { targetAddressSpace: "loopback" } as any ),
      cache: "no-store",
      ...init,
      signal: ac.signal,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      const txt = await res.text().catch(() => "");
      json = { ok: false, error: "bad_response", details: [txt || `HTTP ${res.status}`] };
    }
    return { ok: Boolean(res.ok && json?.ok), status: res.status, json };
  } catch (e: any) {
    const isTimeout = String(e?.name || "").includes("Abort");
    return {
      ok: false,
      status: 0,
      json: {
        ok: false,
        error: isTimeout ? "timeout" : "network_error",
        details: [isTimeout ? "Connector did not respond in time." : "Could not reach the local connector."],
      },
    };
  } finally {
    clearTimeout(t);
  }
}

function readAiConnection(): AiConn {
  try {
    const raw2 = localStorage.getItem(AI_CONN_KEY_V2);
    if (raw2) {
      const j = JSON.parse(raw2);
      return {
        connected: Boolean(j?.connected),
        connector_url: String(j?.connector_url || CONNECTOR_BASE_DEFAULT),
        pairing_code: String(j?.pairing_code || ""),
      };
    }
  } catch {
    // ignore
  }
  try {
    const raw1 = localStorage.getItem(AI_CONN_KEY_V1);
    if (raw1) {
      const j = JSON.parse(raw1);
      return {
        connected: Boolean(j?.connected),
        connector_url: String(j?.connector_url || CONNECTOR_BASE_DEFAULT),
        pairing_code: String(j?.pairing_code || ""),
      };
    }
  } catch {
    // ignore
  }
  return { connected: false, connector_url: CONNECTOR_BASE_DEFAULT, pairing_code: "" };
}

export default function DirectorHealthPage() {
  const [ai, setAi] = useState<AiConn>({ connected: false, connector_url: CONNECTOR_BASE_DEFAULT, pairing_code: "" });
  const connectorUrl = useMemo(() => String(ai.connector_url || CONNECTOR_BASE_DEFAULT).replace(/\/$/, ""), [ai.connector_url]);
  const pairingCode = useMemo(() => String(ai.pairing_code || ""), [ai.pairing_code]);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [details, setDetails] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string>("");

  useEffect(() => {
    const refresh = () => setAi(readAiConnection());
    refresh();
    const on = () => refresh();
    window.addEventListener("kindred_ai_connection_changed", on as any);
    return () => window.removeEventListener("kindred_ai_connection_changed", on as any);
  }, []);

  async function runChecks() {
    setBusy(true);
    setStatus("");
    setDetails([]);
    setLastError("");
    try {
      const lines: string[] = [];

      // 1) Basic reachability.
      const h = await fetchJson(`${connectorUrl}/health`, { method: "GET" }, 8000);
      if (!h.ok) {
        setLastError(String(h?.json?.details?.[0] || h?.json?.error || "unknown"));
        setStatus("Could not reach your local connector.");
        setDetails(["Confirm the connector is running on this computer.", "If your browser asks for Local Network Access permission, allow it."]);
        return;
      }
      lines.push("Connector reachable.");

      // 2) Pairing check (prevents silent mismatch).
      if (!pairingCode) {
        setStatus("Connector reachable, but no pairing code is set.");
        setDetails(["Go to Connect AI and enter the pairing code shown in the connector window."]);
        return;
      }

      const p = await fetchJson(`${connectorUrl}/v1/pairing/check`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-kindred-pairing": pairingCode },
        body: JSON.stringify({}),
      }, 8000);
      if (!p.ok) {
        setLastError(String(p?.json?.error || "pairing_failed"));
        setStatus("Connector reachable, but pairing failed.");
        setDetails(["Your pairing code is wrong or expired.", "Open Connect AI and enter the fresh code."]);
        return;
      }
      lines.push("Pairing code accepted.");

      // 3) Provider status (verifies the connector can run its adapters).
      const s = await fetchJson(`${connectorUrl}/v1/providers/status`, {
        method: "GET",
        headers: { "x-kindred-pairing": pairingCode },
      }, 8000);
      if (!s.ok) {
        lines.push("Provider status check failed (connector is reachable, but adapters may be unavailable)." );
      } else {
        const n = Array.isArray(s?.json?.providers) ? s.json.providers.length : 0;
        lines.push(n ? `Provider routes found: ${n}.` : "No provider routes detected (this is OK if you're in limited mode)." );
      }

      setStatus("All checks passed.");
      setDetails(lines);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Health check</h1>
        <p>Confirm your browser can reach your local connector and your pairing code is correct.</p>
      </div>

      <Panel title="Connection">
        <p className="small" style={{ marginTop: 0 }}>
          Connector URL: <b>{connectorUrl}</b>
        </p>
        <p className="small" style={{ marginTop: 0 }}>
          Pairing code set: <b>{pairingCode ? "Yes" : "No"}</b>
        </p>

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button className="btn" type="button" disabled={busy} onClick={runChecks}>
            {busy ? "Testing…" : "Run health check"}
          </button>
          <a className="btn secondary" href="/director/connect-ai">Connect AI</a>
          <a className="btn secondary" href={connectorUrl} target="_blank" rel="noreferrer">Open connector</a>
        </div>

        {status ? (
          <Callout title={status} tone={status.includes("passed") ? "info" : "warn"}>
            {details.length ? (
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            ) : null}
            {lastError ? (
              <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                Error: <b>{lastError}</b>
              </p>
            ) : null}
          </Callout>
        ) : null}

        {lastError && (String(lastError).includes("network_error") || isLikelyLocalNetworkAccessBlock(lastError)) ? (
          <LocalNetworkAccessHelp connectorUrl={connectorUrl} />
        ) : null}
      </Panel>

      <Callout title="Why this exists" tone="info">
        <p className="small" style={{ margin: 0 }}>
          Modern browsers are starting to restrict requests from public websites to your local network.
          This is for safety, but it can block local connectors unless you allow it.
        </p>
      </Callout>
    </div>
  );
}
