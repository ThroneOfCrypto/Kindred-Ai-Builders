"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { readAdvancedMode, ADVANCED_MODE_EVENT, toggleAdvancedMode } from "../../lib/advanced_mode";

const SAFE_ROUTES = new Set<string>([
  "/director",
  "/director/connect-ai",
  "/director/journey",
  "/director/import",
  "/director/ship",
  "/director/start",
]);

const DIRECTOR_FLOW: { href: string; label: string }[] = [
  { href: "/director/connect-ai", label: "Connect AI" },
  { href: "/director/start", label: "Start / Import" },
  { href: "/director/journey", label: "Journey" },
  { href: "/director/ship", label: "Ship" },
];

function activeFlowIndex(pathname: string): number {
  const p = String(pathname || "/director");

  // Director home behaves like the entrypoint to step 1.
  if (p === "/director") return 0;

  // Treat Import as part of the Start step (it's optional, not a required stage).
  if (p === "/director/import" || p.startsWith("/director/import/")) return 1;

  // Exact matches first.
  for (let i = 0; i < DIRECTOR_FLOW.length; i++) {
    if (p === DIRECTOR_FLOW[i].href) return i;
  }

  // Prefix matches (e.g. nested routes).
  for (let i = 0; i < DIRECTOR_FLOW.length; i++) {
    if (p.startsWith(DIRECTOR_FLOW[i].href + "/")) return i;
  }

  // Default to Journey home.
  return 2;
}

type AiStatus = {
  mode: "connected" | "limited" | "disconnected";
  label: string;
  title?: string;
};

function brandShortLabel(id: string): string {
  switch (String(id || "").toLowerCase()) {
    case "google":
      return "Gemini";
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Claude";
    case "xai":
      return "Grok";
    case "deepseek":
      return "DeepSeek";
    case "ollama":
      return "Local";
    default:
      return "AI";
  }
}

function readAiStatus(): AiStatus {
  try {
    const opt = localStorage.getItem("kindred.ai.opt_out.v1");
    if (opt === "1" || opt === "true") {
      return { mode: "limited", label: "Limited", title: "AI is disabled (limited mode)" };
    }
    const raw =
      localStorage.getItem("kindred.ai.connection.v2") ||
      localStorage.getItem("kindred.ai.connection.v1");
    if (!raw) return { mode: "disconnected", label: "Not connected", title: "Connect AI to unlock proposals" };
    const j = JSON.parse(raw);
    if (j && j.connected === true) {
      const brand = brandShortLabel(String(j.brand_id || ""));
      const model = String(j.model_id || "auto");
      const kind = String(j.connection_kind || "subscription");
      const method = String(j.connection_method || "");
      const label = model && model !== "auto" ? `Connected · ${brand}` : `Connected · ${brand}`;
      const title = `${brand} (${kind}${method ? ":" + method : ""}) · model=${model}`;
      return { mode: "connected", label, title };
    }
    return { mode: "disconnected", label: "Not connected", title: "Connect AI to unlock proposals" };
  } catch {
    return { mode: "disconnected", label: "Not connected", title: "Connect AI to unlock proposals" };
  }
}

