"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Panel } from "./Panel";
import { Callout } from "./Callout";
import { SecondaryButton, PrimaryButton, DangerButton } from "./Buttons";

type Step = {
  name: string;
  status: "pass" | "fail";
  exit_code: number;
  log_file?: string;
};

type ProofStatus = {
  schema?: string;
  generated_at_utc?: string;
  last_run_utc_ts?: string;
  overall?: "pass" | "fail" | "unknown";
  failed_step?: string;
  steps?: Step[];
  executor?: Record<string, any>;
};

type LocalRun = {
  enabled: boolean;
  run: null | {
    run_id: string;
    started_at_utc: string;
    finished_at_utc?: string;
    status: "running" | "done";
    exit_code?: number;
    signal?: string;
    log_file: string;
    command: string;
  };
  hint?: string;
};

function pillClass(overall: any): string {
  const v = String(overall || "unknown").toLowerCase();
  if (v === "pass") return "pill--success";
  if (v === "fail") return "pill--error";
  return "pill--warn";
}

export function ProofStatusPanel() {
  const [data, setData] = useState<ProofStatus | null>(null);
  const [error, setError] = useState<string>("");
  const [local, setLocal] = useState<LocalRun | null>(null);
  const [localError, setLocalError] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  async function load() {
    setError("");
    try {
      const res = await fetch(`/api/evidence/status?t=${Date.now()}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setData(null);
        setError(String(j?.hint || j?.error || `HTTP ${res.status}`));
        return;
      }
      setData(j as ProofStatus);
    } catch (e: any) {
      setData(null);
      setError(String(e?.message || e || "Failed to load proof status"));
    }
  }

  async function loadLocal() {
    setLocalError("");
    try {
      const res = await fetch(`/api/proof/status?t=${Date.now()}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setLocal(null);
        setLocalError(String(j?.hint || j?.error || `HTTP ${res.status}`));
        return;
      }
      setLocal(j as LocalRun);
    } catch (e: any) {
      setLocal(null);
      setLocalError(String(e?.message || e || "Failed to load local executor status"));
    }
  }

  useEffect(() => {
    load();
    loadLocal();
  }, []);

  // While local proof is running, poll both proof status and local run status.
  useEffect(() => {
    if (!local?.run || local.run.status !== "running") return;
    const t = setInterval(() => {
      load();
      loadLocal();
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local?.run?.status, local?.run?.run_id]);

  const overall = useMemo(() => String(data?.overall || "unknown").toUpperCase(), [data?.overall]);

  async function runLocalProof() {
    setBusy(true);
    try {
      const res = await fetch(`/api/proof/run`, { method: "POST", cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setLocalError(String(j?.hint || j?.error || `HTTP ${res.status}`));
        return;
      }
      await loadLocal();
    } finally {
      setBusy(false);
    }
  }

  async function stopLocalProof() {
    setBusy(true);
    try {
      const res = await fetch(`/api/proof/stop`, { method: "POST", cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setLocalError(String(j?.hint || j?.error || `HTTP ${res.status}`));
        return;
      }
      await loadLocal();
      await load();
    } finally {
      setBusy(false);
    }
  }

  const localEnabled = Boolean(local?.enabled);
  const localRunning = Boolean(local?.run && local.run.status === "running");

  return (
    <Panel title="Proof Lane status" subtitle="Truth surface for strict gates. No evidence = no claim.">
      {error ? (
        <Callout title="Proof status not found" tone="warn">
          <div className="small">{error}</div>
        </Callout>
      ) : null}

      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <SecondaryButton onClick={() => { load(); loadLocal(); }}>Reload</SecondaryButton>

        <span className={["pill", pillClass(data?.overall)].join(" ")}>{overall}</span>
        <span className="small" style={{ opacity: 0.9 }}>
          phase: <code>{(data as any)?.lifecycle?.phase || "(unknown)"}</code> · run: <code>{data?.last_run_utc_ts || "(none)"}</code> · generated: <code>{data?.generated_at_utc || "(none)"}</code>
        </span>
      </div>

      {data?.failed_step ? (
        <div className="small" style={{ marginTop: 10 }}>
          failed_step: <code>{data.failed_step}</code>
        </div>
      ) : null}

      {Array.isArray(data?.steps) && data!.steps!.length ? (
        <div style={{ marginTop: 12 }} className="codeBlock">
          <div className="small" style={{ padding: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Steps</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {data!.steps!.map((s) => (
                <li key={s.name} style={{ marginBottom: 6 }}>
                  <code>{s.name}</code>: <code>{s.status.toUpperCase()}</code> (exit {s.exit_code}){" "}
                  {s.log_file ? (
                    <a
                      className="small"
                      href={`/api/evidence/log?f=${encodeURIComponent(String(s.log_file).split("/").pop() || "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      view log
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="hr" style={{ marginTop: 14 }} />

      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Local executor (dev-only)</div>
        {localError ? <div className="small" style={{ marginBottom: 8 }}>{localError}</div> : null}
        {local?.hint ? <div className="small" style={{ marginBottom: 8, opacity: 0.9 }}>{local.hint}</div> : null}

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <PrimaryButton disabled={!localEnabled || busy || localRunning} onClick={runLocalProof}>
            Run Proof (Hard)
          </PrimaryButton>
          <DangerButton disabled={!localEnabled || busy || !localRunning} onClick={stopLocalProof}>
            Stop
          </DangerButton>
          {local?.run?.log_file ? (
            <a
              className="btn"
              href={`/api/evidence/log?f=${encodeURIComponent(String(local.run.log_file).split("/").pop() || "")}`}
              target="_blank"
              rel="noreferrer"
            >
              View local log
            </a>
          ) : null}
        </div>

        {local?.run ? (
          <div className="small" style={{ marginTop: 10 }}>
            run_id: <code>{local.run.run_id}</code> · status: <code>{local.run.status}</code> · cmd: <code>{local.run.command}</code>
          </div>
        ) : null}

        {!localEnabled ? (
          <Callout title="Why this is disabled" tone="info">
            <div className="small">
              Proof execution is a <b>local / CI</b> concern. In production (including Vercel), the filesystem is not writable and long-running
              processes are not reliable. To enable this button locally: set <code>KINDRED_ALLOW_SERVER_EXEC=1</code> and restart the dev server.
            </div>
          </Callout>
        ) : null}
      </div>

      <div className="small" style={{ opacity: 0.9, marginTop: 10 }}>
        Canonical command: <code>npm run proof:gate</code>. This UI runner is a local convenience wrapper that still writes evidence.
      </div>
    </Panel>
  );
}
