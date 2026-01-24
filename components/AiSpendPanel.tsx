"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "./Panel";
import { Callout } from "./Callout";
import { PrimaryButton } from "./Buttons";
import { AiReceiptV1, clearAiReceipts, loadAiBudget, loadAiReceipts, receiptsTotalUsdWithinWindow, saveAiBudget } from "../lib/ai_spend";

function asNum(x: any): number {
  const n = typeof x === "number" ? x : parseFloat(String(x || ""));
  return Number.isFinite(n) ? n : 0;
}

function usd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  return "$" + (n < 1 ? n.toFixed(4) : n.toFixed(2));
}

export function AiSpendPanel() {
  const [budget, setBudget] = useState(loadAiBudget());
  const [receipts, setReceipts] = useState<AiReceiptV1[]>([]);

  useEffect(() => {
    setReceipts(loadAiReceipts());
  }, []);

  const windowTotal = useMemo(() => receiptsTotalUsdWithinWindow(receipts, budget.window_days), [receipts, budget.window_days]);

  function persist() {
    const b = {
      ...budget,
      input_rate_per_1m: Math.max(0, asNum(budget.input_rate_per_1m)),
      output_rate_per_1m: Math.max(0, asNum(budget.output_rate_per_1m)),
      soft_cap_usd: Math.max(0, asNum(budget.soft_cap_usd)),
      hard_cap_usd: Math.max(0, asNum(budget.hard_cap_usd)),
      window_days: Math.max(1, Math.floor(asNum(budget.window_days))),
    };
    setBudget(b);
    saveAiBudget(b);
  }

  function wipeReceipts() {
    if (!confirm("Clear local AI receipts on this device? This does not affect provider billing.")) return;
    clearAiReceipts();
    setReceipts([]);
  }

  return (
    <Panel title="Local spend guardrails (non-custodial)">
      <p className="small">These settings live on this device. They are estimates and friction, not accounting. Provider dashboards are the source of truth.</p>

      <div className="grid2" style={{ gap: 10, marginTop: 10 }}>
        <div className="field">
          <label>Input rate ($ per 1M tokens)</label>
          <input value={String(budget.input_rate_per_1m)} onChange={(e) => setBudget({ ...budget, input_rate_per_1m: asNum(e.target.value) })} inputMode="decimal" />
        </div>
        <div className="field">
          <label>Output rate ($ per 1M tokens)</label>
          <input value={String(budget.output_rate_per_1m)} onChange={(e) => setBudget({ ...budget, output_rate_per_1m: asNum(e.target.value) })} inputMode="decimal" />
        </div>
        <div className="field">
          <label>Soft cap (warn/confirm) USD</label>
          <input value={String(budget.soft_cap_usd)} onChange={(e) => setBudget({ ...budget, soft_cap_usd: asNum(e.target.value) })} inputMode="decimal" />
        </div>
        <div className="field">
          <label>Hard cap (block) USD</label>
          <input value={String(budget.hard_cap_usd)} onChange={(e) => setBudget({ ...budget, hard_cap_usd: asNum(e.target.value) })} inputMode="decimal" />
        </div>
        <div className="field">
          <label>Window (days)</label>
          <input value={String(budget.window_days)} onChange={(e) => setBudget({ ...budget, window_days: asNum(e.target.value) as any })} inputMode="numeric" />
        </div>
        <div className="field" style={{ display: "flex", alignItems: "end" }}>
          <PrimaryButton onClick={persist}>Save guardrails</PrimaryButton>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10, justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div className="badge">
          <strong>Window spend (est.)</strong> <span>{usd(windowTotal)}</span>
        </div>
        <div className="small" style={{ opacity: 0.9 }}>
          Window: last {budget.window_days} day(s) • Soft: {usd(budget.soft_cap_usd)} • Hard: {usd(budget.hard_cap_usd)}
        </div>
      </div>

      {windowTotal >= budget.hard_cap_usd ? (
        <Callout title="Hard cap reached" tone="error">
          AI actions that cost money should be blocked until you raise the cap or clear receipts. Provider billing may still continue elsewhere.
        </Callout>
      ) : windowTotal >= budget.soft_cap_usd ? (
        <Callout title="Soft cap reached" tone="warn">
          AI actions will ask for confirmation before running.
        </Callout>
      ) : null}

      <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
        <a className="btn" href="https://openai.com/api/pricing/" target="_blank" rel="noreferrer">
          Pricing
        </a>
        <a className="btn" href="https://platform.openai.com/settings/organization/limits" target="_blank" rel="noreferrer">
          Provider budgets/limits
        </a>
        <a className="btn" href="https://platform.openai.com/docs/guides/rate-limits" target="_blank" rel="noreferrer">
          Rate limits
        </a>
        <a className="btn" href="/ai/setup">
          Guided setup
        </a>
        <button className="btn" onClick={wipeReceipts} type="button">
          Clear local receipts
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <strong>Recent receipts (local)</strong>
        <div className="small" style={{ marginTop: 6, opacity: 0.9 }}>
          Stored on this device only. Up to 200.
        </div>
        <div style={{ marginTop: 8, overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>When (UTC)</th>
                <th>Route</th>
                <th>Mode</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {receipts.slice(0, 25).map((r) => (
                <tr key={r.ts_utc + r.route}>
                  <td className="small">{r.ts_utc}</td>
                  <td className="small"><code>{r.route}</code></td>
                  <td className="small"><code>{r.mode}</code></td>
                  <td className="small"><code>{r.model || ""}</code></td>
                  <td className="small"><code>{typeof r.usage?.total_tokens === "number" ? r.usage.total_tokens : ""}</code></td>
                  <td className="small"><code>{typeof r.estimated_cost_usd === "number" ? usd(r.estimated_cost_usd) : ""}</code></td>
                </tr>
              ))}
              {receipts.length === 0 ? (
                <tr>
                  <td className="small" colSpan={6} style={{ opacity: 0.85 }}>
                    No receipts yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}
