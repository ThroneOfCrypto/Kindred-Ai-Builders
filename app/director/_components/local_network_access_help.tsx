"use client";

import React, { useEffect, useMemo, useState } from "react";

// Chrome is tightening the rules for web pages talking to localhost / local networks.
// When this fails, the browser often surfaces only: "TypeError: Failed to fetch".
// This helper provides an actionable, Director-safe recovery path.

export function isLikelyLocalNetworkAccessBlock(text: string | null | undefined): boolean {
  const s = String(text || "");
  if (!s) return false;
  return /local network access|private network access|\bPNA\b|\bLNA\b|Access-Control-Allow-Private-Network|Permission was denied for this request to access|unknown address space|failed to fetch/i.test(
    s
  );
}


type SelfTestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; latency_ms: number; body?: string; request_id?: string }
  | { status: "error"; message: string; request_id?: string };

export function LocalNetworkAccessHelp(props: { connectorUrl?: string }) {
  const url = String(props.connectorUrl || "http://127.0.0.1:6174").replace(/\/+$/, "");
  const embedded = typeof window !== "undefined" && window.top !== window.self;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

  const [policyBlocks, setPolicyBlocks] = useState<boolean | null>(null);
  const [permissionState, setPermissionState] = useState<string | null>(null);
  const [selfTest, setSelfTest] = useState<SelfTestState>({ status: "idle" });

  useEffect(() => {
    try {
      // Permissions Policy (formerly Feature Policy) can deny specific browser features.
      // Some embedded contexts (Office/Teams/etc) may suppress the Local Network Access prompt entirely.
      // We keep this best-effort and fail open (unknown) if unsupported.
      // @ts-ignore
      const pp = typeof document !== "undefined" ? (document as any).permissionsPolicy : null;
      if (pp && typeof pp.allowsFeature === "function") {
        setPolicyBlocks(!pp.allowsFeature("local-network-access"));
      } else {
        setPolicyBlocks(null);
      }
    } catch {
      setPolicyBlocks(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Best-effort: not all browsers expose "local-network-access" through the Permissions API.
        // @ts-ignore
        const perms = typeof navigator !== "undefined" ? (navigator as any).permissions : null;
        if (!perms || typeof perms.query !== "function") return;
        // @ts-ignore
        const res = await perms.query({ name: "local-network-access" });
        if (cancelled) return;
        setPermissionState(res?.state || "unknown");
        if (res && typeof res.addEventListener === "function") {
          res.addEventListener("change", () => {
            try {
              setPermissionState(res.state);
            } catch {
              // ignore
            }
          });
        }
      } catch {
        // unsupported in this environment
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copyPayload = useMemo(() => {
    return {
      connector_url: url,
      embedded,
      permissions_policy_blocks_local_network_access: policyBlocks,
      local_network_access_permission_state: permissionState,
      user_agent: ua,
    };
  }, [url, embedded, policyBlocks, permissionState, ua]);

  async function runSelfTest() {
    if (selfTest.status === "running") return;
    setSelfTest({ status: "running" });
    const ac = new AbortController();
    const t0 = Date.now();
    const timeout = setTimeout(() => ac.abort(), 5000);
    try {
      const r = await fetch(`${url}/health`, {
        method: "GET",
        cache: "no-store",
        // @ts-ignore
        targetAddressSpace: "loopback",
        signal: ac.signal,
      });
      const rid = String(r.headers.get("x-kindred-request-id") || "").trim();
      const txt = await r.text();
      const latency = Date.now() - t0;
      if (!r.ok) {
        setSelfTest({ status: "error", message: `Health check returned ${r.status}`, request_id: rid || undefined });
        return;
      }
      setSelfTest({ status: "ok", latency_ms: latency, body: txt.slice(0, 240), request_id: rid || undefined });
    } catch (e: any) {
      const msg = String(e?.name ? `${e.name}: ${e.message || ""}` : e?.message || e || "Unknown error");
      setSelfTest({ status: "error", message: msg });
    } finally {
      clearTimeout(timeout);
    }
  }

  return (
    <div className="callout warn" style={{ marginTop: 10 }}>
      <div className="calloutTitle">Local connector blocked by your browser</div>
      <div className="calloutBody">
        <p className="small" style={{ margin: 0 }}>
          This page is trying to reach your local connector at <code>{url}</code>. Chrome may block this unless you grant
          <strong> Local Network Access</strong>.
        </p>

        <div className="small" style={{ marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={url} target="_blank" rel="noreferrer" className="btn" style={{ textDecoration: "none" }}>
            Open connector
          </a>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(copyPayload, null, 2));
              } catch {
                // best-effort
              }
            }}
          >
            Copy diagnostics
          </button>
          <button type="button" className="btn" onClick={runSelfTest} disabled={selfTest.status === "running"}>
            {selfTest.status === "running" ? "Testing..." : "Run self-test"}
          </button>
        </div>

        {permissionState ? (
          <div className="small" style={{ marginTop: 6 }}>
            Local Network Access permission: <strong>{permissionState}</strong>
          </div>
        ) : null}

        {selfTest.status === "ok" ? (
          <div className="small" style={{ marginTop: 6 }}>
            Self-test: <strong>OK</strong> ({selfTest.latency_ms}ms)
            {selfTest.request_id ? <span> · req:{String(selfTest.request_id).slice(0, 8)}</span> : null}
            {selfTest.body ? <span> · {selfTest.body}</span> : null}
          </div>
        ) : null}

        {selfTest.status === "error" ? (
          <div className="small" style={{ marginTop: 6 }}>
            Self-test: <strong>Failed</strong>
            {selfTest.request_id ? <span> · req:{String(selfTest.request_id).slice(0, 8)}</span> : null}
            <span> · {selfTest.message}</span>
          </div>
        ) : null}

        <ul className="small" style={{ marginTop: 8, marginBottom: 0 }}>
          <li>Confirm the connector app is running on this computer.</li>
          <li>Retry the action. If Chrome prompts for Local Network Access, allow it.</li>
          {embedded ? (
            <li>
              You appear to be running inside an embedded frame. Some hosts suppress the Local Network Access prompt.
              Try opening this page in a normal Chrome tab.
            </li>
          ) : null}
          {policyBlocks === true ? (
            <li>
              Your environment appears to deny <code>local-network-access</code> via Permissions Policy.
              This prevents the prompt from appearing.
            </li>
          ) : null}
          <li>
            If you never see a prompt, open <code>chrome://flags/#local-network-access-check</code> and enable blocking to
            test whether Chrome is enforcing it.
          </li>
          <li>
            If it still fails, the connector may be missing the required CORS headers for your site, or your environment
            blocks loopback requests.
          </li>
          <li>On managed devices, an organization policy may be required to allow Local Network Access for this site.</li>
        </ul>
      </div>
    </div>
  );
}
