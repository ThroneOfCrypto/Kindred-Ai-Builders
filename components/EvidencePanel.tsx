"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "./Panel";
import { Callout } from "./Callout";
import { DangerButton, SecondaryButton } from "./Buttons";

import { clearEvidenceLedger, loadEvidenceLedger, type EvidenceCardV1 } from "../lib/evidence_ledger";
import { stableJsonText } from "../lib/stable_json";

function shortSha(x: any): string {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.length <= 12 ? s : `${s.slice(0, 12)}…`;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function EvidencePanel(props: { projectId?: string; limit?: number }) {
  const pid = String(props.projectId || "").trim() || "default";
  const limit = Math.max(5, Math.min(50, Number(props.limit || 12)));

  const [cards, setCards] = useState<EvidenceCardV1[]>([]);
  const [notice, setNotice] = useState<string>("");

  function refresh() {
    const ledger = loadEvidenceLedger(pid);
    const next = ledger.cards.slice(0, limit);
    setCards(next);
  }

  useEffect(() => {
    refresh();
    const bump = () => refresh();
    window.addEventListener("kindred_evidence_changed", bump);
    return () => window.removeEventListener("kindred_evidence_changed", bump);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, limit]);

  const json = useMemo(() => stableJsonText({ schema: "kindred.evidence_export.v1", project_id: pid, cards }), [pid, cards]);

  return (
    <Panel title="Evidence (recent proofs)" subtitle="Local-first ledger of locks, verify reports, backups, and failures.">
      {notice ? (
        <Callout title={notice} tone="info">
          <div className="small">(This message auto-clears on next refresh.)</div>
        </Callout>
      ) : null}

      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <SecondaryButton
          onClick={async () => {
            const ok = await copy(json);
            setNotice(ok ? "Copied evidence JSON" : "Copy failed (clipboard not available)");
          }}
        >
          Copy JSON
        </SecondaryButton>
        <SecondaryButton
          onClick={() => {
            const bytes = new TextEncoder().encode(json + "\n");
            const blob = new Blob([bytes], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `evidence__${pid}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 500);
          }}
        >
          Download
        </SecondaryButton>
        <DangerButton
          onClick={() => {
            clearEvidenceLedger(pid);
            setNotice("Evidence ledger cleared");
            refresh();
          }}
        >
          Clear
        </DangerButton>
      </div>

      <div style={{ marginTop: 12 }}>
        {cards.length === 0 ? (
          <p className="small">No evidence cards yet. Lock a Spec Pack, run Verify, or save a Failure Record.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {cards.map((c) => (
              <div key={c.id} className="codeBlock" style={{ padding: 10 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <strong>{c.title}</strong>
                  <span className="small">{c.created_at_utc}</span>
                </div>
                <div className="small" style={{ opacity: 0.9, marginTop: 6 }}>
                  {c.summary}
                </div>
                {c.data ? (
                  <div className="small" style={{ marginTop: 8, opacity: 0.9 }}>
                    {Object.keys(c.data)
                      .slice(0, 6)
                      .map((k) => {
                        const v = (c.data as any)[k];
                        const sv = typeof v === "string" ? (v.length > 16 ? shortSha(v) : v) : JSON.stringify(v);
                        return (
                          <div key={k}>
                            <code>{k}</code>: <code>{sv}</code>
                          </div>
                        );
                      })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
