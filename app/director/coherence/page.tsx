"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";

import { getCurrentProjectId, loadProjectStateById, saveProjectStateById } from "../../../lib/state";
import type { ProjectState } from "../../../lib/types";
import { buildCoherenceReport, coherenceReportJson, coherenceReportSha256 } from "../../../lib/coherence_report";

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DirectorCoherencePage() {
  const [projectId, setProjectId] = useState<string>("");
  const [state, setState] = useState<ProjectState | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const pid = getCurrentProjectId();
    setProjectId(pid);
    const st = loadProjectStateById(pid);
    setState(st);

    const on = () => {
      const next = loadProjectStateById(pid);
      setState(next);
    };
    window.addEventListener("kindred_state_changed", on as any);
    return () => window.removeEventListener("kindred_state_changed", on as any);
  }, []);

  const report = useMemo(() => (state ? buildCoherenceReport(state) : null), [state]);
  const jsonText = useMemo(() => (state ? coherenceReportJson(state) : ""), [state]);
  const sha = useMemo(() => (state ? coherenceReportSha256(state) : ""), [state]);

  function persistDirectorMeta(next: ProjectState, patch: any) {
    const merged: any = {
      ...next,
      director: {
        ...(next as any).director,
        schema: "kindred.director_state.v1",
        ...patch,
      },
    };
    saveProjectStateById(projectId, merged);
    setState(merged);
    try {
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  }

  function onDownload() {
    if (!state) return;
    const safe = (state.project.name || "project").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
    const filename = `${safe}__coherence_report.v1.json`;
    downloadTextFile(filename, jsonText);
    persistDirectorMeta(state, {
      last_coherence_report_sha256: sha,
      last_coherence_report_generated_at_utc: new Date().toISOString(),
    });
    setStatus(`Downloaded coherence report (sha256 ${sha.slice(0, 12)}…)`);
  }

  if (!report) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
        <h1>Coherence check</h1>
        <p>Loading…</p>
      </main>
    );
  }

  const triKind = report.tri === "fail" ? "error" : report.tri === "warn" ? "warn" : "success";

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1>Coherence check</h1>
      <p>CTO-style coherence signals derived from your governed intent (deterministic, offline-first).</p>

      {status ? <Callout kind="success">{status}</Callout> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <button className="btn" onClick={onDownload}>Download coherence report</button>
      </div>

      <Callout kind={triKind as any}>
        <strong>{report.tri.toUpperCase()}</strong> • score {report.score_0_100}/100 • findings {report.findings.length}
      </Callout>

      <Panel title="Findings">
        {report.findings.length === 0 ? (
          <p>(No issues detected.)</p>
        ) : (
          <ul>
            {report.findings.map((f) => (
              <li key={f.id} style={{ marginBottom: 10 }}>
                <div><strong>[{f.severity.toUpperCase()}]</strong> {f.title}</div>
                <div style={{ opacity: 0.9 }}>{f.detail}</div>
                <div style={{ opacity: 0.7, marginTop: 4 }}><em>{f.why_it_matters}</em></div>
                {f.suggested_next.length ? (
                  <div style={{ marginTop: 6 }}>
                    {f.suggested_next.map((a, idx) => (
                      <a key={idx} className="btn" href={a.href || "#"} style={{ marginRight: 8 }}>
                        {a.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Interrogator probes (next questions)">
        {report.recommendations.question_probes.length === 0 ? (
          <p>(No probes; direction appears complete enough to proceed.)</p>
        ) : (
          <ol>
            {report.recommendations.question_probes.map((q) => (
              <li key={q.id} style={{ marginBottom: 8 }}>
                <div><strong>{q.prompt}</strong></div>
                <div style={{ opacity: 0.8 }}>{q.rationale}</div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Integration slots (stack-neutral recommendations)">
        <p style={{ opacity: 0.85 }}>
          These are <strong>slots</strong> to fill using optional integrations. The kernel stays stack-neutral; bindings remain reversible.
        </p>
        <ul>
          {report.recommendations.kit_slots.map((s) => (
            <li key={s.slot_id}>
              <strong>{s.slot_id}</strong> — <span style={{ opacity: 0.85 }}>{s.reason}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <details style={{ marginTop: 12 }}>
        <summary><strong>Evidence: coherence report JSON</strong></summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{jsonText}</pre>
      </details>
    </main>
  );
}
