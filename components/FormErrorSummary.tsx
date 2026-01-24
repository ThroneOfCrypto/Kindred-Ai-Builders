import React, { useEffect, useMemo, useRef } from "react";

import { Callout } from "./Callout";

export type FormError = {
  id?: string;
  message: string;
};

type Props = {
  title?: string;
  errors: FormError[];
};

/**
 * Minimal, accessible error summary for forms.
 *
 * - Shows errors as text (WCAG 3.3.1 Error Identification).
 * - Announces new errors for assistive tech (role="alert" + aria-live).
 * - Focuses the summary when errors appear, so users discover the problem immediately.
 * - If an error provides an `id`, we link to that field and focus it on click.
 */
export function FormErrorSummary({ title = "Fix these", errors }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  const list = useMemo(() => {
    return Array.isArray(errors)
      ? errors
          .map((e) => ({ id: String(e?.id || "").trim() || undefined, message: String(e?.message || "").trim() }))
          .filter((e) => e.message.length > 0)
      : [];
  }, [errors]);

  useEffect(() => {
    if (list.length <= 0) return;
    // Let the DOM commit, then focus.
    const t = setTimeout(() => {
      try {
        ref.current?.focus();
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(t);
  }, [list.length]);

  function jumpTo(id?: string) {
    const targetId = String(id || "").trim();
    if (!targetId) return;
    try {
      const el = document.getElementById(targetId);
      if (!el) return;
      // Try to focus real form controls first.
      const focusable = (el as any).focus
        ? (el as any)
        : ((el.querySelector?.("input,select,textarea,button,a,[tabindex]") as any) || null);

      try {
        focusable?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      } catch {
        // ignore
      }
      try {
        focusable?.focus?.();
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }

  if (!list.length) return null;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      style={{ outline: "none" }}
      aria-label={title}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <Callout kind="error" title={title}>
        <ul className="small list" style={{ margin: 0 }}>
          {list.map((e, i) => {
            if (e.id) {
              return (
                <li key={i}>
                  <a
                    href={`#${e.id}`}
                    onClick={(ev) => {
                      ev.preventDefault();
                      jumpTo(e.id);
                    }}
                  >
                    {e.message}
                  </a>
                </li>
              );
            }
            return <li key={i}>{e.message}</li>;
          })}
        </ul>
      </Callout>
    </div>
  );
}
