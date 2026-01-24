"use client";

import React from "react";

import type { IntentIntakeV1, KeyActionId, PrimaryOutcomeId, ValueEmphasisId } from "../lib/types";
import { KEY_ACTIONS, PRIMARY_OUTCOMES, VALUE_EMPHASES } from "../lib/intake";

function sortKeyActions(ids: KeyActionId[]): KeyActionId[] {
  const wanted = Array.isArray(ids) ? ids : [];
  const order = new Map<string, number>();
  KEY_ACTIONS.forEach((x, i) => order.set(x.id, i));
  const copy = [...wanted];
  copy.sort((a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999));
  return copy;
}

export function IntentIntakeEditor(props: {
  intake: IntentIntakeV1;
  onChange: (next: IntentIntakeV1) => void;
  compact?: boolean;
}) {
  const intake = props.intake;

  function setPrimaryOutcome(next: PrimaryOutcomeId) {
    props.onChange({ ...intake, primary_outcome: next });
  }
  function setValueEmphasis(next: ValueEmphasisId) {
    props.onChange({ ...intake, value_emphasis: next });
  }
  function toggleAction(id: KeyActionId) {
    const current = Array.isArray(intake.key_action_ids) ? intake.key_action_ids : [];
    const exists = current.includes(id);
    const next = exists ? current.filter((x) => x !== id) : current.concat([id]);
    props.onChange({ ...intake, key_action_ids: sortKeyActions(next).slice(0, 8) });
  }

  return (
    <div>
      <div className="grid" style={{ gap: 12 }}>
        <div>
          <label className="small" style={{ display: "block", marginBottom: 6 }}>
            Primary outcome
          </label>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {PRIMARY_OUTCOMES.map((o) => (
              <button
                key={o.id}
                className={["chip", intake.primary_outcome === o.id ? "chip--selected" : ""].join(" ")}
                onClick={() => setPrimaryOutcome(o.id)}
                type="button"
                title={o.hint}
              >
                <span className="chip__label">{o.label}</span>
                <span className="chip__meta">{o.id}</span>
              </button>
            ))}
          </div>
          <p className="small" style={{ marginTop: 8 }}>
            {PRIMARY_OUTCOMES.find((x) => x.id === intake.primary_outcome)?.hint || ""}
          </p>
        </div>

        <div>
          <label className="small" style={{ display: "block", marginBottom: 6 }}>
            Value emphasis
          </label>
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {VALUE_EMPHASES.map((o) => (
              <button
                key={o.id}
                className={["chip", intake.value_emphasis === o.id ? "chip--selected" : ""].join(" ")}
                onClick={() => setValueEmphasis(o.id)}
                type="button"
                title={o.hint}
              >
                <span className="chip__label">{o.label}</span>
                <span className="chip__meta">{o.id}</span>
              </button>
            ))}
          </div>
          <p className="small" style={{ marginTop: 8 }}>
            {VALUE_EMPHASES.find((x) => x.id === intake.value_emphasis)?.hint || ""}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label className="small" style={{ display: "block", marginBottom: 6 }}>
          Key actions (choose up to 8)
        </label>
        <div className="chipGrid">
          {KEY_ACTIONS.map((a) => {
            const selected = Array.isArray(intake.key_action_ids) && intake.key_action_ids.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                className={["chip", selected ? "chip--selected" : ""].join(" ")}
                onClick={() => toggleAction(a.id)}
                title={a.hint}
              >
                <span className="chip__label">{a.label}</span>
                <span className="chip__meta">{a.id}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
