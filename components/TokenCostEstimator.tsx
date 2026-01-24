"use client";

import React, { useMemo, useState } from "react";

function asNum(x: any): number {
  const n = typeof x === "number" ? x : parseFloat(String(x || ""));
  return Number.isFinite(n) ? n : 0;
}

function usd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return "$" + (n < 1 ? n.toFixed(4) : n.toFixed(2));
}

/**
 * Placeholder-only estimator. Prices change; the user should set rates from their provider.
 */
export function TokenCostEstimator(props: {
  title?: string;
  defaultInputRatePer1M?: number;
  defaultOutputRatePer1M?: number;
}) {
  const [inputTokens, setInputTokens] = useState<string>("100000");
  const [outputTokens, setOutputTokens] = useState<string>("25000");
  const [inRate, setInRate] = useState<string>(String(props.defaultInputRatePer1M ?? 1));
  const [outRate, setOutRate] = useState<string>(String(props.defaultOutputRatePer1M ?? 4));

  const est = useMemo(() => {
    const it = asNum(inputTokens);
    const ot = asNum(outputTokens);
    const ir = asNum(inRate);
    const or = asNum(outRate);
    const cost = (it / 1_000_000) * ir + (ot / 1_000_000) * or;
    return {
      cost,
      it,
      ot,
      ir,
      or,
    };
  }, [inputTokens, outputTokens, inRate, outRate]);

  return (
    <div className="card" style={{ padding: 12, borderRadius: 14, border: "1px solid var(--border)", background: "var(--card)" }}>
      <strong>{props.title || "Token cost estimator (placeholder)"}</strong>
      <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>
        Prices change. Set the $/1M rates from your provider, then this gives you an estimate.
      </div>

      <div className="grid2" style={{ marginTop: 10, gap: 10 }}>
        <div className="field">
          <label>Input tokens</label>
          <input value={inputTokens} onChange={(e) => setInputTokens(e.target.value)} inputMode="numeric" />
        </div>
        <div className="field">
          <label>Output tokens</label>
          <input value={outputTokens} onChange={(e) => setOutputTokens(e.target.value)} inputMode="numeric" />
        </div>
        <div className="field">
          <label>Input rate ($ per 1M)</label>
          <input value={inRate} onChange={(e) => setInRate(e.target.value)} inputMode="decimal" />
        </div>
        <div className="field">
          <label>Output rate ($ per 1M)</label>
          <input value={outRate} onChange={(e) => setOutRate(e.target.value)} inputMode="decimal" />
        </div>
      </div>

      <div className="row" style={{ marginTop: 10, justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div className="badge">
          <strong>Estimate</strong> <span>{usd(est.cost)}</span>
        </div>
        <div className="small" style={{ opacity: 0.9 }}>
          Formula: (in/1M)*inRate + (out/1M)*outRate
        </div>
      </div>
    </div>
  );
}
