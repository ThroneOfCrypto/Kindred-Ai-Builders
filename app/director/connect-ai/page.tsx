"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { FormErrorSummary, type FormError } from "../../../components/FormErrorSummary";
import { LocalNetworkAccessHelp, isLikelyLocalNetworkAccessBlock } from "../_components/local_network_access_help";

const AI_CONN_KEY_V1 = "kindred.ai.connection.v1";
const AI_CONN_KEY_V2 = "kindred.ai.connection.v2";
const AI_OPTOUT_KEY = "kindred.ai.opt_out.v1";

type EnginePref = "fast" | "reasoning" | "coding";

type BrandId = "google" | "openai" | "anthropic" | "xai" | "deepseek" | "ollama";

type AiConnV2 = {
  v: 2;
  connected: boolean;
  connector_url: string;
  pairing_code: string;

  // Director-facing choices (no internal jargon)
  brand_id: BrandId;
  connection_kind: "subscription" | "api_key" | "local";
  connection_method: "cli_login" | "env_key" | "local_ollama";
  model_id: string; // exact model selection ("auto" allowed)
  preferred_engine: EnginePref;

  // Hidden-ish routing for the connector
  primary_provider: "auto";
  preferred_provider_id: string; // gemini_cli | openai_codex_cli | claude_code_cli | ...

  updated_at: string;
};

type Health = {
  ok: boolean;
  connector: { version?: string };
  adapters: { id: string; available: boolean; kind: string; auth?: string; engine?: string[]; label?: string }[];
};

const CONNECTOR_BASE_DEFAULT = "http://127.0.0.1:6174";

type ConnectorFetchResult = {
  ok: boolean;
  status: number;
  request_id?: string;
  json: any;
};

async function connectorFetchJson(url: string, init: any, timeoutMs = 8000): Promise<ConnectorFetchResult> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...( { targetAddressSpace: "loopback" } as any ),
      cache: "no-store",
      ...init,
      signal: ac.signal,
    });
    const rid = String(res.headers.get("x-kindred-request-id") || "").trim() || undefined;
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      const txt = await res.text().catch(() => "");
      json = { ok: false, error: "connector_bad_response", details: [txt || `HTTP ${res.status}`] };
    }
    return { ok: Boolean(res.ok && json?.ok), status: res.status, request_id: rid, json };
  } catch (e: any) {
    const isTimeout = String(e?.name || "").includes("Abort");
    return {
      ok: false,
      status: 0,
      json: {
        ok: false,
        error: isTimeout ? "timeout" : "network_error",
        details: [isTimeout ? "Connector did not respond in time." : "Could not reach the local connector."],
      },
    };
  } finally {
    clearTimeout(t);
  }
}


const SUBSCRIPTION_BRANDS: { id: BrandId; label: string; provider_id: string; help: string }[] = [
  {
    id: "google",
    label: "Google (Gemini CLI)",
    provider_id: "gemini_cli",
    help: "Best default for fast + general work via subscription login.",
  },
  {
    id: "openai",
    label: "OpenAI (Codex CLI)",
    provider_id: "openai_codex_cli",
    help: "Best for coding-heavy work via ChatGPT sign-in.",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude Code)",
    provider_id: "claude_code_cli",
    help: "Strong for reasoning + code review via Claude subscription.",
  },
];

const ADVANCED_KEY_BRANDS: { id: BrandId; label: string; provider_id: string; env: string; help: string }[] = [
  {
    id: "xai",
    label: "xAI (Grok API)",
    provider_id: "xai_grok_api",
    env: "XAI_API_KEY",
    help: "OpenAI-compatible REST, but requires an API key on the connector.",
  },
  {
    id: "deepseek",
    label: "DeepSeek (API)",
    provider_id: "deepseek_api",
    env: "DEEPSEEK_API_KEY",
    help: "Key-based. Good value. Still advanced because secrets never enter the browser.",
  },
  {
    id: "openai",
    label: "OpenAI (API key)",
    provider_id: "openai_api",
    env: "OPENAI_API_KEY",
    help: "Programmatic API key. Advanced only.",
  },
];

