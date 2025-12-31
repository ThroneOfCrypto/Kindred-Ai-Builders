"use client";

import { useMemo, useState } from "react";

export type AiConnector = {
  mode: "offline" | "hosted" | "local";
  hosted?: { base_url: string; default_model: string };
  local?: { base_url: string; default_model: string };
  policy?: { confirm_before_spend: boolean; daily_spend_cap_usd: number | null };
};

export default function AiConnectorsWizard(props: {
  value: AiConnector;
  onChange: (next: AiConnector) => void;
}) {
  const v = props.value;

  const hostedBase = v.hosted?.base_url ?? "https://api.openai.com/v1";
  const hostedModel = v.hosted?.default_model ?? "gpt-4.1-mini";

  const localBase = v.local?.base_url ?? "http://localhost:11434/v1";
  const localModel = v.local?.default_model ?? "llama3.1";

  const confirmBeforeSpend = v.policy?.confirm_before_spend ?? true;
  const dailyCap = v.policy?.daily_spend_cap_usd ?? null;

  const [testResult, setTestResult] = useState<string>("");

  const testBaseUrl = useMemo(() => {
    if (v.mode === "hosted") return hostedBase;
    if (v.mode === "local") return localBase;
    return "";
  }, [v.mode, hostedBase, localBase]);

  async function runTest() {
    setTestResult("Testing…");
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: v.mode, baseUrl: testBaseUrl })
      });

      const text = await res.text();
      setTestResult(text);
    } catch (e: any) {
      setTestResult(e?.message ?? String(e));
    }
  }

  function patch(next: Partial<AiConnector>) {
    props.onChange({ ...v, ...next });
  }

  function patchPolicy(next: Partial<NonNullable<AiConnector["policy"]>>) {
    const policy = v.policy ?? { confirm_before_spend: true, daily_spend_cap_usd: null };
    props.onChange({ ...v, policy: { ...policy, ...next } });
  }

  return (
    <div className="card">
      <h3>AI Connectors (Optional)</h3>
      <p className="small">
        Offline is the default. If you enable Hosted, the API key must be stored in your environment (Codespaces/Vercel),
        not inside this project.
      </p>

      <div className="card">
        <div className="row">
          <label className="small">Mode</label>
          <select
            className="btn"
            value={v.mode}
            onChange={(e) => patch({ mode: (e.target.value === "hosted" || e.target.value === "local") ? e.target.value : "offline" })}
          >
            <option value="offline">offline</option>
            <option value="hosted">hosted (OpenAI-compatible)</option>
            <option value="local">local (OpenAI-compatible)</option>
          </select>
        </div>

        {v.mode === "hosted" && (
          <div className="card">
            <div className="row">
              <label className="small">Hosted base URL</label>
              <input
                className="btn"
                value={hostedBase}
                onChange={(e) => patch({ hosted: { base_url: e.target.value, default_model: hostedModel } })}
              />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="small">Default model</label>
              <input
                className="btn"
                value={hostedModel}
                onChange={(e) => patch({ hosted: { base_url: hostedBase, default_model: e.target.value } })}
              />
            </div>
            <p className="small" style={{ marginTop: 10 }}>
              Environment variables required:
              <br />• AI_MODE=hosted
              <br />• OPENAI_API_KEY=...
            </p>
          </div>
        )}

        {v.mode === "local" && (
          <div className="card">
            <div className="row">
              <label className="small">Local base URL</label>
              <input
                className="btn"
                value={localBase}
                onChange={(e) => patch({ local: { base_url: e.target.value, default_model: localModel } })}
              />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="small">Default model</label>
              <input
                className="btn"
                value={localModel}
                onChange={(e) => patch({ local: { base_url: localBase, default_model: e.target.value } })}
              />
            </div>
            <p className="small" style={{ marginTop: 10 }}>
              Environment variables recommended:
              <br />• AI_MODE=local
              <br />• AI_LOCAL_BASE_URL=http://localhost:11434/v1
            </p>
          </div>
        )}

        <hr />

        <div className="card">
          <h3>Guardrails (optional)</h3>
          <div className="row">
            <label className="small">Confirm before spend</label>
            <select
              className="btn"
              value={confirmBeforeSpend ? "yes" : "no"}
              onChange={(e) => patchPolicy({ confirm_before_spend: e.target.value === "yes" })}
            >
              <option value="yes">yes</option>
              <option value="no">no</option>
            </select>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <label className="small">Daily spend cap (USD)</label>
            <input
              className="btn"
              value={dailyCap === null ? "" : String(dailyCap)}
              placeholder="e.g. 5"
              onChange={(e) => {
                const raw = e.target.value.trim();
                const n = raw === "" ? null : Number(raw);
                patchPolicy({ daily_spend_cap_usd: Number.isFinite(n as any) ? (n as any) : null });
              }}
            />
          </div>
        </div>

        <div className="row">
          <button className="btn" onClick={runTest} disabled={v.mode === "offline"}>
            Test connector
          </button>
          <span className="small">Calls /models on the selected base URL.</span>
        </div>

        {testResult && (
          <div className="card">
            <div className="small">Test result</div>
            <pre className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{testResult}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
