"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { DangerButton, SecondaryButton } from "../../components/Buttons";
import { getCurrentProjectId } from "../../lib/state";
import { stableJsonText } from "../../lib/stable_json";
import { APP_VERSION } from "../../lib/version";
import { allVerifyPlans } from "../../lib/verify_plans";
import { appendEvidenceCard } from "../../lib/evidence_ledger";
import {
  addVerifyReport,
  computeVerifyOverallFromSteps,
  deleteVerifyReport,
  getLatestVerifyReport,
  loadVerifyStore,
  normalizeVerifyReport,
  type VerifyPlan,
  type VerifyReport,
  type VerifyStoreV1,
  wrapRawTextAsVerifyReport,
} from "../../lib/verify";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

function fmtKind(overall: "pass" | "warn" | "fail") {
  return overall === "pass" ? "success" : overall === "warn" ? "warn" : "error";
}

export default function VerifyPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("manual_v1");
  const [store, setStore] = useState<VerifyStoreV1>({ schema: "kindred.verify_store.v1", reports: [] });
  const [status, setStatus] = useState<string>("");

  const plans = useMemo(() => allVerifyPlans(), []);

  const selectedPlan: VerifyPlan = useMemo(() => {
    return plans.find((p) => p.plan_id === selectedPlanId) || plans[0];
  }, [plans, selectedPlanId]);

  useEffect(() => {
    try {
      const pid = getCurrentProjectId();
      setProjectId(pid);
      setStore(loadVerifyStore(pid));
    } catch {
      setProjectId("p_unknown");
      setStore({ schema: "kindred.verify_store.v1", reports: [] });
    }
  }, []);

  function refresh() {
    const pid = projectId || "p_unknown";
    setStore(loadVerifyStore(pid));
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard.");
    } catch {
      setStatus("Copy failed (clipboard not available). Select and copy manually.");
    }
  }

  function downloadPlanJson() {
    if (!selectedPlan) return;
    downloadText(`verify_plan__${selectedPlan.plan_id}.json`, stableJsonText(selectedPlan, 2));
  }

  function downloadReportTemplate() {
    const now = new Date().toISOString();
    const steps: VerifyReport["steps"] = selectedPlan.steps.map((s) => ({
      id: s.id,
      title: s.title,
      required: s.required,
      status: "skip",
      commands: s.commands,
      exit_code: undefined,
      stdout_excerpt: "",
      stderr_excerpt: "",
    }));

    const report: VerifyReport = {
      schema: "kindred.verify_report.v1",
      captured_at_utc: now,
      plan_id: selectedPlan.plan_id,
      plan_version: selectedPlan.plan_version,
      subject: { label: "", notes: "Fill in and upload to /verify." },
      overall: computeVerifyOverallFromSteps(steps),
      steps,
      notes: [],
      provenance: {
        tool: "kindred_report_template",
        tool_version: APP_VERSION,
        app_version: APP_VERSION,
      },
    };

    downloadText(`verify_report_template__${selectedPlan.plan_id}__${projectId || "p_unknown"}.json`, stableJsonText(report, 2));
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    const pid = projectId || "p_unknown";
    setStatus("Reading report...");

    let text = "";
    try {
      text = await file.text();
    } catch {
      setStatus("Failed to read file.");
      return;
    }

    // Try JSON first.
    try {
      const parsed = JSON.parse(text);
      const nr = normalizeVerifyReport(parsed);
      if (nr.ok && nr.report) {
        const next = addVerifyReport(pid, nr.report);
        setStore(next);
        try {
          appendEvidenceCard({
            project_id: pid,
            kind: "verify_report_added",
            title: "Verify report stored",
            summary: `Plan ${nr.report.plan_id} (${nr.report.overall}) at ${nr.report.captured_at_utc}`,
            data: { plan_id: nr.report.plan_id, overall: nr.report.overall, captured_at_utc: nr.report.captured_at_utc },
          });
        } catch {
          // ignore
        }
        setStatus("Verify report stored locally.");
        return;
      }

      // JSON but not a valid verify report; wrap as raw.
      const wrapped = wrapRawTextAsVerifyReport(selectedPlan, text, { subject_label: `upload:${file.name}` });
      const next = addVerifyReport(pid, wrapped);
      setStore(next);
      try {
        appendEvidenceCard({
          project_id: pid,
          kind: "verify_report_added",
          title: "Verify report stored",
          summary: `Plan ${wrapped.plan_id} (${wrapped.overall}) at ${wrapped.captured_at_utc}`,
          data: { plan_id: wrapped.plan_id, overall: wrapped.overall, captured_at_utc: wrapped.captured_at_utc, raw: true },
        });
      } catch {
        // ignore
      }
      setStatus(`Uploaded JSON was not a valid Verify Report; stored as raw text. Issues: ${(nr.issues || []).join("; ")}`);
      return;
    } catch {
      // Not JSON; wrap as raw.
      const wrapped = wrapRawTextAsVerifyReport(selectedPlan, text, { subject_label: `upload:${file.name}` });
      const next = addVerifyReport(pid, wrapped);
      setStore(next);
      try {
        appendEvidenceCard({
          project_id: pid,
          kind: "verify_report_added",
          title: "Verify report stored",
          summary: `Plan ${wrapped.plan_id} (${wrapped.overall}) at ${wrapped.captured_at_utc}`,
          data: { plan_id: wrapped.plan_id, overall: wrapped.overall, captured_at_utc: wrapped.captured_at_utc, raw: true },
        });
      } catch {
        // ignore
      }
      setStatus("Uploaded text stored as a raw Verify Report (step statuses unconfirmed).");
      return;
    }
  }

  function downloadReport(r: VerifyReport) {
    downloadText(`verify_report__${r.plan_id}__${projectId || "p_unknown"}__${r.captured_at_utc}.json`, stableJsonText(r, 2));
  }

  function removeReport(r: VerifyReport) {
    const pid = projectId || "p_unknown";
    const next = deleteVerifyReport(pid, r.captured_at_utc);
    setStore(next);
    try {
      appendEvidenceCard({
        project_id: pid,
        kind: "verify_report_removed",
        title: "Verify report removed",
        summary: `Removed plan ${r.plan_id} at ${r.captured_at_utc}`,
        data: { plan_id: r.plan_id, captured_at_utc: r.captured_at_utc },
      });
    } catch {
      // ignore
    }
    setStatus("Verify report removed.");
  }

  const latest = useMemo(() => {
    if (!projectId) return null;
    return getLatestVerifyReport(projectId);
  }, [projectId, store]);

  return (
    <div className="container">
      <div className="hero">
        <h1>Verify</h1>
        <p>Local-first verification: copy commands, run locally, upload a report. No server execution.</p>
      </div>

      <div className="grid">
        <Panel title="Plan">
          <p className="small" style={{ marginTop: 0 }}>
            Project: <code>{projectId || "p_unknown"}</code>
          </p>

          <label className="small">
            Select plan
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              style={{ width: "100%", marginTop: 6 }}
            >
              {plans.map((p) => (
                <option key={p.plan_id} value={p.plan_id}>
                  {p.title} ({p.plan_id})
                </option>
              ))}
            </select>
          </label>

          <div style={{ marginTop: 12 }}>
            <Callout kind="info" title={selectedPlan.title}>
              <p className="small" style={{ marginTop: 0 }}>
                {selectedPlan.description || ""}
              </p>
              <p className="small" style={{ marginBottom: 0 }}>
                Plan: <code>{selectedPlan.plan_id}</code> • Version: <code>{selectedPlan.plan_version}</code>
              </p>
            </Callout>
          </div>

          <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <SecondaryButton onClick={() => downloadPlanJson()}>Download plan JSON</SecondaryButton>
            <SecondaryButton onClick={() => downloadReportTemplate()}>Download report template</SecondaryButton>
            <a className="btn" href="/docs/verify">Docs</a>
          </div>

          <div style={{ marginTop: 12 }}>
            <h3 style={{ margin: "0 0 8px 0" }}>Steps</h3>
            {selectedPlan.steps.map((s) => (
              <div key={s.id} style={{ marginBottom: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong>
                    {s.title} {s.required ? "" : "(optional)"}
                  </strong>
                  <span className="small">id: <code>{s.id}</code></span>
                </div>

                <div style={{ marginTop: 8 }}>
                  {s.commands.map((c, idx) => (
                    <div key={idx} className="row" style={{ justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c}</code>
                      <SecondaryButton onClick={() => copy(c)}>Copy</SecondaryButton>
                    </div>
                  ))}
                </div>

                {s.expect && s.expect.length > 0 ? (
                  <div className="small" style={{ marginTop: 6 }}>
                    Expect:
                    <ul style={{ margin: "6px 0 0 18px" }}>
                      {s.expect.map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Upload report">
          <p className="small" style={{ marginTop: 0 }}>
            Upload a JSON Verify Report (<code>kindred.verify_report.v1</code>). Text uploads are accepted, but will be stored as an unconfirmed report.
          </p>

          <input
            type="file"
            accept=".json,.txt,.log"
            onChange={(e) => {
              const f = e.target.files && e.target.files.length > 0 ? e.target.files[0] : null;
              onUpload(f).catch(() => setStatus("Upload failed."));
              e.currentTarget.value = "";
            }}
          />

          <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <SecondaryButton onClick={() => refresh()}>Refresh</SecondaryButton>
            <a className="btn" href="/release-checklist">Release checklist</a>
          </div>

          {status ? <p className="small">{status}</p> : null}

          <div style={{ marginTop: 12 }}>
            <h3 style={{ margin: "0 0 8px 0" }}>Latest</h3>
            {latest ? (
              <Callout kind={fmtKind(latest.overall)} title={`Latest: ${latest.overall.toUpperCase()}`}>
                <p className="small" style={{ marginTop: 0 }}>
                  Captured: <code>{latest.captured_at_utc}</code>
                </p>
                <p className="small" style={{ marginBottom: 0 }}>
                  Plan: <code>{latest.plan_id}</code> • Steps: <code>{latest.steps.length}</code>
                </p>
              </Callout>
            ) : (
              <p className="small">No verify reports stored for this project yet.</p>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <h3 style={{ margin: "0 0 8px 0" }}>All reports</h3>
            {store.reports.length === 0 ? (
              <p className="small">None yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {store.reports.map((r) => (
                  <Callout key={r.captured_at_utc} kind={fmtKind(r.overall)} title={`${r.overall.toUpperCase()} • ${r.captured_at_utc}`}
                  >
                    <p className="small" style={{ marginTop: 0 }}>
                      Plan: <code>{r.plan_id}</code> • Version: <code>{r.plan_version}</code>
                    </p>
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      <SecondaryButton onClick={() => downloadReport(r)}>Download</SecondaryButton>
                      <DangerButton onClick={() => removeReport(r)}>Delete</DangerButton>
                    </div>
                  </Callout>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
