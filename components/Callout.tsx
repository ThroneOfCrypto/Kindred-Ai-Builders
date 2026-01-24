import React from "react";

export type CalloutKind = "info" | "success" | "warn" | "error";
export type CalloutTone = "info" | "success" | "warn" | "danger";

type Props = {
  /** Preferred prop name used by most screens. */
  kind?: CalloutKind;
  /** Back-compat for some screens that used `tone`. */
  tone?: CalloutTone;
  title?: string;
  /** Optional body content. */
  children?: React.ReactNode;
  /** Optional list of detail lines (rendered if children is empty). */
  details?: string[];
  actions?: React.ReactNode;
  compact?: boolean;
  className?: string;
};

function normalizeKind(kind?: CalloutKind, tone?: CalloutTone): CalloutKind {
  if (kind) return kind;
  if (!tone) return "info";
  if (tone === "danger") return "error";
  return tone;
}

export function Callout({ kind, tone, title, children, details, actions, compact, className }: Props) {
  const k = normalizeKind(kind, tone);
  const body = (() => {
    if (children !== undefined && children !== null) return children;
    const lines = Array.isArray(details) ? details.filter((x) => typeof x === "string" && x.trim().length > 0) : [];
    if (!lines.length) return null;
    return (
      <ul className="small list">
        {lines.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    );
  })();

  return (
    <div
      className={["callout", `callout--${k}`, compact ? "callout--compact" : "", className || ""]
        .filter(Boolean)
        .join(" ")}
      role={k === "error" ? "alert" : "status"}
      aria-live={k === "error" ? "assertive" : "polite"}
    >
      {title && <div className="callout__title">{title}</div>}
      {body ? <div className="callout__body">{body}</div> : null}
      {actions && <div className="callout__actions">{actions}</div>}
    </div>
  );
}