function DirectorStepper(props: { pathname: string; aiStatus: AiStatus }) {
  const idx = activeFlowIndex(props.pathname);
  return (
    <div className="directorTopbar">
      <div className="directorTopbar__inner">
        <div className="directorTopbar__row">
          <div className="directorStepper" aria-label="Director journey steps">
            {DIRECTOR_FLOW.map((s, i) => {
              const state = i < idx ? "done" : i === idx ? "active" : "todo";
              const canNavigate = i <= idx; // linear, Grandma-safe
              const cls = "directorStep directorStep--" + state + (canNavigate ? "" : " directorStep--disabled");
              if (!canNavigate) {
                return (
                  <span key={s.href} className={cls} aria-disabled="true" title="Complete the previous steps first">
                    <span className="directorStep__num">{i + 1}</span>
                    <span className="directorStep__label">{s.label}</span>
                  </span>
                );
              }
              return (
                <Link key={s.href} href={s.href} className={cls} aria-current={i === idx ? "step" : undefined}>
                  <span className="directorStep__num">{i + 1}</span>
                  <span className="directorStep__label">{s.label}</span>
                </Link>
              );
            })}
          </div>

          <div className="directorTopbar__meta">
            <Link
              href="/director/connect-ai"
              className={
                "directorMetaPill directorMetaPill--" +
                (props.aiStatus.mode === "connected" ? "ok" : props.aiStatus.mode === "limited" ? "warn" : "bad")
              }
              title={props.aiStatus.title || (props.aiStatus.mode === "connected" ? "AI is connected" : props.aiStatus.mode === "limited" ? "AI is disabled (limited mode)" : "Connect AI to unlock proposals")}
            >
              {props.aiStatus.label}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function isSafe(pathname: string): boolean {
  if (SAFE_ROUTES.has(pathname)) return true;
  // Allow query/hash variants handled by Next automatically. Here we only check base pathname.
  return false;
}

export default function DirectorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/director";

  const [advanced, setAdvanced] = useState<boolean>(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>({ mode: "disconnected", label: "AI not connected" });

  useEffect(() => {
    const refresh = () => {
      try {
        setAdvanced(readAdvancedMode());
      } catch {
        setAdvanced(false);
      }
      try {
        setAiStatus(readAiStatus());
      } catch {
        setAiStatus({ mode: "disconnected", label: "AI not connected" });
      }
    };

    refresh();

    const onAdv = () => refresh();
    const onAny = () => refresh();

    window.addEventListener(ADVANCED_MODE_EVENT as any, onAdv);
    // Journey pages already dispatch this when storage changes.
    window.addEventListener("kindred_ai_connection_changed" as any, onAny as any);
    window.addEventListener("kindred_state_changed" as any, onAny as any);

    return () => {
      window.removeEventListener(ADVANCED_MODE_EVENT as any, onAdv);
      window.removeEventListener("kindred_ai_connection_changed" as any, onAny as any);
      window.removeEventListener("kindred_state_changed" as any, onAny as any);
    };
  }, []);

  // AI-first integrity: keep Directors out of "half-connected" states.
  // If AI is disconnected and the Director has not explicitly opted out, redirect
  // them back to Connect AI for any journey-critical screens.
  useEffect(() => {
    try {
      if (!pathname.startsWith("/director")) return;

      const protectedRoutes = new Set<string>([
        "/director/start",
        "/director/journey",
        "/director/import",
        "/director/ship",
      ]);

      // Normalize nested routes.
      const base = pathname.split("?")[0];
      const needsAi = Array.from(protectedRoutes).some((p) => base === p || base.startsWith(p + "/"));
      if (!needsAi) return;

      if (aiStatus.mode === "disconnected") {
        // Preserve intent: return to the page they tried to open.
        const next = encodeURIComponent(base);
        if (base !== "/director/connect-ai") {
          window.location.href = `/director/connect-ai?next=${next}`;
        }
      }
    } catch {
      // ignore
    }
  }, [aiStatus.mode, pathname]);

  const blocked = useMemo(() => {
    if (advanced) return false;
    if (!pathname.startsWith("/director")) return false;
    return !isSafe(pathname);
  }, [advanced, pathname]);

  if (!blocked)
    return (
      <>
        <a className="skipLink" href="#directorMain">
          Skip to content
        </a>
        <DirectorStepper pathname={pathname} aiStatus={aiStatus} />
        <main id="directorMain">{children}</main>
      </>
    );

  return (
    <div className="container">
      <div className="hero">
        <h1>Advanced tools</h1>
        <p>
          This area is intentionally hidden to keep the Director journey simple. If you want to inspect and edit the deeper
          system layers, you can unlock advanced tools.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <Link className="btn" href="/director/journey">
            Back to journey
          </Link>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              toggleAdvancedMode();
              setAdvanced(true);
            }}
          >
            Unlock advanced tools
          </button>
        </div>
      </div>

      <section className="panel">
        <h2 className="h2">Why this is hidden by default</h2>
        <ul className="list">
          <li>Non-technical Directors should never be forced to see framework internals.</li>
          <li>Advanced tools make it easy to break consistency with accidental edits.</li>
          <li>Default posture is Grandma-safe: only the journey surfaces are visible.</li>
        </ul>
      </section>
    </div>
  );
}
