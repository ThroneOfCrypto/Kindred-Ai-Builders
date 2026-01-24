"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "./Panel";
import { Callout } from "./Callout";
import { PrimaryButton } from "./Buttons";

type Step = {
  id: string;
  title: string;
  blurb: string;
  links?: Array<{ label: string; href: string }>;
  code?: string;
};

const LS_KEY = "sdde_ai_setup_progress_v1";

function safeParseJson(s: string | null): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function clampBoolMap(obj: any): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) out[String(k)] = Boolean(v);
  return out;
}

export function AiSetupWizard() {
  const steps: Step[] = useMemo(
    () => [
      {
        id: "mode",
        title: "Pick a mode (offline first)",
        blurb:
          "Offline is default and deterministic. Hosted uses a server-side API key. Local uses an OpenAI-compatible endpoint (e.g. Ollama).",
        links: [
          { label: "AI status page", href: "/ai" },
          { label: "AI keys & costs (docs)", href: "/docs/ai-keys-and-costs" },
        ],
        code: [
          "# Offline (default)",
          "AI_MODE=offline",
          "",
          "# Hosted (OpenAI key on the server)",
          "AI_MODE=hosted",
          "OPENAI_API_KEY=replace_me",
          "",
          "# Local (OpenAI-compatible endpoint)",
          "AI_MODE=local",
          "AI_BASE_URL=http://localhost:11434/v1",
          "AI_MODEL=replace_me  # optional",
        ].join("\n"),
      },
      {
        id: "key",
        title: "Create an API key (provider dashboard)",
        blurb:
          "Keys are secrets. You create them in your provider account and store them as server-side environment variables. Kindred never needs to permanently see them in the browser.",
        links: [
          { label: "OpenAI quickstart (create/export key)", href: "https://platform.openai.com/docs/quickstart" },
          { label: "OpenAI API auth guidance", href: "https://platform.openai.com/docs/api-reference/introduction" },
        ],
      },
      {
        id: "budgets",
        title: "Set budgets + understand token costs",
        blurb:
          "Set limits/alerts in the provider dashboard so you don’t get surprise invoices. SDDE can estimate usage, but the provider dashboard is the source of truth.",
        links: [
          { label: "OpenAI pricing", href: "https://openai.com/api/pricing/" },
          { label: "OpenAI model compare", href: "https://platform.openai.com/docs/models/compare" },
          { label: "OpenAI production best practices", href: "https://platform.openai.com/docs/guides/production-best-practices" },
          { label: "OpenAI rate limits", href: "https://platform.openai.com/docs/guides/rate-limits" },
          { label: "Spend awareness (local)", href: "/usage" },
        ],
      },
      {
        id: "env",
        title: "Put the key in host env vars (not in the browser)",
        blurb:
          "For Vercel deployments: set your provider key as a server-side Environment Variable (e.g. OPENAI_API_KEY). This UI will never ask you to paste a key. Note: env vars are per-deployment, so Hosted mode is for your own deployment (BYOK), not a shared multi-tenant key vault.",
        links: [
          { label: "Vercel env vars", href: "https://vercel.com/docs/environment-variables" },
          { label: "Vercel Sensitive env vars", href: "https://vercel.com/docs/environment-variables/sensitive-environment-variables" },
        ],
      },
      {
        id: "verify",
        title: "Verify safely (no prompts, no secret fields)",
        blurb:
          "After you set env vars and redeploy, use the ping test. It checks configuration server-side without asking you to paste secrets into the browser.",
        links: [
          { label: "Test AI configuration", href: "/ai" },
          { label: "Deploy guide", href: "/docs/deploy" },
        ],
      },
    ],
    [],
  );

  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const j = safeParseJson(window.localStorage.getItem(LS_KEY));
    setDone(clampBoolMap(j));
  }, []);

  function setStep(id: string, v: boolean) {
    const next = { ...done, [id]: v };
    setDone(next);
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  const completed = steps.filter((s) => done[s.id]).length;
  const pct = Math.round((completed / Math.max(1, steps.length)) * 100);

  function clearProgress() {
    setDone({});
    try {
      window.localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <>
      <Panel title="AI Setup Wizard (non-custodial)">
        <p className="small">
          This is a checklist, not a key vault. Progress is stored locally on this device. No secrets are stored.
        </p>
        <div className="small" style={{ marginTop: 8 }}>
          Progress: <strong>{completed}</strong> / {steps.length} ({pct}%)
        </div>
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <a className="btn" href="/docs/ai-setup">
            Read the setup doc
          </a>
          <a className="btn" href="/usage">
            Spend awareness
          </a>
          <PrimaryButton onClick={clearProgress}>Reset checklist</PrimaryButton>
        </div>
        <div style={{ marginTop: 12 }}>
          <Callout title="Why no secret fields?" tone="info">
            Because browsers are not secret stores. Put keys in server-side environment variables (Vercel supports Sensitive env vars), then verify with the ping test.
          </Callout>
        </div>
      </Panel>

      {steps.map((s, i) => (
        <Panel key={s.id} title={`${i + 1}. ${s.title}`}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <p className="small" style={{ margin: 0, flex: 1, minWidth: 260 }}>
              {s.blurb}
            </p>
            <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={Boolean(done[s.id])}
                onChange={(e) => setStep(s.id, e.target.checked)}
              />
              Mark done
            </label>
          </div>

          {s.links?.length ? (
            <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              {s.links.map((l) => {
                const internal = l.href.startsWith("/");
                return (
                  <a
                    key={l.href}
                    className="btn"
                    href={l.href}
                    target={internal ? undefined : "_blank"}
                    rel={internal ? undefined : "noreferrer"}
                  >
                    {l.label}
                  </a>
                );
              })}
            </div>
          ) : null}

          {s.code ? (
            <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{s.code}</pre>
          ) : null}
        </Panel>
      ))}
    </>
  );
}
