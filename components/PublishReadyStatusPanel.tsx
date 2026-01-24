"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Panel } from "./Panel";
import { Callout } from "./Callout";
import { SecondaryButton } from "./Buttons";

type Gate = { label: string; ok: boolean; ms: number; status: number };
type Summary = {
  schema?: string;
  generated_at_utc?: string;
  app_version?: string;
  overall?: string;
  lockfile_present?: boolean;
  gates?: Gate[];
  schema_ok?: boolean;
  reports?: Record<string, any>;
  bundle_zip_sha256?: string;
};

type Tri = "pass" | "warn" | "fail";

function triFromOverall(x: any): Tri {
  const v = String(x || "").toLowerCase();
  if (v === "pass") return "pass";
  if (v === "warn") return "warn";
  if (v === "fail") return "fail";
  return "warn";
}

function pillClass(tri: Tri): string {
  return tri === "pass" ? "pill--success" : tri === "warn" ? "pill--warn" : "pill--error";
}

function shortSha(x: any): string {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.length <= 12 ? s : s.slice(0, 12) + "…";
}

async function readJsonFromFile(file: File): Promise<any> {
  const text = await file.text();
  return JSON.parse(text);
}

export function PublishReadyStatusPanel(props: { title?: string; subtitle?: string }) {
  const title = props.title || "Publish-ready evidence status";
  const subtitle = props.subtitle || "Loads the latest dist/publish_ready_summary.json (if present) or lets you upload it.";

  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string>("");

  async function loadFromPublic() {
    setError("");
    try {
      const url = `/dist/publish_ready_summary.json?t=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        setSummary(null);
        setError(`No published dist summary found at /dist/. Run: npm run publish_ready`);
        return;
      }
      const data = (await res.json()) as Summary;
      setSummary(data);
    } catch (e: any) {
      setSummary(null);
      setError(String(e?.message || e || "Failed to load summary"));
    }
  }

  useEffect(() => {
    loadFromPublic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tri = useMemo(() => triFromOverall(summary?.overall), [summary?.overall]);

  return (
    <Panel title={title} subtitle={subtitle}>
      {error ? (
        <Callout title="Evidence not found" tone="warn">
          <div className="small">{error}</div>
        </Callout>
      ) : null}

      <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <SecondaryButton onClick={loadFromPublic}>Reload</SecondaryButton>

        <SecondaryButton
          onClick={async () => {
            setError("");
            try {
              const res = await fetch(`/api/publish-ready/generate?mode=light&t=${Date.now()}`, { cache: "no-store" });
              if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j?.hint || j?.error || `HTTP ${res.status}`);
              }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `publish_ready_bundle__light.zip`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            } catch (e: any) {
              setError(String(e?.message || e || "Failed to download evidence ZIP"));
            }
          }}
        >
          Download evidence ZIP
        </SecondaryButton>

        <SecondaryButton
          onClick={async () => {
            setError("");
            try {
              const res = await fetch(`/api/publish-ready/generate?mode=full&t=${Date.now()}`, { cache: "no-store" });
              if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j?.hint || j?.error || `HTTP ${res.status}`);
              }
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `publish_ready_bundle__full.zip`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              await loadFromPublic();
            } catch (e: any) {
              setError(String(e?.message || e || "Failed to generate evidence bundle"));
            }
          }}
        >
          Generate evidence (local)
        </SecondaryButton>


        <label className="small" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <span>Upload summary</span>
          <input
            type="file"
            accept="application/json"
            onChange={async (e) => {
              try {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                const data = (await readJsonFromFile(f)) as Summary;
                setError("");
                setSummary(data);
              } catch (err: any) {
                setSummary(null);
                setError(String(err?.message || err || "Failed to parse JSON"));
              }
            }}
          />
        </label>

        <a className="small" href="/dist/publish_ready_report.md" target="_blank" rel="noreferrer">
          Open report
        </a>
      </div>

      {summary ? (
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
            <div>
              <div>
                <strong>Overall</strong> <span className={["pill", pillClass(tri)].join(" ")}>{tri.toUpperCase()}</span>
              </div>
              <div className="small" style={{ opacity: 0.9, marginTop: 4 }}>
                version: <code>{summary.app_version || "unknown"}</code> · generated:{" "}
                <code>{summary.generated_at_utc || "unknown"}</code>
              </div>
            </div>
            <div className="small" style={{ textAlign: "right" }}>
              bundle sha256: <code>{shortSha(summary.bundle_zip_sha256) || "(none)"}</code>
            </div>
          </div>

          <div style={{ marginTop: 12 }} className="codeBlock">
            <div className="small" style={{ padding: 10 }}>
              <div>
                lockfile: <code>{summary.lockfile_present ? "present" : "missing"}</code> · schema_ok:{" "}
                <code>{summary.schema_ok ? "true" : "false"}</code>
              </div>
              <div style={{ marginTop: 6 }}>
                gates:
                <ul style={{ marginTop: 6 }}>
                  {(summary.gates || []).map((g) => (
                    <li key={g.label}>
                      <code>{g.label}</code>: <code>{g.ok ? "PASS" : "FAIL"}</code> ({g.ms}ms)
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ marginTop: 6 }}>
                reports:
                <ul style={{ marginTop: 6 }}>
                  {Object.keys(summary.reports || {}).map((k) => (
                    <li key={k}>
                      <code>{k}</code>: <code>{String((summary.reports as any)[k])}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="small" style={{ opacity: 0.9, marginTop: 8 }}>
            Tip: <code>npm run publish_ready</code> copies the summary/report into <code>public/dist/</code> so the UI can display it.
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
