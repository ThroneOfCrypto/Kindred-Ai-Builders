"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { DangerButton, SecondaryButton } from "../../components/Buttons";
import { getCurrentProjectId } from "../../lib/state";
import { stableJsonText } from "../../lib/stable_json";
import { appendEvidenceCard } from "../../lib/evidence_ledger";
import { addFeedbackReport, createFeedbackReport, deleteFeedbackReport, loadFeedbackStore, type FeedbackReportV1, type FeedbackStoreV1 } from "../../lib/feedback";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

type RuntimeMeta = {
  vercel?: {
    env?: string;
    url?: string;
    region?: string;
    git_commit_sha?: string;
    git_commit_ref?: string;
  };
  node?: { version?: string };
  time_utc?: string;
};

export default function FeedbackPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [store, setStore] = useState<FeedbackStoreV1>({ schema: "kindred.feedback_store.v1", project_id: "default", reports: [] });
  const [status, setStatus] = useState<string>("");
  const [meta, setMeta] = useState<RuntimeMeta>({});

  // Form
  const [title, setTitle] = useState<string>("");
  const [expected, setExpected] = useState<string>("");
  const [actual, setActual] = useState<string>("");
  const [steps, setSteps] = useState<string>("");
  const [severity, setSeverity] = useState<FeedbackReportV1["report"]["severity"]>("medium");
  const [area, setArea] = useState<FeedbackReportV1["report"]["area"]>("ux");
  const [vercelLogUrl, setVercelLogUrl] = useState<string>("");

  useEffect(() => {
    try {
      const pid = getCurrentProjectId();
      setProjectId(pid);
      setStore(loadFeedbackStore(pid));
    } catch {
      setProjectId("p_unknown");
      setStore(loadFeedbackStore("p_unknown"));
    }
  }, []);

  useEffect(() => {
    // Optional: fetch server-side deployment metadata when deployed.
    fetch("/api/runtime-meta", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setMeta(j as RuntimeMeta))
      .catch(() => setMeta({}));
  }, []);

  const deploymentUrl = useMemo(() => {
    const u = meta?.vercel?.url;
    if (!u) return "";
    // Vercel may provide URL without protocol
    return u.startsWith("http") ? u : `https://${u}`;
  }, [meta]);

  function refresh() {
    const pid = projectId || "default";
    setStore(loadFeedbackStore(pid));
  }

  function makeReport(): FeedbackReportV1 {
    const pid = projectId || "default";
    return createFeedbackReport({
      project_id: pid,
      title: title.trim() || "(untitled)",
      expected: expected.trim(),
      actual: actual.trim(),
      steps: steps.trim(),
      severity,
      area,
      subject_label: "post_deploy_feedback",
      subject_meta: {
        deployment_url: deploymentUrl || undefined,
        environment: meta?.vercel?.env,
        git_commit_sha: meta?.vercel?.git_commit_sha,
        git_commit_ref: meta?.vercel?.git_commit_ref,
      },
      evidence: {
        vercel_log_share_url: vercelLogUrl.trim() || undefined,
      },
    });
  }

  function storeLocally() {
    const pid = projectId || "default";
    const report = makeReport();
    const next = addFeedbackReport(pid, report);
    setStore(next);
    try {
      appendEvidenceCard({
        project_id: pid,
        kind: "ux_walkthrough_notes",
        title: "Feedback report stored",
        summary: `${report.report.area}/${report.report.severity}: ${report.report.title}`,
        data: { captured_at_utc: report.captured_at_utc, deployment_url: report.subject.deployment_url },
      });
    } catch {
      // ignore
    }
    setStatus("Saved locally.");
  }

  function downloadReport() {
    const report = makeReport();
    const pid = projectId || "default";
    const fn = `feedback_report__${pid}__${report.captured_at_utc}.json`;
    downloadText(fn, stableJsonText(report, 2));
    setStatus("Downloaded.");
  }

  function downloadStored(r: FeedbackReportV1) {
    const pid = projectId || "default";
    const fn = `feedback_report__${pid}__${r.captured_at_utc}.json`;
    downloadText(fn, stableJsonText(r, 2));
  }

  function removeStored(r: FeedbackReportV1) {
    const pid = projectId || "default";
    const next = deleteFeedbackReport(pid, r.captured_at_utc);
    setStore(next);
    setStatus("Removed.");
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Feedback</h1>
        <p>Beginner-friendly post-deploy bug/UX reporting. Local-first. Downloadable proof.</p>
      </div>

      <Callout kind="warn">
        <strong>Best practice:</strong> use Preview Deployments for feedback and iteration. If you are on Vercel, the Toolbar (Comments, a11y audit, layout shift inspector) is usually enabled for Preview deployments.
      </Callout>

      <div className="grid">
        <Panel title="Report">
          <div className="stack">
            <label className="field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What happened?" />
            </label>

            <label className="field">
              <span>Area</span>
              <select value={area} onChange={(e) => setArea(e.target.value as any)}>
                <option value="ux">UX</option>
                <option value="copy">Copy</option>
                <option value="flow">Flow</option>
                <option value="bug">Bug</option>
                <option value="performance">Performance</option>
                <option value="accessibility">Accessibility</option>
                <option value="security">Security</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="field">
              <span>Severity</span>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as any)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <label className="field">
              <span>Expected</span>
              <textarea value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="What did you think would happen?" rows={3} />
            </label>

            <label className="field">
              <span>Actual</span>
              <textarea value={actual} onChange={(e) => setActual(e.target.value)} placeholder="What actually happened?" rows={3} />
            </label>

            <label className="field">
              <span>Steps to reproduce</span>
              <textarea value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="1) ...\n2) ...\n3) ..." rows={4} />
            </label>

            <label className="field">
              <span>Vercel runtime log share URL (optional)</span>
              <input value={vercelLogUrl} onChange={(e) => setVercelLogUrl(e.target.value)} placeholder="Paste a shared logs URL if you have one" />
            </label>

            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <SecondaryButton onClick={storeLocally}>Save locally</SecondaryButton>
              <SecondaryButton onClick={downloadReport}>Download report (JSON)</SecondaryButton>
              <button type="button" className="linklike" onClick={refresh}>
                Refresh
              </button>
            </div>

            {status ? <p className="small">{status}</p> : null}
          </div>
        </Panel>

        <Panel title="Deployment context (best-effort)">
          <p className="small" style={{ marginTop: 0 }}>
            This reads <code>/api/runtime-meta</code> (server) when available.
          </p>
          <ul>
            <li>
              Environment: <code>{meta?.vercel?.env || "(unknown)"}</code>
            </li>
            <li>
              Deployment URL: <code>{deploymentUrl || "(unknown)"}</code>
            </li>
            <li>
              Commit: <code>{meta?.vercel?.git_commit_sha || "(unknown)"}</code>
            </li>
            <li>
              Branch/ref: <code>{meta?.vercel?.git_commit_ref || "(unknown)"}</code>
            </li>
            <li>
              Region: <code>{meta?.vercel?.region || "(unknown)"}</code>
            </li>
          </ul>
        </Panel>

        <Panel title="Stored reports (local)">
          {store.reports.length ? (
            <ul>
              {store.reports.slice(0, 20).map((r) => (
                <li key={r.captured_at_utc} style={{ marginBottom: 12 }}>
                  <div>
                    <strong>{r.report.title}</strong> <span className="badge">{r.report.area}</span> <span className="badge">{r.report.severity}</span>
                  </div>
                  <div className="small">
                    {r.captured_at_utc} {r.subject.environment ? `(${r.subject.environment})` : ""}
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <SecondaryButton onClick={() => downloadStored(r)}>Download</SecondaryButton>
                    <DangerButton onClick={() => removeStored(r)}>Remove</DangerButton>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small">No stored reports yet.</p>
          )}
        </Panel>

        <Panel title="FEARR loop">
          <p className="small" style={{ marginTop: 0 }}>
            This page implements <strong>F</strong>eedback and <strong>E</strong>vidence. The rest is discipline.
          </p>
          <p className="small">
            Read the repo doc: <code>docs/FEEDBACK_LOOP_FEARR.md</code>.
          </p>
          <a className="button" href="/docs/feedback-loop">
            Open docs
          </a>
        </Panel>
      </div>
    </div>
  );
}
