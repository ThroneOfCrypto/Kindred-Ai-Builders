"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { PrimaryButton, SecondaryButton } from "../../../components/Buttons";
import { IntentIntakeEditor } from "../../../components/IntentIntakeEditor";

import { defaultState, loadState, saveState, getCurrentProjectId } from "../../../lib/state";
import { normalizeIntentIntake, labelForKeyAction } from "../../../lib/intake";
import type { IntentIntakeV1, ProjectState } from "../../../lib/types";
import { stableJsonText } from "../../../lib/stable_json";

function copyToClipboard(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

function downloadTextFile(filename: string, text: string, mime: string) {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 250);
  } catch {
    // ignore
  }
}

function safeName(s: string): string {
  const x = String(s || "")
    .trim()
    .replace(/[^a-zA-Z0-9_\-]+/g, "_")
    .slice(0, 64);
  return x || "project";
}

function SummaryRow(props: { k: string; v: React.ReactNode; onChange?: () => void }) {
  return (
    <tr>
      <td style={{ padding: "10px 8px", verticalAlign: "top", width: 180 }}>
        <strong>{props.k}</strong>
      </td>
      <td style={{ padding: "10px 8px", verticalAlign: "top" }}>{props.v}</td>
      <td style={{ padding: "10px 8px", verticalAlign: "top", width: 120, textAlign: "right" }}>
        {props.onChange ? (
          <button className="btn secondary" type="button" onClick={props.onChange}>
            Change
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export default function DirectorIntentPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [state, setState] = useState<ProjectState>(defaultState());
  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<"info" | "success" | "warn" | "error">("info");
  const [showNotes, setShowNotes] = useState<boolean>(false);

  useEffect(() => {
    try {
      setState(loadState());
    } catch {
      setState(defaultState());
    }
  }, []);

  function persist(next: ProjectState) {
    setState(next);
    try {
      saveState(next);
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  }

  const pid = useMemo(() => {
    try {
      return getCurrentProjectId() || "";
    } catch {
      return "";
    }
  }, []);

  const normalized: IntentIntakeV1 = useMemo(() => {
    return normalizeIntentIntake({
      raw: (state.intent as any).intake,
      build_intent: state.intent.build_intent,
      palettes: state.intent.palettes,
      legacy_notes: "",
    });
  }, [state.intent.build_intent, state.intent.palettes, (state.intent as any).intake]);

  function setIntake(next: IntentIntakeV1) {
    // Store the canonical (normalized) object as the deterministic intake state.
    const canonical = normalizeIntentIntake({
      raw: next,
      build_intent: state.intent.build_intent,
      palettes: state.intent.palettes,
      legacy_notes: "",
    });
    persist({ ...state, intent: { ...state.intent, intake: canonical as any } });
  }

  const nextHref = String(params.get("next") || "").trim() || "/director/proposals";
  const focus = String(params.get("focus") || "").trim();

  const intakeJson = useMemo(() => stableJsonText(normalized, 2), [normalized]);
  const intakeMd = useMemo(() => {
    const lines: string[] = [];
    lines.push(`# Director Intent Card`);
    lines.push("");
    lines.push(`- Project: **${pid || "(none selected)"}**`);
    lines.push(`- Primary outcome: **${normalized.primary_outcome}**`);
    lines.push(`- Value emphasis: **${normalized.value_emphasis}**`);
    lines.push(`- Key actions: ${normalized.key_action_ids.map((id) => `\`${id}\``).join(", ")}`);
    if (String(normalized.notes || "").trim()) {
      lines.push("");
      lines.push("## Notes (non-normative)");
      lines.push(String(normalized.notes || ""));
    }
    return lines.join("\n");
  }, [normalized, pid]);

  function jump(id: string) {
    try {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      // ignore
    }
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Intent Card</h1>
        <p>
          Deterministic intake, rendered as a check-your-work summary. No prose required. Notes are optional and non-normative.
        </p>
        <p className="small">
          Current project: <strong>{pid || "(none selected)"}</strong>
        </p>
      </div>

      {status ? (
        <Callout title={statusKind === "error" ? "Issue" : statusKind === "warn" ? "Warning" : "Status"} tone={statusKind}>
          <p className="small mb0">{status}</p>
        </Callout>
      ) : null}

      <div className="grid">
        <Panel title="Edit intake" subtitle="Chips-only. Stored as a schema-locked intent.intake.v1 object.">
          <div id="edit_primary" />
          <IntentIntakeEditor intake={normalized} onChange={setIntake} />

          <div className="hr" />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn secondary"
              aria-expanded={showNotes}
              aria-controls="intent_notes"
              onClick={() => setShowNotes((x) => !x)}
            >
              {showNotes ? "Hide notes" : "Add notes (optional)"}
            </button>
          </div>

          {showNotes ? (
            <div id="intent_notes" style={{ marginTop: 12 }}>
              <label className="small" style={{ display: "block", marginBottom: 6 }}>
                Notes (non-normative)
              </label>
              <textarea
                value={String(normalized.notes || "")}
                onChange={(e) => setIntake({ ...normalized, notes: e.target.value } as any)}
                placeholder="Optional. This never drives gates or proposals."
                rows={4}
              />
              <p className="small" style={{ marginTop: 8 }}>
                Notes are for humans only. They are excluded from deterministic decision-making.
              </p>
            </div>
          ) : null}
        </Panel>

        <Panel title="Check answers" subtitle="Summary list with Change actions (the boring pattern that actually works).">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <SummaryRow k="Primary outcome" v={<span className="chip chip--selected">{normalized.primary_outcome}</span>} onChange={() => jump("edit_primary")} />
                <SummaryRow k="Value emphasis" v={<span className="chip chip--selected">{normalized.value_emphasis}</span>} onChange={() => jump("edit_primary")} />
                <SummaryRow
                  k="Key actions"
                  v={
                    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                      {normalized.key_action_ids.map((id) => (
                        <span key={id} className="chip chip--selected" title={labelForKeyAction(id as any)}>
                          {id}
                        </span>
                      ))}
                    </div>
                  }
                  onChange={() => jump("edit_primary")}
                />
                <SummaryRow
                  k="Notes"
                  v={String(normalized.notes || "").trim() ? <span className="small">Included (non-normative)</span> : <span className="small">None</span>}
                  onChange={() => {
                    setShowNotes(true);
                    setTimeout(() => jump("intent_notes"), 0);
                  }}
                />
              </tbody>
            </table>
          </div>

          <div className="hr" />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="small" aria-live="polite" style={{ alignSelf: "center" }}>Saved automatically.</div>
            <SecondaryButton
              onClick={() => {
                copyToClipboard(intakeJson);
                setStatusKind("success");
                setStatus("Copied intent intake JSON to clipboard.");
              }}
            >
              Copy JSON
            </SecondaryButton>
            <SecondaryButton
              onClick={() => {
                downloadTextFile(`${safeName(state.project?.name)}__intent_intake.json`, intakeJson, "application/json");
                setStatusKind("success");
                setStatus("Downloaded intent intake JSON.");
              }}
            >
              Download JSON
            </SecondaryButton>
            <SecondaryButton
              onClick={() => {
                copyToClipboard(intakeMd);
                setStatusKind("success");
                setStatus("Copied Intent Card (Markdown). ");
              }}
            >
              Copy Markdown
            </SecondaryButton>
          </div>

          <div className="hr" />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <SecondaryButton
              onClick={() => {
                const href = focus ? `/director/proposals?focus=${encodeURIComponent(focus)}&next=${encodeURIComponent(nextHref)}` : nextHref;
                router.push(href);
              }}
            >
              Continue
            </SecondaryButton>
            <SecondaryButton href="/director">Back to Director</SecondaryButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}
