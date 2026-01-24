"use client";

import React, { useState } from "react";

import { Panel } from "./Panel";
import { Callout } from "./Callout";
import { PrimaryButton } from "./Buttons";

type PingOk = { ok: true; mode: string; model?: string; has_key?: boolean; warnings?: string[] };
type PingErr = { ok: false; error: string; warnings?: string[] };

export function AiPingPanel() {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ok"; data: PingOk }
    | { status: "err"; data: PingErr }
  >({ status: "idle" });

  async function run() {
    setState({ status: "loading" });
    try {
      const r = await fetch("/api/ai/ping", { cache: "no-store" });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) {
        setState({ status: "err", data: { ok: false, error: String(j?.error || "AI not ready"), warnings: j?.warnings || [] } });
        return;
      }
      setState({ status: "ok", data: { ok: true, mode: String(j?.mode || "?"), model: j?.model, has_key: Boolean(j?.has_key), warnings: j?.warnings || [] } });
    } catch (e: any) {
      setState({ status: "err", data: { ok: false, error: String(e?.message || e), warnings: [] } });
    }
  }

  const callout = (() => {
    if (state.status === "loading") return <Callout title="Testing…" tone="info">Contacting <code>/api/ai/ping</code>.</Callout>;
    if (state.status === "err")
      return (
        <Callout title="AI not ready" tone="warn">
          <div className="small">
            <div>{state.data.error}</div>
            {state.data.warnings?.length ? (
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{state.data.warnings.join("\n")}</pre>
            ) : null}
          </div>
        </Callout>
      );
    if (state.status === "ok")
      return (
        <Callout title="AI reachable" tone={state.data.warnings?.length ? "warn" : "success"}>
          <div className="small">
            <pre style={{ whiteSpace: "pre-wrap" }}>{[`mode=${state.data.mode}`, `model=${state.data.model || "?"}`, `has_key=${String(state.data.has_key)}`].join("\n")}</pre>
            {state.data.warnings?.length ? (
              <pre style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{state.data.warnings.join("\n")}</pre>
            ) : null}
          </div>
        </Callout>
      );
    return (
      <Callout title="No secrets here" tone="info">
        This test never asks you to paste a key into the browser. It just checks whether the server environment is configured.
      </Callout>
    );
  })();

  return (
    <Panel title="Quick test">
      <p className="small">Use this after you set env vars on your host. It confirms the server can reach your configured AI provider.</p>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <PrimaryButton onClick={run}>Test AI configuration</PrimaryButton>
        <a className="btn" href="/ai/setup">
          Guided setup
        </a>
        <a className="btn" href="/docs/ai-keys-and-costs">
          API keys & costs
        </a>
        <a className="btn" href="/usage">
          Spend awareness
        </a>
      </div>
      <div style={{ marginTop: 12 }}>{callout}</div>
    </Panel>
  );
}
