"use client";

import React, { useEffect, useState } from "react";
import { Panel } from "./Panel";
import { Callout } from "./Callout";
import { PrimaryButton, SecondaryButton } from "./Buttons";

type Selfcheck = {
  ok: boolean;
  checked_at_utc?: string;
  env?: {
    node_env?: string;
    vercel?: boolean;
    prod_like?: boolean;
    node_version?: string;
  };
  app?: {
    ai_mode?: string;
    ai_ready?: boolean;
    ai_missing_env?: string[];
  };
  hints?: string[];
};

function toneFrom(s: Selfcheck | null): "success" | "warn" | "error" {
  if (!s) return "warn";
  if (!s.ok) return "error";
  const ready = Boolean(s.app?.ai_ready);
  const mode = String(s.app?.ai_mode || "offline");
  if (mode !== "offline" && !ready) return "warn";
  return "success";
}

export function SelfCheckPanel() {
  const [status, setStatus] = useState<Selfcheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  async function run() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/selfcheck", { cache: "no-store" });
      const j = (await r.json().catch(() => null)) as any;
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setStatus(j as Selfcheck);
    } catch (e: any) {
      setErr(String(e?.message || e || "Selfcheck failed"));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Don’t auto-hit on every page load; it’s a user action.
  }, []);

  const tone = toneFrom(status);
  const title =
    !status ? "Runtime selfcheck" : status.app?.ai_mode === "offline" ? "Runtime selfcheck (AI offline)" : status.app?.ai_ready ? "Runtime selfcheck (AI ready)" : "Runtime selfcheck (AI misconfigured)";

  return (
    <Panel title={title}>
      <p className="small" style={{ marginTop: 0 }}>
        This is the post-deploy sanity check. It never reveals secrets. It only reports whether required server env vars appear present.
      </p>

      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <PrimaryButton onClick={run} disabled={loading}>
          {loading ? "Checking…" : "Run selfcheck"}
        </PrimaryButton>
        <SecondaryButton href="/api/selfcheck" target="_blank">
          Open JSON
        </SecondaryButton>
        <SecondaryButton href="/ai">AI status</SecondaryButton>
      </div>

      {err ? <Callout tone="error" title="Selfcheck error" details={[err]} /> : null}

      {status ? (
        <Callout
          tone={tone}
          title={tone === "success" ? "Looks sane" : tone === "warn" ? "Needs attention" : "Failed"}
          details={[
            `checked_at_utc: ${status.checked_at_utc || ""}`,
            `node: ${status.env?.node_version || ""}`,
            `prod_like: ${String(status.env?.prod_like)}`,
            `ai_mode: ${String(status.app?.ai_mode || "" )}`,
            `ai_ready: ${String(status.app?.ai_ready)}`,
            ...(Array.isArray(status.app?.ai_missing_env) && status.app?.ai_missing_env.length ? [`missing_env: ${status.app?.ai_missing_env.join(", ")}`] : []),
            ...(Array.isArray(status.hints) ? status.hints : []),
          ]}
        />
      ) : null}
    </Panel>
  );
}
