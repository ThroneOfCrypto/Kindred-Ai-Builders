"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";

import { getCurrentProjectId, loadProjectStateById, saveProjectStateById } from "../../../lib/state";
import type { ProjectState } from "../../../lib/types";
import {
  buildInterrogatorPack,
  buildInterrogatorAnswers,
  interrogatorAnswersJson,
  interrogatorAnswersSha256,
  type InterrogatorAnswerValueV1,
  type InterrogatorQuestionV1,
  type Likert4,
} from "../../../lib/interrogator";

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

const LIKERT_OPTS: { id: Likert4; label: string; help: string }[] = [
  { id: "-2", label: "Strong no", help: "No (strongly)" },
  { id: "-1", label: "No", help: "No (mildly)" },
  { id: "+1", label: "Yes", help: "Yes (mildly)" },
  { id: "+2", label: "Strong yes", help: "Yes (strongly)" },
];

function SectionTitle({ t }: { t: string }) {
  return <h2 style={{ marginTop: 8, marginBottom: 8 }}>{t}</h2>;
}

function renderQuestion(
  q: InterrogatorQuestionV1,
  value: InterrogatorAnswerValueV1 | undefined,
  setAnswer: (qid: string, v: InterrogatorAnswerValueV1) => void
) {
  if (q.kind === "likert4") {
    const cur = value?.kind === "likert4" ? value.value : ("" as any);
    return (
      <div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          {LIKERT_OPTS.map((o) => (
            <label key={o.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, minWidth: 160, cursor: "pointer" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name={q.id}
                  checked={cur === o.id}
                  onChange={() => setAnswer(q.id, { kind: "likert4", value: o.id })}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>{o.label}</div>
                  <div style={{ opacity: 0.7, fontSize: 12 }}>{o.help}</div>
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (q.kind === "single_select") {
    const cur = value?.kind === "single_select" ? value.value : "";
    const opts = q.options || [];
    return (
      <div style={{ marginTop: 8 }}>
        {opts.map((o) => (
          <label key={o.id} style={{ display: "block", marginBottom: 8, cursor: "pointer" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <input
                type="radio"
                name={q.id}
                checked={cur === o.id}
                onChange={() => setAnswer(q.id, { kind: "single_select", value: o.id })}
              />
              <div>
                <div style={{ fontWeight: 700 }}>{o.label}</div>
                {o.help ? <div style={{ opacity: 0.7, fontSize: 12 }}>{o.help}</div> : null}
              </div>
            </div>
          </label>
        ))}
      </div>
    );
  }

  // multi_select
  const cur = value?.kind === "multi_select" ? value.value : [];
  const opts = q.options || [];
  const set = new Set(cur);

  return (
    <div style={{ marginTop: 8 }}>
      {opts.map((o) => {
        const checked = set.has(o.id);
        return (
          <label key={o.id} style={{ display: "block", marginBottom: 8, cursor: "pointer" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = new Set(set);
                  if (checked) next.delete(o.id);
                  else next.add(o.id);
                  const arr = Array.from(next.values()).sort();
                  setAnswer(q.id, { kind: "multi_select", value: arr });
                }}
              />
              <div>
                <div style={{ fontWeight: 700 }}>{o.label}</div>
                {o.help ? <div style={{ opacity: 0.7, fontSize: 12 }}>{o.help}</div> : null}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

export default function DirectorInterrogatorPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [state, setState] = useState<ProjectState | null>(null);
  const [answers, setAnswers] = useState<Record<string, InterrogatorAnswerValueV1>>({});
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const pid = getCurrentProjectId();
    setProjectId(pid);
    const st = loadProjectStateById(pid);
    setState(st);

    const saved = typeof (st as any)?.director?.last_interrogator_answers_json === "string" ? (st as any).director.last_interrogator_answers_json : "";
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.schema === "kindred.interrogator_answers.v1" && parsed.answers && typeof parsed.answers === "object") {
          setAnswers(parsed.answers);
        }
      } catch {
        // ignore
      }
    }

    const on = () => {
      const next = loadProjectStateById(pid);
      setState(next);
    };
    window.addEventListener("kindred_state_changed", on as any);
    return () => window.removeEventListener("kindred_state_changed", on as any);
  }, []);

  const pack = useMemo(() => (state ? buildInterrogatorPack(state) : null), [state]);

  const report = useMemo(() => (state && pack ? buildInterrogatorAnswers(state, answers) : null), [state, pack, answers]);
  const jsonText = useMemo(() => (state ? interrogatorAnswersJson(state, answers) : ""), [state, answers]);
  const sha = useMemo(() => (state ? interrogatorAnswersSha256(state, answers) : ""), [state, answers]);

  function setAnswer(qid: string, v: InterrogatorAnswerValueV1) {
    setAnswers((prev) => ({ ...prev, [qid]: v }));
  }

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
    if (!state || !report) return;
    const safe = (state.project.name || "project").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");
    const filename = `${safe}__interrogator_answers.v1.json`;
    downloadTextFile(filename, jsonText);
    persistDirectorMeta(state, {
      last_interrogator_answers_sha256: sha,
      last_interrogator_answers_generated_at_utc: new Date().toISOString(),
      last_interrogator_answers_json: jsonText,
    });
    setStatus(`Downloaded interrogator answers (sha256 ${sha.slice(0, 12)}…)`);
  }

  if (!state || !pack || !report) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
        <h1>Interrogator</h1>
        <p>Loading…</p>
      </main>
    );
  }

  const triKind = report.completeness.ok ? "success" : report.completeness.required_answered === 0 ? "warn" : "warn";

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1>Interrogator</h1>
      <p>
        This is a deterministic, CTO-style interview that sets your <strong>trade-off dials</strong> with <strong>no neutral answers</strong>.
        It produces a governed artefact you can share with builders and reviewers.
      </p>

      {status ? <Callout kind="success">{status}</Callout> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <button className="btn" onClick={onDownload}>Download answers artefact</button>
      </div>

      <Callout kind={triKind as any}>
        Required answered: {report.completeness.required_answered}/{report.completeness.required_total} • {report.completeness.ok ? "OK" : "Incomplete"}
      </Callout>

      <Panel title="Questions">
        {pack.items.map((q) => (
          <div key={q.id} style={{ borderBottom: "1px solid #e5e7eb", paddingBottom: 14, marginBottom: 14 }}>
            <SectionTitle t={q.prompt} />
            <div style={{ opacity: 0.8 }}>{q.rationale}</div>
            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
              ID: <code>{q.id}</code> • {q.required ? "required" : "optional"} • type <code>{q.kind}</code>
            </div>
            {renderQuestion(q, answers[q.id], setAnswer)}
          </div>
        ))}
      </Panel>

      <Panel title="Derived integration slots (stack-neutral)">
        {report.kit_slots.length === 0 ? (
          <p>(No additional slots derived yet.)</p>
        ) : (
          <ul>
            {report.kit_slots.map((s) => (
              <li key={s.slot_id}>
                <strong>{s.slot_id}</strong> — <span style={{ opacity: 0.85 }}>{s.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <details style={{ marginTop: 12 }}>
        <summary><strong>Evidence: interrogator answers JSON</strong></summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{jsonText}</pre>
      </details>
    </main>
  );
}
