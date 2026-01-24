"use client";

import React from "react";
import { labelForSection } from "../lib/section_library";

function Badge(props: { text: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 999,
        background: "var(--panel-2)",
        color: "var(--muted)",
        fontSize: 12,
      }}
    >
      {props.text}
    </span>
  );
}

function SectionCard(props: {
  id: string;
  index: number;
  selected?: boolean;
  onSelect?: () => void;
  children?: React.ReactNode;
}) {
  const { id, index, selected, onSelect, children } = props;
  return (
    <div
      style={{
        border: selected ? "1px solid var(--primary-2)" : "1px solid var(--border)",
        borderRadius: 14,
        padding: 14,
        background: selected ? "var(--panel)" : "var(--panel-2)",
        boxShadow: selected ? "var(--shadow-panel)" : "none",
        cursor: onSelect ? "pointer" : "default",
        transition: "transform var(--motion-fast) ease, box-shadow var(--motion-fast) ease",
      }}
      onClick={onSelect}
      title={id}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text)" }}>
          <strong>{labelForSection(id)}</strong>
          <span style={{ marginLeft: 10, color: "var(--muted)" }}>{id}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>#{index + 1}</div>
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function MiniHero() {
  return (
    <div
      style={{
        borderRadius: 14,
        padding: 16,
        border: "1px solid var(--border)",
        background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 100%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: "var(--primary)",
              boxShadow: "var(--shadow-panel)",
            }}
            aria-hidden
          />
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Brand</div>
        </div>
        <Badge text="Primary CTA" />
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Your headline goes here</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)" }}>
          Short supporting copy that explains the value without turning into a manifesto.
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="btn"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: "var(--primary)",
            border: "1px solid var(--primary-2)",
            color: "white",
          }}
        >
          Get started
        </button>
        <button
          className="btn"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        >
          Learn more
        </button>
      </div>
    </div>
  );
}

function MiniGrid() {
  const items = ["Clarity", "Trust", "Speed"].map((t) => ({ title: t, body: "One crisp sentence of value." }));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
      {items.map((it) => (
        <div
          key={it.title}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: 12,
            background: "var(--panel)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{it.title}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{it.body}</div>
        </div>
      ))}
    </div>
  );
}

function MiniList(props: { label: string }) {
  const items = ["Item one", "Item two", "Item three"];
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Badge text={props.label} />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>preview</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map((t) => (
          <div
            key={t}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 12,
              background: "var(--panel)",
            }}
          >
            <div style={{ fontSize: 12, color: "var(--text)" }}>{t}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function contentForSection(sectionId: string): React.ReactNode {
  // Deterministic, minimal "fast render" approximations.
  // This is NOT a codegen target; it is only a feedback loop for Directors.
  if (sectionId === "hero") return <MiniHero />;
  if (sectionId === "feature_grid" || sectionId === "features") return <MiniGrid />;
  if (sectionId === "faq") return <MiniList label="FAQ" />;
  if (sectionId === "testimonials") return <MiniList label="Testimonials" />;
  if (sectionId === "pricing") return <MiniList label="Pricing" />;
  if (sectionId === "cta") return <MiniHero />;
  return <MiniList label="Section" />;
}

export function FastRenderPreview(props: {
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <Badge text="Fast render" />
          <Badge text="Tokens applied" />
          <Badge text="Deterministic" />
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {sections.length === 0 && <div className="small">No sections defined for this page in this variant.</div>}

          {sections.map((s, idx) => (
            <SectionCard
              key={`${s}-${idx}`}
              id={s}
              index={idx}
              selected={idx === selectedIndex}
              onSelect={onSelectSection ? () => onSelectSection(idx) : undefined}
            >
              {contentForSection(s)}
            </SectionCard>
          ))}
        </div>
      </div>

      <div className="hr" />

      <p className="small">
        Fast render is a deterministic, token-styled approximation meant for immediate layout feedback. It is not a
        final code preview.
      </p>
    </div>
  );
}