const LOCAL_BRANDS: { id: BrandId; label: string; provider_id: string; help: string }[] = [
  { id: "ollama", label: "Local (Ollama)", provider_id: "ollama_local", help: "Runs models on your machine. No subscription login." },
];

const MODELS: Record<BrandId, { id: string; label: string }[]> = {
  google: [
    { id: "auto", label: "Auto (recommended)" },
    { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    { id: "gemini-2.5-flash-lite", label: "gemini-2.5-flash-lite" },
    { id: "gemini-3-pro-preview", label: "gemini-3-pro-preview" },
    { id: "gemini-3-flash-preview", label: "gemini-3-flash-preview" },
  ],
  openai: [
    { id: "auto", label: "Auto (recommended)" },
    { id: "gpt-5-codex", label: "gpt-5-codex" },
    { id: "gpt-5", label: "gpt-5" },
    { id: "gpt-5-mini", label: "gpt-5-mini" },
    { id: "gpt-5.1-codex", label: "gpt-5.1-codex" },
    { id: "gpt-5.1-codex-mini", label: "gpt-5.1-codex-mini" },
    { id: "gpt-4.1", label: "gpt-4.1" },
  ],
  anthropic: [
    { id: "auto", label: "Auto (recommended)" },
    { id: "claude-opus-4-1", label: "claude-opus-4-1" },
    { id: "claude-opus-4-0", label: "claude-opus-4-0" },
    { id: "claude-sonnet-4-0", label: "claude-sonnet-4-0" },
    { id: "claude-3-7-sonnet", label: "claude-3-7-sonnet" },
  ],
  xai: [{ id: "auto", label: "Auto (env default)" }, { id: "grok-4", label: "grok-4" }, { id: "grok-code-fast-1", label: "grok-code-fast-1" }],
  deepseek: [{ id: "auto", label: "Auto (env default)" }, { id: "deepseek-reasoner", label: "deepseek-reasoner" }, { id: "deepseek-chat", label: "deepseek-chat" }],
  ollama: [{ id: "auto", label: "Auto (first local model)" }],
};

function readAiConnection(): AiConnV2 | null {
  try {
    const raw = localStorage.getItem(AI_CONN_KEY_V2);
    if (raw) {
      const j = JSON.parse(raw);
      if (j?.v === 2) return j as AiConnV2;
    }
  } catch {
    // ignore
  }

  // Upgrade v1 on-the-fly (best effort)
  try {
    const raw1 = localStorage.getItem(AI_CONN_KEY_V1);
    if (!raw1) return null;
    const j = JSON.parse(raw1);
    if (!j || typeof j !== "object") return null;

    const next: AiConnV2 = {
      v: 2,
      connected: Boolean(j.connected),
      connector_url: String(j.connector_url || CONNECTOR_BASE_DEFAULT),
      pairing_code: String(j.pairing_code || ""),
      brand_id: "google",
      connection_kind: "subscription",
      connection_method: "cli_login",
      model_id: "auto",
      preferred_engine: (j.preferred_engine as EnginePref) || "fast",
      primary_provider: "auto",
      preferred_provider_id: String(j.preferred_provider_id || ""),
      updated_at: String(j.updated_at || new Date().toISOString()),
    };
    localStorage.setItem(AI_CONN_KEY_V2, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

function persistAiConnection(next: AiConnV2) {
  localStorage.setItem(AI_CONN_KEY_V2, JSON.stringify(next));
  try {
    window.dispatchEvent(new CustomEvent("kindred_ai_connection_changed"));
  } catch {
    // ignore
  }
}

export default function ConnectAiPage() {
  const [connectorUrl, setConnectorUrl] = useState<string>(CONNECTOR_BASE_DEFAULT);
  const [pairing, setPairing] = useState<string>("");

  const [brand, setBrand] = useState<BrandId>("google");
  // Provider route is the real selector (brand can map to multiple routes in Advanced mode).
  const [providerId, setProviderId] = useState<string>("gemini_cli");
  const [engine, setEngine] = useState<EnginePref>("fast");
  const [model, setModel] = useState<string>("auto");

  const [advanced, setAdvanced] = useState<boolean>(false);

  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [msg, setMsg] = useState<string>("");
  const [pairingMismatch, setPairingMismatch] = useState<boolean>(false);

  const [formErrors, setFormErrors] = useState<FormError[]>([]);

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

  const [existing, setExisting] = useState<AiConnV2 | null>(null);
  const [continueHref, setContinueHref] = useState<string>("/director/start");

  useEffect(() => {
    // Preserve intent when the Director was redirected here.
    // Only allow safe internal routes.
    try {
      const u = new URL(window.location.href);
      const nxt = String(u.searchParams.get("next") || "").trim();
      if (nxt && nxt.startsWith("/director") && !/^https?:/i.test(nxt)) {
        setContinueHref(nxt);
      }
    } catch {
      // ignore
    }

    const refresh = () => {
      try {
        setExisting(readAiConnection());
      } catch {
        setExisting(null);
      }
    };
    refresh();
    const on = () => refresh();
    window.addEventListener("kindred_ai_connection_changed", on as any);
    window.addEventListener("storage", on as any);
    return () => {
      window.removeEventListener("kindred_ai_connection_changed", on as any);
      window.removeEventListener("storage", on as any);
    };
  }, []);

  useEffect(() => {
    if (!existing) return;
    setConnectorUrl(existing.connector_url || CONNECTOR_BASE_DEFAULT);
    setPairing(existing.pairing_code || "");
    setBrand(existing.brand_id || "google");
    setProviderId(existing.preferred_provider_id || (existing.brand_id === "openai" ? "openai_codex_cli" : existing.brand_id === "anthropic" ? "claude_code_cli" : existing.brand_id === "ollama" ? "ollama_local" : "gemini_cli"));
    setEngine(existing.preferred_engine || "fast");
    setModel(existing.model_id || "auto");
  }, [existing]);

  useEffect(() => {
    // Advanced is subscription-first: if Advanced is OFF, forcibly snap back to a subscription route.
    if (!advanced) {
      const subIds = SUBSCRIPTION_BRANDS.map((b) => b.provider_id);
      if (!subIds.includes(String(providerId || ""))) {
        // If the current brand has a subscription route, keep the brand but reset route.
        const sub = SUBSCRIPTION_BRANDS.find((b) => b.id === brand) || SUBSCRIPTION_BRANDS[0];
        setBrand(sub.id);
        setProviderId(sub.provider_id);
      }
    }
  }, [advanced, brand, providerId]);

  useEffect(() => {
    // If you toggle advanced, keep the current model selection sane.
    const allowed = MODELS[brand] || [{ id: "auto", label: "Auto" }];
    if (!allowed.find((x) => x.id === model)) {
      setModel("auto");
    }
  }, [brand, model]);

  async function refreshHealth(opts?: { silent?: boolean }) {
    const silent = Boolean(opts?.silent);
    if (!silent) setMsg("");
    let rid = "";
    try {
      const out = await connectorFetchJson(`${connectorUrl.replace(/\/$/, "")}/health`, {
        method: "GET",
      }, 6000);
      rid = String(out.request_id || "");
      const j = out.json as any;
      if (!out.ok || !j?.ok) throw new Error(String(j?.error || "health_failed"));
      setHealth(j as Health);
    } catch (e: any) {
      setHealth(null);
      const m = String(e?.message || e || "");
      const hint: string[] = [];
      hint.push(`Could not reach local connector at ${connectorUrl}.`);

      // Browser-side diagnostics only (connector remains the authority).
      // Common failure: PNA / local network access restrictions.
      if (/private network|Access-Control-Allow-Private-Network|blocked|failed to fetch/i.test(m)) {
        hint.push("Your browser may be blocking local network requests.");
        hint.push("If prompted, allow Local Network Access.");
        hint.push("Also confirm the connector is running and that its CORS headers allow this site.");
      } else {
        hint.push("Confirm the connector is running on this computer, then refresh.");
      }

      if (!silent) {
        const suf = rid ? ` [req:${rid.slice(0, 8)}]` : "";
        setMsg(hint.join(" ") + suf);
      }
    }
  }

  useEffect(() => {
    refreshHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscriptionOptions = SUBSCRIPTION_BRANDS;
  const advancedKeyOptions = ADVANCED_KEY_BRANDS;
  const localOptions = LOCAL_BRANDS;

  const chosenProviderId = providerId;

  const connectionKind = useMemo(() => {
    if (chosenProviderId === "ollama_local") return "local" as const;
    if (chosenProviderId === "xai_grok_api" || chosenProviderId === "deepseek_api" || chosenProviderId === "openai_api") return "api_key" as const;
    return "subscription" as const;
  }, [chosenProviderId]);

  const connectionMethod = useMemo(() => {
    if (connectionKind === "local") return "local_ollama" as const;
    if (connectionKind === "api_key") return "env_key" as const;
    return "cli_login" as const;
  }, [connectionKind]);

  const connectedForSelection = useMemo(() => {
    if (!existing?.connected) return false;
    const u1 = String(existing.connector_url || "").replace(/\/$/, "");
    const u2 = String(connectorUrl || "").replace(/\/$/, "");
    if (u1 && u2 && u1 !== u2) return false;
    if (existing.preferred_provider_id && chosenProviderId && existing.preferred_provider_id !== chosenProviderId) return false;
    if (existing.brand_id && brand && existing.brand_id !== brand) return false;
    return true;
  }, [brand, chosenProviderId, connectorUrl, existing]);

  const showLnaHelp = useMemo(() => isLikelyLocalNetworkAccessBlock(msg), [msg]);

  const providerStatus = useMemo(() => {
    const list = Array.isArray(health?.adapters) ? health!.adapters : [];
    return list.find((x) => x.id === chosenProviderId) || null;
  }, [health, chosenProviderId]);

  async function connect() {
    const errs: FormError[] = [];
    const u = String(connectorUrl || "").trim();
    if (!/^https?:\/\//.test(u)) {
      errs.push({ id: "connector_url", message: "Enter a valid connector URL (example: http://127.0.0.1:6174)." });
    }

    // Non-custodial BYOK safety posture: the connector is local-first.
    // This avoids accidentally pointing at a remote box (and keeps browser security predictable).
    try {
      const parsed = new URL(u);
      const host = String(parsed.hostname || "").toLowerCase();
      const okHost = host === "127.0.0.1" || host === "localhost" || host === "::1";
      if (!okHost) {
        errs.push({
          id: "connector_url",
          message: "Connector URL must be local (127.0.0.1 / localhost / ::1). The connector holds secrets and should run on this computer.",
        });
      }
    } catch {
      // handled by the protocol check above
    }
    if (!String(pairing || "").trim()) {
      errs.push({ id: "pairing_code", message: "Enter your pairing code from the connector." });
    }
    if (!String(chosenProviderId || "").trim()) {
      errs.push({ id: "provider", message: "Choose a provider route first." });
    }
    if (errs.length) {
      setFormErrors(errs);
      setMsg("");
      return;
    }

    setFormErrors([]);
    setBusy(true);
    setMsg("");

    try {
      let j: any = null;
      // 1) Health check
      const healthOut = await connectorFetchJson(`${connectorUrl.replace(/\/$/, "")}/health`, {
        method: "GET",
      }, 6000);
      const healthRid = String(healthOut.request_id || "");
      const healthJ = healthOut.json as any;
      if (!healthOut.ok || !healthJ?.ok) {
        const suf = healthRid ? ` [req:${healthRid.slice(0, 8)}]` : "";
        const err = String(healthJ?.error || "health_failed");
        if (err === "timeout") {
          setMsg("Connector health check timed out. Confirm the connector is running on this computer, then try again." + suf);
        } else if (err === "network_error") {
          setMsg("Could not reach the connector. Confirm it is running on this computer, then try again." + suf);
        } else {
          setMsg("Connector health check failed. Confirm the connector is running on this computer." + suf);
        }
        return;
      }
      j = healthJ;
      setHealth(healthJ as Health);


      // 2) Verify chosen provider is available/configured (no silent fallback)
      const adapters = Array.isArray(j?.adapters) ? j.adapters : [];
      const chosen = adapters.find((a: any) => a?.id === chosenProviderId);
      if (!chosen || !chosen.available) {
        setMsg(
          connectionKind === "api_key"
            ? "That provider is not configured on your connector. Set the required environment variable and restart the connector."
            : "That provider is not available on this computer. Install the CLI and sign in, then refresh."
        );
        return;
      }

      // 3) Pairing proof (origin binding lives in the connector)
      const pairOut = await connectorFetchJson(`${connectorUrl.replace(/\/$/, "")}/v1/pairing/check`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-kindred-pairing": String(pairing || "") },
        body: JSON.stringify({ ok: true }),
      }, 8000);
      const pairRid = String(pairOut.request_id || "");
      const pairJ = pairOut.json as any;
      if (!pairOut.ok || !pairJ?.ok) {
        const err = String(pairJ?.error || "").trim();
        const suf = pairRid ? ` [req:${pairRid.slice(0, 8)}]` : "";
        if (err === "paired_origin_mismatch") {
          setPairingMismatch(true);
          const expected = String(pairJ?.expected_origin || "").trim();
          setMsg(
            expected
              ? `This pairing code is bound to a different browser Origin (${expected}). Rotate the pairing code to rebind it to this window.` + suf
              : "This pairing code is bound to a different browser Origin. Rotate the pairing code to rebind it to this window." + suf
          );
        } else if (err === "timeout") {
          setPairingMismatch(false);
          setMsg("Pairing check timed out. Confirm the connector is running, then try again." + suf);
        } else if (err === "network_error") {
          setPairingMismatch(false);
          setMsg("Could not reach the connector for pairing check. Confirm it is running, then try again." + suf);
        } else {
          setPairingMismatch(false);
          setMsg("Pairing code rejected. Rotate pairing code and try again." + suf);
        }
        return;
      }
      setPairingMismatch(false);

      const next: AiConnV2 = {
        v: 2,
        connected: true,
        connector_url: connectorUrl.replace(/\/$/, ""),
        pairing_code: String(pairing || ""),

        brand_id: brand,
        connection_kind: connectionKind,
        connection_method: connectionMethod,
        model_id: String(model || "auto"),
        preferred_engine: engine,

        primary_provider: "auto",
        preferred_provider_id: chosenProviderId,

        updated_at: new Date().toISOString(),
      };

      persistAiConnection(next);
      setPairingMismatch(false);
      setMsg("Connected. Your journey will use this provider (no silent fallbacks)." );
    } catch (e: any) {
      setMsg(`Connect failed: ${e?.message || "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  async function rotatePairing() {
    setBusy(true);
    setMsg("");
    try {
      const rotOut = await connectorFetchJson(`${connectorUrl.replace(/\/$/, "")}/v1/pairing/rotate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-kindred-pairing": String(pairing || "") },
        body: JSON.stringify({ ok: true }),
      }, 10000);
      const rid = String(rotOut.request_id || "");
      const j = rotOut.json as any;
      if (!rotOut.ok || !j?.ok || !j?.pairing_code) {
        const suf = rid ? ` [req:${rid.slice(0, 8)}]` : "";
        setMsg(`Rotate failed: ${j?.error || "unknown"}` + suf);
        return;
      }
      const nextCode = String(j.pairing_code);
      setPairing(nextCode);

      // Persist rotation into the saved AI connection, so the Director doesn't
      // end up "connected" with a dead pairing code.
      try {
        const cur = readAiConnection();
        if (cur?.v === 2) {
          const next: AiConnV2 = {
            ...cur,
            connector_url: connectorUrl.replace(/\/$/, ""),
            pairing_code: nextCode,
            updated_at: new Date().toISOString(),
          };
          persistAiConnection(next);
          setExisting(next);
        }
      } catch {
        // ignore
      }

      // Best-effort: re-check health + pairing immediately.
      // This makes recovery obvious (no manual refresh ritual).
      await refreshHealth({ silent: true });
      // Verify pairing immediately
      const verifyOut = await connectorFetchJson(`${connectorUrl.replace(/\/$/, "")}/v1/pairing/check`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-kindred-pairing": nextCode },
        body: JSON.stringify({ ok: true }),
      }, 8000);
      const vrid = String(verifyOut.request_id || "");
      const cj = verifyOut.json as any;
      if (!verifyOut.ok || !cj?.ok) {
        const err = String(cj?.error || "").trim();
        const suf = vrid ? ` [req:${vrid.slice(0, 8)}]` : "";
        if (err === "paired_origin_mismatch") {
          setPairingMismatch(true);
          const expected = String(cj?.expected_origin || "").trim();
          setMsg(
            expected
              ? `Pairing rotated, but this code is still bound to a different Origin (${expected}). Rotate again in this window.` + suf
              : "Pairing rotated, but this code is still bound to a different Origin. Rotate again in this window." + suf
          );
        } else if (err === "timeout") {
          setPairingMismatch(false);
          setMsg("Pairing rotated and saved, but verification timed out. Refresh connector status when ready." + suf);
        } else if (err === "network_error") {
          setPairingMismatch(false);
          setMsg("Pairing rotated and saved, but the connector could not be reached to verify. Refresh when ready." + suf);
        } else {
          setPairingMismatch(false);
          setMsg("Pairing rotated, but verification failed. Try again, or refresh connector status." + suf);
        }
        return;
      }
      setPairingMismatch(false);
      setMsg("Pairing code rotated, verified, and saved. This window is now the bound Origin.");
    } catch (e: any) {
      setMsg(`Rotate failed: ${e?.message || "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  const brandListForUI = useMemo(() => {
    // Default: subscription brands only.
    const base = subscriptionOptions;
    if (!advanced) return base;
    // Advanced shows keys + local too (but still keeps subscription path first).
    return [...base, ...advancedKeyOptions, ...localOptions];
  }, [advanced]);

  const selectedBrandMeta = useMemo(() => {
    const all = [...SUBSCRIPTION_BRANDS, ...ADVANCED_KEY_BRANDS, ...LOCAL_BRANDS] as any[];
    return (
      all.find((x) => x.id === brand && x.provider_id === chosenProviderId) ||
      all.find((x) => x.id === brand) ||
      null
    );
  }, [brand, chosenProviderId]);

  const selectedBrandLabel = String((selectedBrandMeta as any)?.label || brand);
  const selectedModelLabel = useMemo(() => {
    const list = MODELS[brand] || [{ id: 'auto', label: 'Auto' }];
    return String(list.find((m) => m.id === model)?.label || model || 'auto');
  }, [brand, model]);

  const connectorDesc = errorById["connector_url"] ? "err_connector_url hint_connector_url" : "hint_connector_url";
  const pairingDesc = errorById["pairing_code"] ? "err_pairing_code hint_pairing_code" : "hint_pairing_code";

  function enableAiOptOutAndContinue() {
    try {
      localStorage.setItem(AI_OPTOUT_KEY, "1");
    } catch {
      // ignore
    }
    window.location.href = continueHref;
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Connect AI</h1>
        <p>
          This product is AI-first. Your browser never holds secrets. Your local connector does the work on your device.
        </p>
      </div>

      <FormErrorSummary title="Fix these to connect" errors={formErrors} />

      {existing?.connected ? (
        <Callout
          title="Already connected"
          tone="success"
          details={[
            `Brand: ${selectedBrandLabel}`,
            `Model: ${selectedModelLabel}`,
            pairing ? `Pairing: ${pairing}` : "Pairing: (not set)",
            "You can continue, or rotate the pairing code if anything feels off.",
          ]}
        >
          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <a className="btn" href={continueHref}>Continue</a>
            <button className="btn secondary" onClick={rotatePairing} disabled={busy || !pairing} type="button">
              Rotate pairing
            </button>
          </div>
        </Callout>
                  ) : null}

      {msg ? (
        <Callout title="Status" tone={msg.toLowerCase().includes("failed") || msg.toLowerCase().includes("rejected") ? "warn" : "info"}>
          <p className="small" style={{ margin: 0 }}>{msg}</p>
          {pairingMismatch ? (
            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn secondary" onClick={rotatePairing} disabled={busy || !pairing} type="button">
                Rotate pairing
              </button>
            </div>
          ) : null}
        </Callout>
                  ) : null}

      {showLnaHelp ? <LocalNetworkAccessHelp connectorUrl={connectorUrl} /> : null}

      <div className="grid">
        <Panel title="1) Local connector">
          <p className="small">
            Must be running on your computer. This is where subscription logins and API keys live.
          </p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <input
              className="input"
              id="connector_url"
              aria-invalid={Boolean(errorById["connector_url"])}
              aria-describedby={connectorDesc}
              value={connectorUrl}
              onChange={(e) => setConnectorUrl(e.target.value)}
              placeholder={CONNECTOR_BASE_DEFAULT}
              style={{ minWidth: 260, flex: 1 }}
            />
            <button className="btn secondary" onClick={refreshHealth} disabled={busy} type="button">
              Refresh
            </button>
          </div>

          <div id="hint_connector_url" className="small" style={{ opacity: 0.85, marginTop: 6 }}>
            Tip: the default is <code>http://127.0.0.1:6174</code>. If this fails, your connector is not running or is blocked.
          </div>

          {errorById["connector_url"] ? (
            <div id="err_connector_url" className="fieldError small">{errorById["connector_url"]}</div>
                  ) : null}

          {health?.ok ? (
            <div style={{ marginTop: 10 }}>
              <Callout title="Connector reachable" tone="success">
                <ul className="small" style={{ margin: 0 }}>
                  <li>Version: {health.connector?.version || "(unknown)"}</li>
                  <li>Adapters detected: {Array.isArray(health.adapters) ? health.adapters.length : 0}</li>
                </ul>
              </Callout>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <Callout title="Not reachable" tone="warn">
                <p className="small" style={{ margin: 0 }}>
                  If this is wrong, your connector is not running or blocked. This is the top cause of Director pain.
                </p>
              </Callout>
            </div>
          )}
        </Panel>

        <Panel title="2) Pairing code">
          <p className="small">This binds your browser session to your connector. Rotate it if anything feels off.</p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <input
              className="input"
              id="pairing_code"
              aria-invalid={Boolean(errorById["pairing_code"])}
              aria-describedby={pairingDesc}
              value={pairing}
              onChange={(e) => setPairing(e.target.value)}
              placeholder="Pairing code"
              style={{ minWidth: 220, flex: 1 }}
            />
            <button className="btn secondary" onClick={rotatePairing} disabled={busy || !pairing} type="button">
              Rotate
            </button>
          </div>

          <div id="hint_pairing_code" className="small" style={{ opacity: 0.85, marginTop: 6 }}>
            Tip: open the connector window and copy the pairing code shown there. Rotate it if you ever suspect something is off.
          </div>

          {errorById["pairing_code"] ? (
            <div id="err_pairing_code" className="fieldError small">{errorById["pairing_code"]}</div>
                  ) : null}
        </Panel>
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        <Panel title="3) Choose provider (brand → subscription → model)">
          <p className="small">
            Default path is subscription login. API keys are hidden behind Advanced and only live on the connector.
          </p>

          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <label className="small" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
              Advanced (API keys, routers)
            </label>

            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <span className="small" style={{ opacity: 0.8 }}>Engine preference</span>
              <select className="input" value={engine} onChange={(e) => setEngine(e.target.value as EnginePref)} style={{ maxWidth: 220 }}>
                <option value="fast">Fast</option>
                <option value="reasoning">Reasoning</option>
                <option value="coding">Coding</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              {brandListForUI.map((b) => (
                <button
                  key={`${b.id}:${(b as any).provider_id}`}
                  type="button"
                  className={"btn " + (brand === b.id && chosenProviderId === (b as any).provider_id ? "" : "secondary")}
                  onClick={() => {
                    setBrand(b.id);
                    setProviderId((b as any).provider_id || "");
                    const allow = MODELS[b.id] || [{ id: "auto", label: "Auto" }];
                    if (!allow.find((x) => x.id === model)) setModel("auto");
                  }}
                >
                  {(b as any).label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <Callout title="Selected" tone="info">
                <ul className="small" style={{ margin: 0 }}>
                  <li>Brand: <strong>{selectedBrandLabel}</strong></li>
                  <li>Connection: <strong>{connectionKind === "subscription" ? "Subscription login" : connectionKind === "api_key" ? "API key (connector-only)" : "Local"}</strong></li>
                  <li>Method: <strong>{connectionMethod === "cli_login" ? "CLI login" : connectionMethod === "env_key" ? "API key in connector env" : "Local Ollama"}</strong></li>
                  <li>Model: <strong>{selectedModelLabel}</strong></li>
                  {advanced ? (
                    <li>Provider route: <strong>{chosenProviderId || "(missing)"}</strong></li>
                  ) : null}
                </ul>
              </Callout>
            </div>

            {advanced && (brand === "xai" || brand === "deepseek" || chosenProviderId === "openai_api") ? (
              <div style={{ marginTop: 10 }}>
                <Callout title="Advanced key mode" tone="warn">
                  <p className="small" style={{ margin: 0 }}>
                    Keys never enter the browser. Set the required environment variable on the connector machine and restart it.
                  </p>
                </Callout>
              </div>
                  ) : null}

            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              <span className="small" style={{ opacity: 0.8 }}>Exact model</span>
              <select className="input" value={model} onChange={(e) => setModel(e.target.value)} style={{ minWidth: 240, flex: 1 }}>
                {(MODELS[brand] || [{ id: "auto", label: "Auto" }]).map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            {providerStatus ? (
              <div style={{ marginTop: 10 }}>
                <Callout title="Availability" tone={providerStatus.available ? "success" : "warn"}>
                  <p className="small" style={{ margin: 0 }}>
                    {providerStatus.available ? "Detected on this connector." : "Not available on this connector."}
                    {providerStatus.label ? ` (${providerStatus.label})` : ""}
                  </p>
                </Callout>
              </div>
                  ) : null}

            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              {!connectedForSelection ? (
                <button className="btn" onClick={connect} disabled={busy || !health?.ok || !pairing || !chosenProviderId} type="button">
                  Connect
                </button>
              ) : (
                <a className="btn" href={continueHref}>Continue</a>
              )}

              {!connectedForSelection ? (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={enableAiOptOutAndContinue}
                  disabled={busy}
                >
                  Continue without AI (limited)
                </button>
                  ) : null}
            </div>
          </div>
        </Panel>

        <Panel title="What this stores">
          <p className="small">
            We store only your chosen provider route, engine preference, model selection, and pairing code (in your browser storage).
            Secrets stay off the website.
          </p>
          <details>
            <summary className="small">Show stored connection JSON</summary>
            <pre className="pre" style={{ marginTop: 10 }}>
              <code>{JSON.stringify({
                v: 2,
                connector_url: connectorUrl.replace(/\/$/, ""),
                pairing_code: pairing,
                brand_id: brand,
                connection_kind: connectionKind,
                model_id: model,
                preferred_engine: engine,
                preferred_provider_id: chosenProviderId,
              }, null, 2)}</code>
            </pre>
          </details>
        </Panel>
      </div>
    </div>
  );
}
