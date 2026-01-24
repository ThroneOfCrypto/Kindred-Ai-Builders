"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "./Panel";
import { Callout } from "./Callout";

type Tri = "pass" | "warn" | "fail";

type PublicProofStatus = {
  schema?: string;
  generated_at_utc?: string;
  last_run_utc_ts?: string;
  overall?: string;
  executor?: {
    node?: string;
    npm?: string;
    node_ok?: boolean;
    npm_registry_reachable?: boolean | null;
    authoritative?: boolean;
    non_authoritative_reasons?: string[];
  };
  steps?: { name: string; status: string; exit_code: number }[];
};

function triFrom(data: PublicProofStatus | null): Tri {
  const overall = String(data?.overall || "").toLowerCase();
  if (overall === "pass") return "pass";
  if (overall === "fail") return "fail";
  return "warn";
}

function badgeClass(tri: Tri): string {
  if (tri === "pass") return "badge badge--ok";
  if (tri === "fail") return "badge badge--danger";
  return "badge";
}

function fmtUtc(ts: string | undefined): string {
  const x = String(ts || "").trim();
  if (!x) return "";
  // Keep ISO as-is; it is already precise and unambiguous.
  return x;
}

export function ProofReceiptStatus() {
  const [data, setData] = useState<PublicProofStatus | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    const url = `/dist/proof_status.json?ts=${Date.now()}`;
    setLoading(true);
    setError("");
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as PublicProofStatus;
      })
      .then((j) => {
        if (!alive) return;
        setData(j);
        setLoading(false);
      })
      .catch((e: any) => {
        if (!alive) return;
        setError(String(e?.message || "Unable to load proof receipt"));
        setData(null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const tri = useMemo(() => triFrom(data), [data]);
  const authoritative = Boolean(data?.executor?.authoritative);

  const subtitle = loading
    ? "Loading proof receipt…"
    : data
      ? authoritative
        ? "Authoritative proof receipt exported to Deploy Lane"
        : "Receipt present, but not authoritative"
      : "No proof receipt exported yet";

  return (
    <Panel
      title="Proof Lane status"
      subtitle={subtitle}
      actions={
        <div className="row">
          <a className="btn" href="/verify">
            Verify guide
          </a>
          <a className="btn secondary" href="/docs/verify">
            Docs
          </a>
        </div>
      }
    >
      {loading ? (
        <p className="small">Fetching <code className="md_inline_code">/public/dist/proof_status.json</code>…</p>
      ) : data ? (
        <>
          <div className="row row_center">
            <span className={badgeClass(tri)}>
              <strong>{authoritative ? "Authoritative" : tri === "pass" ? "Pass (non-authoritative)" : tri === "fail" ? "Fail" : "Unknown"}</strong>
            </span>
            <span className="small">Last run: {fmtUtc(data.last_run_utc_ts || data.generated_at_utc) || "(unknown)"}</span>
          </div>

          {!authoritative ? (
            <Callout kind="warn" title="Not authoritative">
              <p className="small">
                Deploy Lane can show receipts, but it cannot manufacture trust. Authoritative proof requires a contracted executor (Node 24 + npm registry reachable).
              </p>
              {data.executor?.non_authoritative_reasons?.length ? (
                <ul className="list">
                  {data.executor.non_authoritative_reasons.slice(0, 10).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : null}
            </Callout>
          ) : null}

          <div className="hr" />
          <div className="row">
            <div className="small">
              Node: <code className="md_inline_code">{String(data.executor?.node || "?")}</code>
            </div>
            <div className="small">
              Registry: <code className="md_inline_code">{String(data.executor?.npm_registry_reachable)}</code>
            </div>
          </div>

          {Array.isArray(data.steps) && data.steps.length ? (
            <>
              <div className="hr" />
              <p className="small mb0">Steps:</p>
              <div className="chips">
                {data.steps.slice(0, 12).map((s) => (
                  <span key={s.name} className={`chip ${s.status === "pass" ? "chip--ok" : "chip--warn"}`}>
                    {s.name}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : (
        <Callout kind="info" title="No receipt exported">
          <p className="small">Run Proof Lane, then export receipts into Deploy Lane:</p>
          <pre className="md_code">
            <code>{`npm run proof:gate
npm run proof:export`}</code>
          </pre>
          <p className="small mb0">This site will automatically pick up <code className="md_inline_code">public/dist/proof_status.json</code> once exported.</p>
          <p className="small">Error: {error || "(none)"}</p>
        </Callout>
      )}
    </Panel>
  );
}
