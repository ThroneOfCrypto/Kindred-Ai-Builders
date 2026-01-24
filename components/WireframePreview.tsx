"use client";

import React from "react";
import { labelForSection } from "../lib/section_library";

export function WireframePreview(props: {
  title: string;
  sections: string[];
  selectedIndex?: number;
  onSelectSection?: (index: number) => void;
}) {
  const { title, sections, selectedIndex, onSelectSection } = props;

  return (
    <div style={{ width: "100%" }}>
      <div className="badge">
        <strong>Preview</strong> <span>{title}</span>
      </div>

      <div className="hr" />

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 14,
          background: "var(--panel)",
          padding: 12,
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          {sections.length === 0 && <div className="small">No sections defined for this page in this variant.</div>}

          {sections.map((s, idx) => (
            <div
              key={`${s}-${idx}`}
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 12,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: idx === selectedIndex ? "var(--panel-3)" : "var(--panel-2)",
                cursor: onSelectSection ? "pointer" : "default",
              }}
              onClick={() => {
                if (onSelectSection) onSelectSection(idx);
              }}
            >
              <div style={{ fontSize: 12 }}>
                <strong style={{ color: "var(--text)" }}>{labelForSection(s)}</strong>
                <span style={{ marginLeft: 10, color: "var(--muted)" }}>{s}</span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>#{idx + 1}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="hr" />

      <p className="small">
        This is a greyscale structural preview. Color, typography, imagery, and motion are applied later via tokens and
        design proposals.
      </p>
    </div>
  );
}
