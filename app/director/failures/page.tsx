"use client";

import React, { useEffect, useState } from "react";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { PrimaryButton, SecondaryButton } from "../../../components/Buttons";

import { getCurrentProjectId } from "../../../lib/state";
import { listFailureRecordsV1, markFailureResolvedV1, type FailureRecordV1 } from "../../../lib/failure_records";

function shortSha(x: string | undefined): string {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.length <= 12 ? s : `${s.slice(0, 12)}…`;
}

export default function DirectorFailuresPage() {
  const [projectId, setProjectId] = useState<string>(() => {
    try {
      return getCurrentProjectId();
    } catch {
      return "";
    }
  });
  const pid = projectId || "default";

  useEffect(() => {
    const onChange = () => {
      try {
        setProjectId(getCurrentProjectId());
      } catch {
        setProjectId("");
      }
    };
    window.addEventListener("kindred_project_changed", onChange);
    return () => window.removeEventListener("kindred_project_changed", onChange);
  }, []);

  const [items, setItems] = useState<FailureRecordV1[]>([]);
  const [notice, setNotice] = useState<{ tone: "info" | "warn" | "danger" | "success"; title: string; details?: string[] } | null>(
    null
  );
  const [busy, setBusy] = useState<boolean>(false);

  async function refresh() {
    const r = await listFailureRecordsV1(pid, 50);
    setItems(r);
  }

  useEffect(() => {
    refresh().catch(() => {});
    const bump = () => refresh().catch(() => {});
    window.addEventListener("kindred_failure_records_changed", bump);
    return () => window.removeEventListener("kindred_failure_records_changed", bump);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  async function onResolve(id: string) {
    setBusy(true);
    setNotice(null);
    try {
      await markFailureResolvedV1(pid, id);
      setNotice({ tone: "success", title: "Marked resolved" });
      await refresh();
    } catch (e: any) {
      setNotice({ tone: "danger", title: "Failed to mark resolved", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Failures</h1>
        <p>
          Failure Records are offline-first artefacts: logs + hashes + deterministic diagnosis + optional AI suggestions (proposal-only).
          Beginners can capture failures directly inside <strong>Director → Ship</strong>.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <SecondaryButton href="/director/ship">Back to Ship</SecondaryButton>
          <SecondaryButton href="/docs/deploy">Deploy docs</SecondaryButton>
        </div>
      </div>

      {notice ? (
        <Callout title={notice.title} tone={notice.tone}>
          {notice.details && notice.details.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{notice.details.join("\n")}</pre> : null}
        </Callout>
      ) : null}

      <Panel title={`Failure Records (${items.length})`}>
        {items.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((r) => (
              <details key={r.id} className="card" style={{ padding: 12, borderRadius: 16 }}>
                <summary style={{ cursor: "pointer" }}>
                  <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <strong>{r.status === "resolved" ? "✅" : "⚠️"} {r.stage.toUpperCase()} / {r.environment}</strong>
                      <div className="small" style={{ marginTop: 4 }}>{r.summary}</div>
                    </div>
                    <div className="small" style={{ whiteSpace: "nowrap" }}>{r.created_at_utc}</div>
                  </div>
                </summary>

                <div className="hr" />

                <div className="small">
                  <div><strong>id:</strong> {r.id}</div>
                  <div><strong>logs_sha256:</strong> {r.logs_sha256}</div>
                  <div><strong>spec_locked_zip:</strong> {shortSha(r.spec_locked_zip_sha256)}</div>
                  <div><strong>repo_locked_zip:</strong> {shortSha(r.repo_locked_zip_sha256)}</div>
                  <div><strong>blueprint_pack:</strong> {shortSha(r.blueprint_pack_sha256)}</div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <strong>Deterministic diagnosis (offline)</strong>
                  {r.diagnosis_offline?.suggested_actions?.length ? (
                    <ul style={{ marginTop: 8 }}>
                      {r.diagnosis_offline.suggested_actions.slice(0, 12).map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="small" style={{ marginTop: 8 }}>No deterministic rules matched yet.</div>
                  )}
                </div>

                {r.diagnosis_ai_text ? (
                  <div style={{ marginTop: 12 }}>
                    <strong>AI suggestions (proposal-only)</strong>
                    <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{r.diagnosis_ai_text}</pre>
                  </div>
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <strong>Logs</strong>
                  <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, maxHeight: 260, overflow: "auto" }}>{r.logs_text}</pre>
                </div>

                <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <PrimaryButton onClick={() => onResolve(r.id)} disabled={busy || r.status === "resolved"}>
                    Mark resolved
                  </PrimaryButton>
                  <SecondaryButton
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(r.logs_text);
                        setNotice({ tone: "success", title: "Copied logs to clipboard" });
                      } catch {
                        setNotice({ tone: "warn", title: "Clipboard copy failed" });
                      }
                    }}
                  >
                    Copy logs
                  </SecondaryButton>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="small">No failures yet. If a deploy/build fails, capture the log in Director → Ship.</div>
        )}
      </Panel>
    </div>
  );
}
