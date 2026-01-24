"use client";

import React from "react";
import type { BuilderStepId } from "../lib/jump_to_fix";
import { stepLabel } from "../lib/jump_to_fix";

export type FixChecklistItem = {
  key: string;
  severity: "error" | "warn";
  title: string;
  details?: string;
  step?: BuilderStepId | null;
  anchor?: string | null;
  actionLabel?: string;
};

export function FixChecklistView({
  items,
  onJump,
  emptyHint,
}: {
  items: FixChecklistItem[];
  onJump?: (args: { step: BuilderStepId; anchor?: string | null; item: FixChecklistItem }) => void;
  emptyHint?: string;
}) {
  if (!items || items.length === 0) {
    return <p className="small">{emptyHint || "No fixes required."}</p>;
  }

  return (
    <div style={{ maxHeight: 360, overflow: "auto" }}>
      {items.map((item) => {
        const k = item.severity === "error" ? "!" : "W";
        const border =
          item.severity === "error" ? "rgba(255, 107, 107, 0.45)" : "rgba(110, 168, 254, 0.45)";
        const step = item.step || null;
        const action = item.actionLabel || (step ? `Fix in: ${stepLabel(step)}` : "Fix");

        return (
          <div key={item.key} className="step" style={{ marginBottom: 10, borderColor: border }}>
            <div
              className="k"
              style={{
                borderColor: border,
                color: item.severity === "error" ? "var(--danger)" : "var(--primary)",
              }}
            >
              {k}
            </div>
            <div className="t" style={{ width: "100%" }}>
              <strong>{item.title}</strong>
              <span>
                {step ? `fix in: ${stepLabel(step)}` : ""}
                {item.details ? ` • ${item.details}` : ""}
              </span>

              {onJump && step && (
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="btn"
                    onClick={() =>
                      onJump({
                        step,
                        anchor: item.anchor,
                        item,
                      })
                    }
                  >
                    {action}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
