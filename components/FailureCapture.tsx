"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "./Panel";
import { Callout } from "./Callout";
import { PrimaryButton, SecondaryButton } from "./Buttons";

import {
  createFailureRecordV1,
  listFailureRecordsV1,
  markFailureResolvedV1,
  setFailureAiDiagnosisV1,
  type FailureEnvironmentV1,
  type FailureRecordV1,
  type FailureStageV1,
} from "../lib/failure_records";
import { stableJsonText } from "../lib/stable_json";

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}

function shortSha(x: string | undefined): string {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.length <= 12 ? s : `${s.slice(0, 12)}…`;
}

export function FailureCapture(props: { projectId: string; kits?: string[] }) {
  const pid = String(props.projectId || "").trim() || "default";
  const kits = Array.isArray(props.kits) ? props.kits : [];

  const [stage, setStage] = useState<FailureStageV1>("build");
  const [environment, setEnvironment] = useState<FailureEnvironmentV1>("vercel");
  const [logsText, setLogsText] = useState<string>("");

  const [notice, setNotice] = useState<{ tone: "info" | "warn" | "danger" | "success"; title: string; details?: string[] } | null>(
    null
  );
  const [busy, setBusy] = useState<boolean>(false);

  const [recent, setRecent] = useState<FailureRecordV1[]>([]);
  const [selected, setSelected] = useState<FailureRecordV1 | null>(null);

  async function refresh() {
    const r = await listFailureRecordsV1(pid, 10);
    setRecent(r);
    if (!selected && r.length) setSelected(r[0]);
  }

  useEffect(() => {
    refresh().catch(() => {});
    const bump = () => refresh().catch(() => {});
    window.addEventListener("kindred_failure_records_changed", bump);
    return () => window.removeEventListener("kindred_failure_records_changed", bump);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  const offlineActions = useMemo(() => {
    if (!selected) return [];
    const acts = selected.diagnosis_offline?.suggested_actions || [];
    return Array.isArray(acts) ? acts : [];
  }, [selected]);

  async function onSave() {
    setNotice(null);
    const logs = String(logsText || "").trim();
    if (!logs) {
      setNotice({ tone: "warn", title: "Paste the full error log first." });
      return;
    }

    setBusy(true);
    try {
      const rec = await createFailureRecordV1({ project_id: pid, stage, environment, logs_text: logs });
      setLogsText("");
      setNotice({
        tone: "success",
        title: "Failure Record saved",
        details: [`id: ${rec.id}`, `logs_sha256: ${rec.logs_sha256}`],
      });
      setSelected(rec);
      await refresh();
    } catch (e: any) {
      setNotice({ tone: "danger", title: "Failed to save Failure Record", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  async function onPasteClipboard() {
    setNotice(null);
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setNotice({ tone: "warn", title: "Clipboard API not available", details: ["Paste manually into the textarea."] });
        return;
      }
      const txt = await navigator.clipboard.readText();
      const clean = String(txt || "").trim();
      if (!clean) {
        setNotice({ tone: "warn", title: "Clipboard is empty" });
        return;
      }
      setLogsText(clean);
      setNotice({ tone: "success", title: "Pasted from clipboard" });
    } catch (e: any) {
      setNotice({ tone: "danger", title: "Failed to read clipboard", details: [String(e?.message || e)] });
    }
  }

  function onDownloadSelected() {
    if (!selected) return;
    const fname = `failure_record_${selected.id}.json`;
    const txt = stableJsonText(selected);
    downloadText(fname, txt + "\n", "application/json");
  }

  async function onAskAi() {
    if (!selected) return;
    setNotice({ tone: "info", title: "Requesting AI diagnosis (proposal-only)…" });
    setBusy(true);
    try {
      const res = await fetch("/api/ai/debug-failure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project_id: pid,
          stage: selected.stage,
          environment: selected.environment,
          logs_text: selected.logs_text,
          context: {
            spec_locked_zip_sha256: selected.spec_locked_zip_sha256,
            repo_locked_zip_sha256: selected.repo_locked_zip_sha256,
            blueprint_pack_sha256: selected.blueprint_pack_sha256,
            kits,
          },
        }),
      });
      const j = await res.json();
      const txt = String(j?.text || "").trim();
      if (!txt) {
        setNotice({ tone: "warn", title: "AI returned no text", details: [String(j?.mode || ""), JSON.stringify(j || {})] });
        return;
      }
      await setFailureAiDiagnosisV1(pid, selected.id, txt);
      setNotice({ tone: "success", title: "AI diagnosis attached to Failure Record" });
      await refresh();
    } catch (e: any) {
      setNotice({ tone: "danger", title: "AI diagnosis failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  async function onResolve() {
    if (!selected) return;
    setBusy(true);
    try {
      await markFailureResolvedV1(pid, selected.id);
      setNotice({ tone: "success", title: "Marked resolved" });
      await refresh();
    } catch (e: any) {
      setNotice({ tone: "danger", title: "Failed to mark resolved", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Deploy & Debug (no lock-in)">
      <p className="small">
        Deploy anywhere using the locked Repo Pack ZIP. If anything fails, paste the log below to create a Failure Record (offline-safe).
        You can optionally ask AI for suggestions, but AI never silently edits: it only proposes.
      </p>

      {notice ? (
        <Callout title={notice.title} tone={notice.tone}>
          {notice.details && notice.details.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{notice.details.join("\n")}</pre> : null}
        </Callout>
      ) : null}

      <div className="grid2">
        <div>
          <div className="field">
            <label>Stage</label>
            <select value={stage} onChange={(e) => setStage(e.target.value as FailureStageV1)}>
              <option value="build">Build</option>
              <option value="deploy">Deploy</option>
              <option value="runtime">Runtime</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="field">
            <label>Environment</label>
            <select value={environment} onChange={(e) => setEnvironment(e.target.value as FailureEnvironmentV1)}>
              <option value="vercel">Vercel</option>
              <option value="codespaces">Codespaces</option>
              <option value="local">Local</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="field">
            <label>Paste error log</label>
            <textarea
              rows={10}
              value={logsText}
              onChange={(e) => setLogsText(e.target.value)}
              placeholder="Paste the full error log here (build output, deploy logs, or runtime stack trace)."
            />
          </div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <PrimaryButton onClick={onSave} disabled={busy}>
              Save Failure Record
            </PrimaryButton>
            <SecondaryButton onClick={onPasteClipboard} disabled={busy}>
              Paste from clipboard
            </SecondaryButton>
            <SecondaryButton href="/docs/deploy">Deploy docs</SecondaryButton>
            <SecondaryButton href="/director/failures">View all failures</SecondaryButton>
          </div>
        </div>

        <div>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <strong>Recent Failure Records</strong>
            <span className="small">{recent.length ? `${recent.length} shown` : "none yet"}</span>
          </div>

          {recent.length ? (
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {recent.map((r) => (
                <button
                  key={r.id}
                  className="card"
                  style={{
                    textAlign: "left",
                    padding: 10,
                    borderRadius: 14,
                    border: "1px solid var(--border)",
                    background: selected?.id === r.id ? "var(--card2)" : "var(--card)",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelected(r)}
                >
                  <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.status === "resolved" ? "✅" : "⚠️"} {r.stage.toUpperCase()} / {r.environment}</div>
                      <div className="small" style={{ marginTop: 4 }}>{r.summary}</div>
                    </div>
                    <div className="small" style={{ whiteSpace: "nowrap" }}>{r.created_at_utc.slice(0, 10)}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="small" style={{ marginTop: 10 }}>
              No failures recorded yet. If a deploy/build fails, paste the log on the left and save it as an artefact.
            </div>
          )}

          {selected ? (
            <div style={{ marginTop: 14 }}>
              <div className="hr" />
              <div className="small">
                <div><strong>Failure id:</strong> {selected.id}</div>
                <div><strong>logs_sha256:</strong> {shortSha(selected.logs_sha256)}</div>
                <div><strong>spec_locked_zip:</strong> {shortSha(selected.spec_locked_zip_sha256)}</div>
                <div><strong>repo_locked_zip:</strong> {shortSha(selected.repo_locked_zip_sha256)}</div>
                <div><strong>blueprint_pack:</strong> {shortSha(selected.blueprint_pack_sha256)}</div>
              </div>

              <div style={{ marginTop: 10 }}>
                <strong>Deterministic diagnosis (offline)</strong>
                {offlineActions.length ? (
                  <ul style={{ marginTop: 8 }}>
                    {offlineActions.slice(0, 10).map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="small" style={{ marginTop: 6 }}>
                    No deterministic rules matched yet. Use AI suggestions (optional) or add a rule as a Pattern later.
                  </div>
                )}
              </div>

              <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <PrimaryButton onClick={onAskAi} disabled={busy}>
                  Ask AI for suggestions
                </PrimaryButton>
                <SecondaryButton onClick={onDownloadSelected} disabled={busy}>
                  Download JSON
                </SecondaryButton>
                <SecondaryButton onClick={onResolve} disabled={busy || selected.status === "resolved"}>
                  Mark resolved
                </SecondaryButton>
              </div>

              {selected.diagnosis_ai_text ? (
                <div style={{ marginTop: 12 }}>
                  <strong>AI suggestions (proposal-only)</strong>
                  <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{selected.diagnosis_ai_text}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
