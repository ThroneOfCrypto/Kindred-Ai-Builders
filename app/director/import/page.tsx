"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Panel } from "../../../components/Panel";
import { FormErrorSummary, type FormError } from "../../../components/FormErrorSummary";

import { Callout } from "../../../components/Callout";
import { LocalNetworkAccessHelp, isLikelyLocalNetworkAccessBlock } from "../_components/local_network_access_help";

type AiConnection = {
  v: 1;
  mode: "local_connector" | "local_ollama";
  connector_url?: string;
  ollama_url?: string;
  primary_provider?: string;
  preferred_engine?: "fast" | "reasoning" | "coding";
  preferred_provider_id?: string;
  pairing_code?: string;
  connected: boolean;
  updated_at: string;
};

type BrownfieldState = {
  v: 1;
  git_url?: string;
  ref?: string | null;
  local_root?: string;
  receipt?: any;
  inventory?: {
    artifacts?: {
      route_map?: any;
      spel_skeleton?: string;
      report_md?: string;
    };
  };
  spec_pack?: any;
  updated_at: string;
};

const AI_KEY_V1 = "kindred.ai.connection.v1";
const AI_KEY_V2 = "kindred.ai.connection.v2";
const BF_KEY = "kindred.brownfield.v1";
const AI_OPTOUT_KEY = "kindred.ai.opt_out.v1";

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: any, pairingCode?: string, extraHeaders?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 40_000);
  try {
    const res = await fetch(url, {
      ...( { targetAddressSpace: "loopback" } as any ),
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(pairingCode ? { "x-kindred-pairing": pairingCode } : {}),
        ...(extraHeaders || {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const rid = res.headers.get("x-kindred-request-id");
    const j = await res.json().catch(async () => {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: "connector_bad_response", details: [txt || `HTTP ${res.status}`] };
    });
    if (rid && j && typeof j === "object") {
      (j as any).request_id = rid;
    }
    if (!res.ok) {
      const err = {
        ok: false,
        error: j?.error || `http_${res.status}`,
        details: Array.isArray(j?.details) ? j.details : [],
        request_id: rid || undefined,
      } as any;
      if (res.status && !err.details.includes(`HTTP ${res.status}`)) err.details.unshift(`HTTP ${res.status}`);
      return err;
    }
    return j;
  } catch (e: any) {
    clearTimeout(t);
    const raw = String(e?.message || e || "");
    const isTimeout = String(e?.name || "").includes("Abort");
    const details: string[] = [];
    if (isTimeout) {
      details.push("The connector did not respond in time.");
      details.push("Confirm it is running and not busy, then try again.");
      return { ok: false, error: "timeout", details };
    }
    details.push("Could not reach the local connector.");
    if (/private network|Access-Control-Allow-Private-Network|blocked|failed to fetch/i.test(raw)) {
      details.push("Your browser may be blocking local network requests (PNA / Local Network Access)." );
      details.push("If prompted, allow Local Network Access." );
    }
    details.push("Confirm the connector is running on this computer and the pairing code is correct." );
    return { ok: false, error: "network_error", details };
  }
}

async function postFormData(url: string, form: FormData, pairingCode?: string, extraHeaders?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 80_000);
  try {
    const res = await fetch(url, {
      ...( { targetAddressSpace: "loopback" } as any ),
      method: "POST",
      headers: {
        ...(pairingCode ? { "x-kindred-pairing": pairingCode } : {}),
        ...(extraHeaders || {}),
      },
      body: form,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const rid = res.headers.get("x-kindred-request-id");
    const j = await res.json().catch(async () => {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: "connector_bad_response", details: [txt || `HTTP ${res.status}`] };
    });
    if (rid && j && typeof j === "object") {
      (j as any).request_id = rid;
    }
    if (!res.ok) {
      return { ok: false, error: j?.error || "http_error", status: res.status, ...j };
    }
    return j;
  } catch (e: any) {
    clearTimeout(t);
    if (String(e?.name || "") === "AbortError") return { ok: false, error: "timeout" };
    return { ok: false, error: "fetch_failed" };
  }
}

export default function DirectorImportPage() {
  const ai = useMemo(() => {
    const v2 = safeJsonParse<AiConnection>(localStorage.getItem(AI_KEY_V2));
    if (v2 && (v2 as any).connected) return v2;
    const v1 = safeJsonParse<AiConnection>(localStorage.getItem(AI_KEY_V1));
    return v1;
  }, []);
  const existing = useMemo(() => safeJsonParse<BrownfieldState>(localStorage.getItem(BF_KEY)), []);

  const [gitUrl, setGitUrl] = useState(existing?.git_url || "");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "confirm" | "ingest" | "inventory" | "specify" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string>("");
  const showLnaHelp = useMemo(() => isLikelyLocalNetworkAccessBlock(msg), [msg]);
  const [formErrors, setFormErrors] = useState<FormError[]>([]);

  const formatConnectorFail = (r: any) => {
    const err = String(r?.error || "unknown");
    const rid = String((r as any)?.request_id || "").trim();
    const suf = rid ? ` [req:${rid.slice(0, 8)}]` : "";
    if (err === "busy") return "connector_busy (another operation is in progress)" + suf;
    if (err === "rate_limited") {
      const ms = Number(r?.retry_after_ms || 0);
      const s = ms > 0 ? Math.ceil(ms / 1000) : 0;
      return (s ? `rate_limited (try again in ~${s}s)` : "rate_limited") + suf;
    }
    if (err === "pairing_rate_limited") {
      const ms = Number(r?.retry_after_ms || 0);
      const s = ms > 0 ? Math.ceil(ms / 1000) : 0;
      return (s ? `pairing_rate_limited (wait ~${s}s then try again)` : "pairing_rate_limited") + suf;
    }
    if (err === "payload_too_large") {
      const max = Number(r?.max_bytes || 0);
      return (max ? `payload_too_large (max ~${max} bytes)` : "payload_too_large") + suf;
    }
    const details = Array.isArray(r?.details) ? r.details.filter(Boolean).map((x: any) => String(x)) : [];
    if (!details.length) return err + suf;
    return `${err} — ${details.join(" ")}` + suf;
  };

  const errorById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const e of formErrors || []) {
      const id = String((e as any)?.id || '').trim();
      if (!id) continue;
      const msg = String((e as any)?.message || '').trim();
      if (msg) out[id] = msg;
    }
    return out;
  }, [formErrors]);

  const gitUrlDesc = errorById["git_url"] ? "err_git_url hint_git_url" : "hint_git_url";

  const progressLines = useMemo(() => {
    if (!busy) return [];
    const lead = (s: string) => (stage === s ? "→ " : "   ");
    const lines = [
      lead("confirm") + "Confirming import in connector",
      lead("ingest") + "Cloning repo locally",
      lead("inventory") + "Scanning routes and risks",
    ];
    if (stage === "specify") {
      lines.push(lead("specify") + "Generating a draft spec pack");
    }
    return lines;
  }, [busy, stage]);

  const [aiOptOut, setAiOptOut] = useState<boolean>(false);
  const [bf, setBf] = useState<BrownfieldState | null>(existing || null);

  const signals = useMemo(() => {
    const spel = String(bf?.inventory?.artifacts?.spel_skeleton || "");
    const report = String(bf?.inventory?.artifacts?.report_md || "");
    const blob = (spel + "\n" + report).toLowerCase();
    const hasAuth = /auth|login|session|jwt|oauth/.test(blob);
    const hasMoney = /payment|checkout|invoice|billing|stripe|paypal/.test(blob);
    const hasModeration = /moderation|appeal|ban|report abuse|flag/.test(blob);
    const hasIntegrations = /webhook|integration|third[- ]party|oauth/.test(blob);
    return { hasAuth, hasMoney, hasModeration, hasIntegrations };
  }, [bf]);

  const executiveBrief = useMemo(() => {
    const routes = Array.isArray(bf?.inventory?.artifacts?.route_map?.routes) ? bf!.inventory!.artifacts!.route_map!.routes.length : 0;
    const hasSpec = Boolean(bf?.inventory?.artifacts?.spel_skeleton);
    const hasReport = Boolean(bf?.inventory?.artifacts?.report_md);

    const typeBits: string[] = [];
    if (signals.hasMoney) typeBits.push("payments");
    if (signals.hasAuth) typeBits.push("accounts");
    if (signals.hasModeration) typeBits.push("moderation");
    if (signals.hasIntegrations) typeBits.push("integrations");

    const appType = typeBits.length ? typeBits.join(" + ") : "general web app";

    const complexity = routes >= 120 ? "high" : routes >= 40 ? "medium" : "low";

    // Heuristic recommendations only (bootstrap, non-authoritative).
    const recommendation =
      complexity === "high"
        ? "Keep the structure, but generate a spec pack and refactor carefully. High route count suggests more hidden coupling."
        : complexity === "medium"
        ? "Generate a spec pack and rebuild the core journey around it. You can keep useful modules and migrate gradually."
        : "This is small enough to rebuild cleanly from a spec pack, while preserving any valuable UI pieces.";

    // NOTE: we cannot rely on any specific connector report format, so we only suggest common risk areas.
    const riskNotes: string[] = [];
    if (signals.hasMoney) {
      riskNotes.push("Payment lifecycle: refunds/undo, idempotency, and audit trails must be explicit.");
    }
    if (signals.hasModeration) {
      riskNotes.push("Moderation: reporting + appeals need clear states and safe destructive actions.");
    }
    if (signals.hasIntegrations) {
      riskNotes.push("Integrations: retries, idempotency keys, and webhook verification are common failure points.");
    }
    riskNotes.push("Ops hygiene: migrations + backups + rollback plan (especially before shipping).");

    return {
      routes,
      appType,
      complexity,
      hasSpec,
      hasReport,
      recommendation,
      riskNotes,
    };
  }, [bf, signals]);


  const hasGeneratedSpecPack = Boolean((bf as any)?.spec_pack?.spec);

  const connectorBase = ai?.connector_url || "http://127.0.0.1:6174";
  const allowStart = Boolean(ai?.connected || aiOptOut);

  // AI opt-out is explicit. Default posture is AI-first.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AI_OPTOUT_KEY);
      setAiOptOut(raw === "1" || raw === "true");
    } catch {
      setAiOptOut(false);
    }
  }, []);

  useEffect(() => {
    if (!ai?.connected && !aiOptOut) {
      setMsg("AI not connected yet.");
    }
  }, [ai, aiOptOut]);

  function persist(next: BrownfieldState) {
    localStorage.setItem(BF_KEY, JSON.stringify(next));
    setBf(next);
  }

  async function runImport() {
    if (!ai?.connected) return;
    const url = String(gitUrl || "").trim();
    const errs: FormError[] = [];
    if (!url) {
      errs.push({ id: "git_url", message: "Paste a GitHub repository URL (example: https://github.com/org/repo)." });
    } else if (!/^https?:\/\/github\.com\/[^\/]+\/[^\/]+/.test(url)) {
      errs.push({ id: "git_url", message: "That does not look like a GitHub repo URL. Use https://github.com/<owner>/<repo>." });
    }
    if (errs.length) {
      setFormErrors(errs);
      setMsg("");
      return;
    }
    setFormErrors([]);

    setBusy(true);
    setStage("confirm");
    setMsg("Cloning and scanning your codebase… (locally)");
    try {
      const conf = await postJson(`${connectorBase}/v1/confirm`, { scope: "brownfield_ingest" }, ai?.pairing_code);
      if (!conf?.ok) {
        setMsg(`Import failed: ${formatConnectorFail(conf)}`);
        setStage("error");
        setBusy(false);
        return;
      }

      setStage("ingest");
      const ingest = await postJson(`${connectorBase}/v1/brownfield/ingest/github`, { git_url: url }, ai?.pairing_code, { "x-kindred-confirm": conf.token });
      if (!ingest?.ok) {
        setMsg(`Import failed: ${formatConnectorFail(ingest)}`);
        setStage("error");
        setBusy(false);
        return;
      }
      const root = String(ingest.local_path || "");

      setStage("inventory");
      const confInv = await postJson(`${connectorBase}/v1/confirm`, { scope: "brownfield_inventory" }, ai?.pairing_code);
      if (!confInv?.ok || !confInv?.token) {
        setMsg(`Scan failed: ${formatConnectorFail(confInv)}`);
        setStage("error");
        setBusy(false);
        return;
      }
      const inventory = await postJson(`${connectorBase}/v1/brownfield/inventory`, { root }, ai?.pairing_code, { "x-kindred-confirm": String(confInv.token) });
      if (!inventory?.ok) {
        setMsg(`Scan failed: ${formatConnectorFail(inventory)}`);
        setStage("error");
        setBusy(false);
        return;
      }
      const next: BrownfieldState = {
        v: 1,
        git_url: url,
        local_root: root,
        receipt: ingest.receipt,
        inventory,
        spec_pack: existing?.spec_pack || null,
        updated_at: new Date().toISOString(),
      };
      persist(next);
      setStage("done");
      setMsg("Imported. We extracted routes and a draft spec skeleton.");
    } catch (e: any) {
      setStage("error");
      setMsg(`Import failed: ${e?.message || "unknown"}`);
    }
    setBusy(false);
  }

  async function runImportZip() {
    if (!ai?.connected) return;
    const f = zipFile;
    const errs: FormError[] = [];
    if (!f) {
      errs.push({ id: "zip_file", message: "Choose a ZIP file to import." });
    } else if (!String(f.name || "").toLowerCase().endsWith(".zip")) {
      errs.push({ id: "zip_file", message: "That file does not look like a .zip archive." });
    } else if (f.size > 25 * 1024 * 1024) {
      errs.push({ id: "zip_file", message: "ZIP is too large. Max 25MB." });
    }
    if (errs.length) {
      setFormErrors(errs);
      setMsg("");
      return;
    }
    setFormErrors([]);

    setBusy(true);
    setStage("confirm");
    setMsg("Importing and scanning your codebase… (locally)");
    try {
      const conf = await postJson(`${connectorBase}/v1/confirm`, { scope: "brownfield_ingest" }, ai?.pairing_code);
      if (!conf?.ok || !conf?.token) {
        setMsg(`Import failed: ${formatConnectorFail(conf)}`);
        setStage("error");
        setBusy(false);
        return;
      }

      setStage("ingest");
      const form = new FormData();
      form.append("file", f as any, f.name);
      const ingest = await postFormData(`${connectorBase}/v1/brownfield/ingest/archive`, form, ai?.pairing_code, { "x-kindred-confirm": String(conf.token) });
      if (!ingest?.ok) {
        setMsg(`Import failed: ${formatConnectorFail(ingest)}`);
        setStage("error");
        setBusy(false);
        return;
      }
      const root = String(ingest.local_path || "");

      setStage("inventory");
      const confInv = await postJson(`${connectorBase}/v1/confirm`, { scope: "brownfield_inventory" }, ai?.pairing_code);
      if (!confInv?.ok || !confInv?.token) {
        setMsg(`Scan failed: ${formatConnectorFail(confInv)}`);
        setStage("error");
        setBusy(false);
        return;
      }
      const inventory = await postJson(`${connectorBase}/v1/brownfield/inventory`, { root }, ai?.pairing_code, { "x-kindred-confirm": String(confInv.token) });
      if (!inventory?.ok) {
        setMsg(`Scan failed: ${formatConnectorFail(inventory)}`);
        setStage("error");
        setBusy(false);
        return;
      }
      const next: BrownfieldState = {
        v: 1,
        git_url: `zip:${f.name}`,
        local_root: root,
        receipt: ingest.receipt,
        inventory,
        spec_pack: existing?.spec_pack || null,
        updated_at: new Date().toISOString(),
      };
      persist(next);
      setStage("done");
      setMsg("Imported. We extracted routes and a draft spec skeleton.");
    } catch (e: any) {
      setStage("error");
      setMsg(`Import failed: ${e?.message || "unknown"}`);
    }
    setBusy(false);
  }

  async function generateSpec() {
    if (!ai?.connected) return;
    if (!bf?.inventory?.artifacts) return;
    setBusy(true);
    setStage("specify");
    setMsg("Generating a draft spec pack from your app…");
    try {
      const conf = await postJson(`${connectorBase}/v1/confirm`, { scope: "specify_generate" }, ai?.pairing_code);
      if (!conf?.ok || !conf?.token) {
        setMsg(`Spec generation failed: ${formatConnectorFail(conf)}`);
        setStage("error");
        setBusy(false);
        return;
      }

      const out = await postJson(
        `${connectorBase}/v1/specify`,
        {
          engine: ai?.preferred_engine || "reasoning",
          provider: ai?.primary_provider || "auto",
          provider_id: ai?.preferred_provider_id || undefined,
          model: ((ai as any)?.model_id && (ai as any).model_id !== "auto") ? (ai as any).model_id : "",
          brownfield: {
            git_url: bf.git_url || null,
            route_map: bf.inventory.artifacts.route_map || null,
            spel_skeleton: bf.inventory.artifacts.spel_skeleton || "",
            report_md: bf.inventory.artifacts.report_md || "",
          },
        },
        ai?.pairing_code,
        { "x-kindred-confirm": String(conf.token) }
      );
      if (!out?.ok) {
        setMsg(`Spec generation failed: ${formatConnectorFail(out)}`);
        setStage("error");
        setBusy(false);
        return;
      }
      const next: BrownfieldState = {
        ...(bf as any),
        spec_pack: out,
        updated_at: new Date().toISOString(),
      };
      persist(next);
      setStage("done");
      setMsg("Draft spec created. The journey will use it for proposals.");
    } catch (e: any) {
      setStage("error");
      setMsg(`Spec generation failed: ${e?.message || "unknown"}`);
    }
    setBusy(false);
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Start or import</h1>
        <p>
          If you already have an app, we can reverse-engineer a draft spec and use it to generate proposals.
        </p>
      </div>

      <FormErrorSummary title="Fix these" errors={formErrors} />

      {!ai?.connected ? (
        <Callout title={aiOptOut ? "AI not connected (limited mode)" : "Connect AI"} tone={aiOptOut ? "info" : "warn"}>
          <p className="small" style={{ margin: 0 }}>
            {aiOptOut
              ? "You can start without AI, but proposals will be template-based and import/specify is disabled."
              : "This journey is AI-first. Connect AI to generate real proposals and import existing apps."}
          </p>
          <div style={{ marginTop: 10 }} className="row" >
            <a className="btn" href="/director/connect-ai">Connect AI</a>
            {aiOptOut ? <a className="btn secondary" href="/director/journey">Start new (limited)</a> : null}
          </div>
        </Callout>
      ) : null}

      {msg ? (
        <Callout title="Status" tone={msg.includes("failed") ? "warn" : "info"}>
          <p className="small" style={{ margin: 0 }}>{msg}</p>
        </Callout>
      ) : null}

      {showLnaHelp ? <LocalNetworkAccessHelp connectorUrl={ai?.connector_url || "http://127.0.0.1:6174"} /> : null}

      <div className="grid">
        <Panel title="Start from scratch">
          <p className="small">
            You’ll answer a few quick questions and we’ll propose 3–7 approaches you can preview.
          </p>
          {allowStart ? (
            <a className="btn" href="/director/journey">Start new</a>
          ) : (
            <a className="btn" href="/director/connect-ai">Connect AI to start</a>
          )}
        </Panel>

        <Panel title="Import an existing app (GitHub)">
          <p className="small">
            Paste your repo link. The scan runs on your computer through the local connector. Nothing is uploaded to Kindred.
          </p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <input
              className="input"
              id="git_url"
              aria-invalid={Boolean(errorById["git_url"])}
              aria-describedby={gitUrlDesc}
              placeholder="https://github.com/you/your-repo"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              style={{ minWidth: 260, flex: 1 }}
            />
            <button className="btn" onClick={runImport} disabled={busy || !ai?.connected} type="button">
              Import
            </button>
          </div>

          <div id="hint_git_url" className="small" style={{ opacity: 0.85, marginTop: 6 }}>
            Tip: paste the full repo URL (e.g. <code>https://github.com/owner/repo</code>). Private repos work if your connector can authenticate.
          </div>

          {errorById["git_url"] ? (
            <div id="err_git_url" className="fieldError small">{errorById["git_url"]}</div>
          ) : null}

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
            <p className="small" style={{ marginTop: 0 }}>
              Or upload a <b>.zip</b> export of your codebase. This stays local on your machine.
            </p>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <input
                className="input"
                id="zip_file"
                type="file"
                accept=".zip,application/zip"
                aria-invalid={Boolean(errorById["zip_file"])}
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                  setZipFile(f);
                }}
                style={{ minWidth: 260, flex: 1 }}
              />
              <button className="btn" onClick={runImportZip} disabled={busy || !ai?.connected} type="button">
                Import ZIP
              </button>
            </div>

            {errorById["zip_file"] ? (
              <div id="err_zip_file" className="fieldError small">{errorById["zip_file"]}</div>
            ) : null}
          </div>

          {busy && progressLines.length ? (
            <div style={{ marginTop: 10 }}>
              <Callout title="Working…" tone="info" details={progressLines} />
            </div>
          ) : null}

          {bf?.inventory?.artifacts ? (
            <div style={{ marginTop: 12 }}>
              <Callout title="What we found" tone="success">
                <ul className="small" style={{ margin: 0 }}>
                  <li>Pages/screens discovered: {Array.isArray(bf.inventory.artifacts.route_map?.routes) ? bf.inventory.artifacts.route_map.routes.length : 0}</li>
                  <li>Draft spec skeleton: {bf.inventory.artifacts.spel_skeleton ? "generated" : "missing"}</li>
                  <li>Risk scan report: {bf.inventory.artifacts.report_md ? "generated" : "missing"}</li>
                  <li>
                    Signals: accounts {signals.hasAuth ? "yes" : "no"}, payments {signals.hasMoney ? "yes" : "no"}, moderation {signals.hasModeration ? "yes" : "no"}, integrations {signals.hasIntegrations ? "yes" : "no"}
                  </li>
                </ul>
              </Callout>

              <div style={{ marginTop: 10 }}>
                <Callout title="Executive brief (non-authoritative)" tone="info">
                  <div className="small" style={{ marginBottom: 8 }}>
                    <strong>Next steps:</strong>
                    <ul style={{ marginTop: 6, marginBottom: 0 }}>
                      <li>Continue to proposals and we will use this import as your starting point.</li>
                      <li>Optionally generate a spec pack (recommended for anything medium or high complexity).</li>
                      <li>When ready, Ship to download your pack or export it to GitHub.</li>
                    </ul>
                  </div>
                  <p className="small" style={{ margin: 0 }}>
                    This repo looks like a <strong>{executiveBrief.appType}</strong> with <strong>{executiveBrief.routes}</strong> pages/screens discovered.
                    Complexity appears <strong>{executiveBrief.complexity}</strong>.
                  </p>
                  <div style={{ marginTop: 8 }} className="small">
                    <strong>Recommendation:</strong> {executiveBrief.recommendation}
                  </div>
                  <ul className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                    {executiveBrief.riskNotes.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </Callout>
              </div>


              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <a className="btn" href="/director/journey">Continue (use this import)</a>
                <button
                  className="btn secondary"
                  onClick={generateSpec}
                  disabled={busy || !ai?.connected || hasGeneratedSpecPack}
                  type="button"
                >
                  {hasGeneratedSpecPack ? "Spec pack already generated" : "Generate spec pack (optional)"}
                </button>
              </div>

              <details style={{ marginTop: 10 }}>
                <summary className="small">Preview extracted draft spec</summary>
                <pre className="pre" style={{ marginTop: 10 }}>
                  <code>{bf.inventory.artifacts.spel_skeleton?.slice(0, 8000) || ""}</code>
                </pre>
              </details>

              {bf?.spec_pack?.spec ? (
                <details style={{ marginTop: 10 }}>
                  <summary className="small">Preview generated spec pack</summary>
                  <pre className="pre" style={{ marginTop: 10 }}>
                    <code>{JSON.stringify(bf.spec_pack.spec, null, 2).slice(0, 8000)}</code>
                  </pre>
                </details>
              ) : null}

              <details style={{ marginTop: 10 }}>
                <summary className="small">Preview scan report</summary>
                <pre className="pre" style={{ marginTop: 10 }}>
                  <code>{bf.inventory.artifacts.report_md?.slice(0, 8000) || ""}</code>
                </pre>
              </details>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
