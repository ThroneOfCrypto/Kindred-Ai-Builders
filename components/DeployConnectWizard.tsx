"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "./Panel";
import { Callout } from "./Callout";
import { PrimaryButton, SecondaryButton } from "./Buttons";
import { TokenCostEstimator } from "./TokenCostEstimator";

import {
  buildDeploymentPackZipV1,
  loadDeployWizardStateV1,
  saveDeployWizardStateV1,
  type DeployAiModeV1,
  type DeployLaneV1,
  type DeployWizardStateV1,
} from "../lib/deploy_wizard";

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}

function safeFileName(s: string): string {
  const x = String(s || "")
    .trim()
    .replace(/[^a-z0-9\- _]+/gi, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return x || "deployment_pack";
}

export function DeployConnectWizard(props: { projectId: string; projectName: string }) {
  const pid = String(props.projectId || "").trim() || "default";
  const pname = String(props.projectName || "").trim() || pid;

  const [state, setState] = useState<DeployWizardStateV1>(() => {
    try {
      return loadDeployWizardStateV1(pid);
    } catch {
      return {
        schema: "kindred.deploy_wizard.v1",
        project_id: pid,
        updated_at_utc: new Date().toISOString(),
        lane: "vercel_github",
        ai_mode: "offline",
        openai_model: "gpt-4.1-mini",
        openai_base_url: "",
        include_secrets_in_export: false,
};
    }
  });

  // Secrets are never persisted. Keep keys in memory only.
  const [openaiApiKey, setOpenaiApiKey] = useState<string>("");

  const [notice, setNotice] = useState<{ tone: "info" | "warn" | "danger" | "success"; title: string; details?: string[] } | null>(null);

  useEffect(() => {
    try {
      setState(loadDeployWizardStateV1(pid));
    } catch {
      // ignore
    }
  }, [pid]);

  function patch(p: Partial<DeployWizardStateV1>) {
    setNotice(null);
    const next = saveDeployWizardStateV1(pid, p);
    setState(next);
  }

  const laneHelp = useMemo(() => {
    if (state.lane === "vercel_template") {
      return [
        "Fastest lane: upload-first web UI steps (GitHub upload + Vercel import).",
        "No git knowledge required, but you still own the repo and hosting account.",
        "Default stays offline (no keys).",
      ];
    }
    if (state.lane === "vercel_github") {
      return [
        "Standard lane: GitHub for source + Vercel for deploy.",
        "Good if you (or your helper) can push via git/GitHub Desktop.",
        "Default stays offline (no keys).",
      ];
    }
    if (state.lane === "vercel_cli") {
      return [
        "Local folder lane: deploy with Vercel CLI from the unzipped repo pack.",
        "Best for operators comfortable with terminals.",
        "Default stays offline (no keys).",
      ];
    }
    if (state.lane === "cloudflare") {
      return [
        "Free-first option (provider-specific steps live in an optional Kit).",
        "The output is still a standard repo ZIP.",
      ];
    }
    return [
      "Use any host that can run a Next.js repo.",
      "Keep env vars server-side; never expose secrets via NEXT_PUBLIC_.",
    ];
  }, [state.lane]);

  function onDownloadPack() {
    try {
      const keyMissing = Boolean(state.include_secrets_in_export) && !String(openaiApiKey || "").trim();
      if (keyMissing) {
        setNotice({
          tone: "warn",
          title: "No key provided",
          details: ["You checked 'include secrets in export' but left the key blank.", "The exported env.example will use replace_me."],
        });
      }

      const zip = buildDeploymentPackZipV1({ project_id: pid, project_name: pname, state, secrets: { openai_api_key: openaiApiKey } });
      const fname = `deployment_pack_${safeFileName(pname)}.zip`;
      downloadBytes(fname, zip, "application/zip");
      setNotice({ tone: "success", title: "Deployment Pack downloaded", details: ["Contains: env.example + deploy checklist + config JSON."] });
    } catch (e: any) {
      setNotice({ tone: "danger", title: "Failed to build Deployment Pack", details: [String(e?.message || e)] });
    }
  }

  async function testAiConfig() {
    setNotice({ tone: "info", title: "Testing AI config…" });
    try {
      const resp = await fetch("/api/ai/ping", { cache: "no-store" });
      const data: any = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setNotice({
          tone: "warn",
          title: "AI not ready",
          details: [String(data?.error || "Missing config"), ...(Array.isArray(data?.warnings) ? data.warnings : [])].slice(0, 12),
        });
        return;
      }
      const lines = [`mode=${data?.mode || "?"}`, `model=${data?.model || "?"}`, `has_key=${Boolean(data?.has_key)}`];
      const warns = Array.isArray(data?.warnings) ? data.warnings : [];
      setNotice({ tone: warns.length ? "warn" : "success", title: "AI config OK", details: lines.concat(warns).slice(0, 12) });
    } catch (e: any) {
      setNotice({ tone: "danger", title: "AI test failed", details: [String(e?.message || e)].slice(0, 12) });
    }
  }

  return (
    <Panel title="Connect & Deploy Wizard (optional)">
      <p className="small">
        This wizard does not connect to third-party accounts. It produces a portable <strong>Deployment Pack</strong> (a deterministic ZIP)
        with an <code>env.example</code> and a deploy checklist for your chosen lane.
      </p>

      {notice ? (
        <Callout title={notice.title} tone={notice.tone}>
          {notice.details && notice.details.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{notice.details.join("\n")}</pre> : null}
        </Callout>
      ) : null}

      <div className="grid2">
        <div>
          <div className="field">
            <label>Preferred deploy lane</label>
            <select value={state.lane} onChange={(e) => patch({ lane: e.target.value as DeployLaneV1 })}>
              <option value="vercel_template">Vercel (upload-first, web UI)</option>
              <option value="vercel_github">GitHub + Vercel (standard)</option>
              <option value="vercel_cli">Vercel CLI (local folder)</option>
              <option value="cloudflare">Cloudflare (free-first)</option>
              <option value="other">Other</option>
            </select>
            <div className="small" style={{ marginTop: 6 }}>
              {laneHelp.map((x) => (
                <div key={x}>{x}</div>
              ))}
            </div>
          </div>

          <div className="field">
            <label>AI mode (optional)</label>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              {(["offline", "hosted", "local"] as DeployAiModeV1[]).map((m) => (
                <label key={m} className="row" style={{ gap: 6, alignItems: "center" }}>
                  <input type="radio" checked={state.ai_mode === m} onChange={() => patch({ ai_mode: m })} />
                  <span style={{ textTransform: "uppercase" }}>{m}</span>
                </label>
              ))}
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              Hosted/local affects only server-side proposal routes (e.g., debug suggestions). Offline remains the default.
            </div>
          </div>

          {state.ai_mode !== "offline" ? (
            <>
              <div className="field">
                <label>Model (optional)</label>
                <input
                  value={state.openai_model || ""}
                  onChange={(e) => patch({ openai_model: e.target.value })}
                  placeholder="gpt-4.1-mini"
                />
                <div className="small" style={{ marginTop: 6 }}>
                  Used by the server-side AI client (if enabled). You can also set this directly in your deploy environment.
                </div>
              </div>

              {state.ai_mode === "local" ? (
                <div className="field">
                  <label>Local base URL</label>
                  <input
                    value={state.openai_base_url || ""}
                    onChange={(e) => patch({ openai_base_url: e.target.value })}
                    placeholder="http://localhost:1234/v1"
                  />
                  <div className="small" style={{ marginTop: 6 }}>
                    Local mode expects an OpenAI-compatible endpoint.
                  </div>
                </div>
              ) : null}

              <div className="field">
                <label>OPENAI_API_KEY (optional)</label>
                <input
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="(leave blank to export replace_me)"
                  type="password"
                  autoComplete="off"
                />
                <label className="row" style={{ gap: 8, alignItems: "center", marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(state.include_secrets_in_export)}
                    onChange={(e) => patch({ include_secrets_in_export: Boolean(e.target.checked) })}
                  />
                  <span className="small">Include this key in the exported Deployment Pack (not recommended unless you trust the destination)</span>
                </label>
              </div>
            </>
          ) : null}

          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <PrimaryButton onClick={onDownloadPack}>Download Deployment Pack</PrimaryButton>
            <SecondaryButton onClick={testAiConfig} disabled={state.ai_mode === "offline"}>
              Test AI config
            </SecondaryButton>
            <SecondaryButton href="/docs/deploy">Deploy docs</SecondaryButton>
            <SecondaryButton href="/docs/offline-first">Offline-first stance</SecondaryButton>
          </div>
        </div>

        <div>
          <div className="card" style={{ padding: 12, borderRadius: 14, border: "1px solid var(--border)", background: "var(--card)" }}>
            <strong>What you get</strong>
            <ul style={{ marginTop: 10 }}>
              <li>
                <code>DEPLOYMENT/env.example</code> — server-side env vars (AI mode wiring)
              </li>
              <li>
                <code>DEPLOYMENT/deploy_checklist.md</code> — a beginner-safe checklist (provider-neutral with optional lane hints)
              </li>
              <li>
                <code>DEPLOYMENT/deploy_config.v1.json</code> — the chosen lane + AI mode (portable metadata)
              </li>
            </ul>
            <div className="small" style={{ marginTop: 10 }}>
              You can commit these files into the deployed repo if you want, or keep them as an external checklist pack.
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <Callout title="Authority boundary" tone="info">
              Kindred never deploys for you and never silently edits code. It produces artefacts (packs, hashes, failure records) and optional AI proposals.
            </Callout>
          </div>

          <div style={{ marginTop: 12 }}>
            <Callout title="API keys (non-custodial)" tone="warn">
              Keys should live in your host's server-side env vars (Vercel Environment Variables, etc.), not in the browser.
              This wizard never persists keys. If you include a key in the export, treat the ZIP as sensitive.

              <div style={{ marginTop: 10 }} className="small">
                Beginner-safe setup (hosted AI):
                <ol style={{ marginTop: 6, paddingLeft: 18 }}>
                  <li>Create an OpenAI account, then create an API key in your dashboard.</li>
                  <li>Set a monthly budget / alert threshold so you don't get surprised by spend.</li>
                  <li>In Vercel, add <code>OPENAI_API_KEY</code> as a <em>sensitive</em> environment variable.</li>
                  <li>Deploy, then press <strong>Test AI config</strong> to confirm the server can reach your provider.</li>
                </ol>
              </div>

              <div style={{ marginTop: 10 }} className="small">
                Useful refs: 
                <a href="https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety" target="_blank" rel="noreferrer">
                  OpenAI key safety
                </a>
                {" · "}
                <a href="https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key" target="_blank" rel="noreferrer">
                  Find your API key
                </a>
                {" · "}
                <a href="https://openai.com/api/pricing/" target="_blank" rel="noreferrer">
                  OpenAI pricing
                </a>
                {" · "}
                <a href="https://platform.openai.com/settings/organization/limits" target="_blank" rel="noreferrer">
                  Budgets & limits
                </a>
                {" · "}
                <a href="https://vercel.com/docs/environment-variables/sensitive-environment-variables" target="_blank" rel="noreferrer">
                  Vercel sensitive env vars
                </a>
              </div>
            </Callout>
          </div>

          <div style={{ marginTop: 12 }}>
            <TokenCostEstimator title="Token cost estimator (placeholder)" defaultInputRatePer1M={0.8} defaultOutputRatePer1M={3.2} />
          </div>

        </div>
      </div>
    </Panel>
  );
}
