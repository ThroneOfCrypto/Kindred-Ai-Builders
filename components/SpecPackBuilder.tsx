"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type StepId =
  | "launch-path"
  | "basics"
  | "brownfield"
  | "palettes"
  | "design"
  | "ai-connectors"
  | "review";

type Tradeoffs = {
  speed_vs_quality: number;     // -5..+5 (higher = quality)
  simple_vs_powerful: number;   // -5..+5 (higher = powerful)
  cheap_vs_reliable: number;    // -5..+5 (higher = reliable)
  flexible_vs_safe: number;     // -5..+5 (higher = safe)
};

type Actor = { id: string; label: string };
type Scene = { id: string; label: string; actor_id: string };

type AiMode = "offline" | "hosted" | "local";

type AiConfig = {
  mode: AiMode;
  hosted_model: string;       // for hosted
  local_base_url: string;     // for local
  local_model: string;        // for local
};

type BuilderState = {
  schema: "kindred.builder_state.v1";
  updated_at_utc: string;

  launch_path_id: string;

  product_name: string;
  one_liner: string;

  brownfield_repo_url: string;

  palettes: string[];
  tradeoffs: Tradeoffs;

  actors: Actor[];
  scenes: Scene[];

  ai: AiConfig;
};

const STORAGE_KEY = "kindred_builder_state_v1";

const PALETTES: { id: string; label: string; help: string }[] = [
  { id: "identity_access", label: "Identity & Access", help: "Auth, roles, permissions, accounts." },
  { id: "communication_social", label: "Communication & Social Surfaces", help: "Messaging, feeds, notifications." },
  { id: "content_media", label: "Content & Media", help: "Pages, posts, media, publishing pipelines." },
  { id: "knowledge_learning", label: "Knowledge & Learning", help: "Docs, onboarding, guided flows, learning loops." },
  { id: "search_discovery", label: "Search / Navigation & Discovery", help: "Search, browse, information architecture." },
  { id: "matching_recommendation", label: "Matching & Recommendation", help: "Personalization and recommendations." },
  { id: "collaboration_work", label: "Collaboration & Work", help: "Projects, tasks, teamwork, workflows." },
  { id: "commerce_value", label: "Commerce & Value Exchange", help: "Billing, credits, pricing, payments." },
  { id: "governance_policy", label: "Governance / Rules & Policy", help: "Rules, policies, moderation, governance." },
  { id: "reputation_trust_safety", label: "Reputation / Trust & Safety", help: "Abuse prevention, reputation, safety controls." },
  { id: "game_incentives", label: "Game & Incentive Mechanics", help: "Points, rewards, mechanics, incentives." },
  { id: "automation_agents", label: "Automation / Agents / Workflows", help: "Automations, agents, background jobs." },
  { id: "infrastructure_data_files", label: "Infrastructure / Data / Files", help: "Storage, files, data model, ops." },
  { id: "connection_integration", label: "Connection / Integration", help: "APIs, webhooks, integrations." }
];

function nowUtcIso(): string {
  return new Date().toISOString();
}

function defaultState(): BuilderState {
  return {
    schema: "kindred.builder_state.v1",
    updated_at_utc: nowUtcIso(),

    launch_path_id: "quick_saas_v1",

    product_name: "",
    one_liner: "",

    brownfield_repo_url: "",

    palettes: ["content_media", "collaboration_work", "automation_agents"],
    tradeoffs: {
      speed_vs_quality: 1,
      simple_vs_powerful: 1,
      cheap_vs_reliable: 1,
      flexible_vs_safe: 1
    },

    actors: [{ id: "actor_user", label: "User" }],
    scenes: [{ id: "scene_onboarding", label: "Onboarding", actor_id: "actor_user" }],

    ai: {
      mode: "offline",
      hosted_model: "gpt-4.1-mini",
      local_base_url: "http://localhost:11434/v1",
      local_model: "llama3.1:8b"
    }
  };
}

function safeParseState(raw: string | null): BuilderState | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<BuilderState>;
    if (!obj || obj.schema !== "kindred.builder_state.v1") return null;
    return obj as BuilderState;
  } catch {
    return null;
  }
}

function isBrownfieldLaunchPath(launchPathId: string): boolean {
  // Keep this simple for now; we can refine later once the launch_paths catalog is richer.
  return (
    launchPathId.includes("brownfield") ||
    launchPathId.includes("upgrade") ||
    launchPathId.includes("rebuild") ||
    launchPathId.startsWith("website_")
  );
}

function stepsFor(launchPathId: string): StepId[] {
  const base: StepId[] = ["launch-path", "basics", "palettes", "design", "ai-connectors", "review"];
  if (isBrownfieldLaunchPath(launchPathId)) {
    return ["launch-path", "basics", "brownfield", "palettes", "design", "ai-connectors", "review"];
  }
  return base;
}

function hrefFor(step: StepId): string {
  switch (step) {
    case "launch-path": return "/builder/launch-path";
    case "basics": return "/builder/basics";
    case "brownfield": return "/builder/brownfield";
    case "palettes": return "/builder/palettes";
    case "design": return "/builder/design";
    case "ai-connectors": return "/builder/ai-connectors";
    case "review": return "/builder/review";
  }
}

function clampTradeoff(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < -5) return -5;
  if (n > 5) return 5;
  return Math.trunc(n);
}

async function downloadSpecPack(payload: any): Promise<void> {
  const res = await fetch("/api/spec-pack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spec pack export failed (${res.status}): ${text || "Unknown error"}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sdde_spec_pack.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function SpecPackBuilder(props: { activeStep: StepId }) {
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<BuilderState>(() => defaultState());

  // Load once (client-side) from localStorage
  useEffect(() => {
    const loaded = safeParseState(localStorage.getItem(STORAGE_KEY));
    if (loaded) setState(loaded);
    setHydrated(true);
  }, []);

  // Persist on change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updated_at_utc: nowUtcIso() }));
  }, [hydrated, state]);

  const steps = useMemo(() => stepsFor(state.launch_path_id), [state.launch_path_id]);

  // If user is on a step that no longer exists due to launch path change, bounce them.
  useEffect(() => {
    if (!hydrated) return;
    if (!steps.includes(props.activeStep)) {
      router.push(hrefFor("basics"));
    }
  }, [hydrated, props.activeStep, router, steps]);

  const stepIndex = Math.max(0, steps.indexOf(props.activeStep));
  const stepNumber = stepIndex + 1;

  function go(step: StepId) {
    router.push(hrefFor(step));
  }

  function goNext() {
    const i = steps.indexOf(props.activeStep);
    if (i < 0) return;
    const next = steps[i + 1];
    if (next) go(next);
  }

  function goBack() {
    const i = steps.indexOf(props.activeStep);
    if (i <= 0) return;
    const prev = steps[i - 1];
    if (prev) go(prev);
  }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    setState(defaultState());
    router.push(hrefFor("launch-path"));
  }

  const canNext = useMemo(() => {
    if (!hydrated) return false;

    switch (props.activeStep) {
      case "launch-path":
        return !!state.launch_path_id;
      case "basics":
        return state.product_name.trim().length > 0 && state.one_liner.trim().length > 0;
      case "brownfield":
        // allow skipping if user doesn't know yet; we still store it if they do
        return true;
      case "palettes":
        return state.palettes.length > 0;
      case "design":
        return state.actors.length > 0 && state.scenes.length > 0;
      case "ai-connectors":
        return true;
      case "review":
        return false;
    }
  }, [hydrated, props.activeStep, state]);

  const canBack = useMemo(() => {
    if (!hydrated) return false;
    return steps.indexOf(props.activeStep) > 0;
  }, [hydrated, props.activeStep, steps]);

  const title = useMemo(() => {
    switch (props.activeStep) {
      case "launch-path": return "Launch Path";
      case "basics": return "Basics";
      case "brownfield": return "Brownfield Target";
      case "palettes": return "Palettes & Tradeoffs";
      case "design": return "Design (Actors & Scenes)";
      case "ai-connectors": return "AI Connectors";
      case "review": return "Review & Export";
    }
  }, [props.activeStep]);

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>SDDE Builder</h1>
          <p style={{ marginTop: 8, opacity: 0.85 }}>
            Page-by-page wizard. Your progress is saved automatically.
          </p>
        </div>
        <button
          onClick={resetAll}
          style={{ border: "1px solid #ccc", padding: "8px 10px", borderRadius: 8, background: "white",
                      color: "#111", cursor: "pointer" }}
          aria-label="Start over"
          title="Start over"
        >
          Start over
        </button>
      </div>

      <div style={{ marginTop: 18, padding: 14, border: "1px solid #e5e5e5", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Step {stepNumber} of {steps.length}</div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {hydrated ? "Saved" : "Loading…"}
          </div>
        </div>
      </div>

      {/* Step content */}
      <section style={{ marginTop: 18 }}>
        {props.activeStep === "launch-path" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ opacity: 0.85 }}>
              Choose what you want to build. This choice determines which steps appear next.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {[
                { id: "quick_saas_v1", label: "Quick SaaS", help: "Ship a small SaaS with clear surfaces, actors, and flows." },
                { id: "website_rebuild_greenfield_v1", label: "Website (Greenfield)", help: "Design a new website from scratch." },
                { id: "website_upgrade_brownfield_v1", label: "Upgrade Existing Website (Brownfield)", help: "Start from an existing repo and upgrade it." }
              ].map((lp) => {
                const selected = state.launch_path_id === lp.id;
                return (
                  <button
                    key={lp.id}
                    onClick={() => setState((s) => ({ ...s, launch_path_id: lp.id, updated_at_utc: nowUtcIso() }))}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      borderRadius: 10,
                      border: selected ? "2px solid #111" : "1px solid #ddd",
                      background: "white",
                      color: "#111",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{lp.label}</div>
                    <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>{lp.help}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Tip: selecting a brownfield path adds a “Brownfield Target” step automatically.
            </div>
          </div>
        )}

        {props.activeStep === "basics" && (
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Product name</span>
              <input
                value={state.product_name}
                onChange={(e) => setState((s) => ({ ...s, product_name: e.target.value }))}
                placeholder="e.g., Kindred Builders"
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>One-liner</span>
              <input
                value={state.one_liner}
                onChange={(e) => setState((s) => ({ ...s, one_liner: e.target.value }))}
                placeholder="What does it do, in one sentence?"
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              These fields become part of the deterministic Spec Pack.
            </div>
          </div>
        )}

        {props.activeStep === "brownfield" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ opacity: 0.85 }}>
              This step only exists for brownfield launch paths. Provide the repo URL you plan to upgrade.
            </p>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>GitHub repo URL (optional for now)</span>
              <input
                value={state.brownfield_repo_url}
                onChange={(e) => setState((s) => ({ ...s, brownfield_repo_url: e.target.value }))}
                placeholder="e.g., https://github.com/Kindred-Digital/Kindred-official.git"
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
              />
            </label>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Next phase will scan the repo and generate an Inventory Pack automatically.
            </div>
          </div>
        )}

        {props.activeStep === "palettes" && (
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Select Palettes</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
                {PALETTES.map((p) => {
                  const checked = state.palettes.includes(p.id);
                  return (
                    <label key={p.id} style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12, display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setState((s) => {
                              const next = on ? Array.from(new Set([...s.palettes, p.id])) : s.palettes.filter((x) => x !== p.id);
                              return { ...s, palettes: next };
                            });
                          }}
                        />
                        <div style={{ fontWeight: 600 }}>{p.label}</div>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{p.help}</div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Tradeoffs (-5..+5)</div>
              <div style={{ display: "grid", gap: 12 }}>
                {(
                  [
                    ["speed_vs_quality", "Speed ↔ Quality"],
                    ["simple_vs_powerful", "Simple ↔ Powerful"],
                    ["cheap_vs_reliable", "Cheap ↔ Reliable"],
                    ["flexible_vs_safe", "Flexible ↔ Safe"]
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontWeight: 600 }}>{label}</span>
                      <span style={{ fontFamily: "monospace" }}>{state.tradeoffs[k]}</span>
                    </div>
                    <input
                      type="range"
                      min={-5}
                      max={5}
                      step={1}
                      value={state.tradeoffs[k]}
                      onChange={(e) => {
                        const v = clampTradeoff(parseInt(e.target.value, 10));
                        setState((s) => ({ ...s, tradeoffs: { ...s.tradeoffs, [k]: v } }));
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {props.activeStep === "design" && (
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>Actors</div>
                <button
                  onClick={() => {
                    const id = `actor_${Math.random().toString(16).slice(2)}`;
                    setState((s) => ({ ...s, actors: [...s.actors, { id, label: "New Actor" }] }));
                  }}
                  style={{ border: "1px solid #ccc", padding: "6px 10px", borderRadius: 8, background: "white",
                      color: "#111", cursor: "pointer" }}
                >
                  Add actor
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {state.actors.map((a, idx) => (
                  <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                    <input
                      value={a.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        setState((s) => {
                          const next = [...s.actors];
                          next[idx] = { ...next[idx], label };
                          return { ...s, actors: next };
                        });
                      }}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
                    />
                    <button
                      onClick={() => {
                        setState((s) => ({
                          ...s,
                          actors: s.actors.filter((x) => x.id !== a.id),
                          scenes: s.scenes.filter((sc) => sc.actor_id !== a.id)
                        }));
                      }}
                      style={{ border: "1px solid #ccc", padding: "6px 10px", borderRadius: 8, background: "white",
                      color: "#111", cursor: "pointer" }}
                      aria-label="Remove actor"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 700 }}>Scenes</div>
                <button
                  onClick={() => {
                    const id = `scene_${Math.random().toString(16).slice(2)}`;
                    const actor_id = state.actors[0]?.id ?? "actor_user";
                    setState((s) => ({ ...s, scenes: [...s.scenes, { id, label: "New Scene", actor_id }] }));
                  }}
                  style={{ border: "1px solid #ccc", padding: "6px 10px", borderRadius: 8, background: "white",
                      color: "#111", cursor: "pointer" }}
                >
                  Add scene
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {state.scenes.map((sc, idx) => (
                  <div key={sc.id} style={{ display: "grid", gridTemplateColumns: "2fr 2fr auto", gap: 10 }}>
                    <input
                      value={sc.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        setState((s) => {
                          const next = [...s.scenes];
                          next[idx] = { ...next[idx], label };
                          return { ...s, scenes: next };
                        });
                      }}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
                    />
                    <select
                      value={sc.actor_id}
                      onChange={(e) => {
                        const actor_id = e.target.value;
                        setState((s) => {
                          const next = [...s.scenes];
                          next[idx] = { ...next[idx], actor_id };
                          return { ...s, scenes: next };
                        });
                      }}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "white" }}
                    >
                      {state.actors.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setState((s) => ({ ...s, scenes: s.scenes.filter((x) => x.id !== sc.id) }))}
                      style={{ border: "1px solid #ccc", padding: "6px 10px", borderRadius: 8, background: "white",
                      color: "#111", cursor: "pointer" }}
                      aria-label="Remove scene"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Actors + Scenes are your core “experience skeleton”. Next cycles will expand Scenes into flows, rules, and policies.
            </div>
          </div>
        )}

        {props.activeStep === "ai-connectors" && (
          <div style={{ display: "grid", gap: 16 }}>
            <p style={{ opacity: 0.85 }}>
              Choose how SDDE will access AI. We do not store keys in the browser. Hosted keys live in environment variables.
            </p>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="radio"
                  name="ai_mode"
                  value="offline"
                  checked={state.ai.mode === "offline"}
                  onChange={() => setState((s) => ({ ...s, ai: { ...s.ai, mode: "offline" } }))}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>Offline</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>No network calls. Best for first-time users.</div>
                </div>
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="radio"
                  name="ai_mode"
                  value="hosted"
                  checked={state.ai.mode === "hosted"}
                  onChange={() => setState((s) => ({ ...s, ai: { ...s.ai, mode: "hosted" } }))}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>Hosted (OpenAI-compatible)</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    Uses server environment variables (e.g. OPENAI_API_KEY). No keys in browser.
                  </div>
                </div>
              </label>

              {state.ai.mode === "hosted" && (
                <label style={{ display: "grid", gap: 6, marginLeft: 28 }}>
                  <span style={{ fontWeight: 600 }}>Model</span>
                  <input
                    value={state.ai.hosted_model}
                    onChange={(e) => setState((s) => ({ ...s, ai: { ...s.ai, hosted_model: e.target.value } }))}
                    style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
                  />
                  <span style={{ fontSize: 12, opacity: 0.75 }}>
                    Later we’ll add a guided connector wizard with “test” and “spend cap” gates.
                  </span>
                </label>
              )}

              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="radio"
                  name="ai_mode"
                  value="local"
                  checked={state.ai.mode === "local"}
                  onChange={() => setState((s) => ({ ...s, ai: { ...s.ai, mode: "local" } }))}
                />
                <div>
                  <div style={{ fontWeight: 700 }}>Local</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Use a local OpenAI-compatible endpoint (e.g. LM Studio).</div>
                </div>
              </label>

              {state.ai.mode === "local" && (
                <div style={{ marginLeft: 28, display: "grid", gap: 10 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>Base URL</span>
                    <input
                      value={state.ai.local_base_url}
                      onChange={(e) => setState((s) => ({ ...s, ai: { ...s.ai, local_base_url: e.target.value } }))}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>Model</span>
                    <input
                      value={state.ai.local_model}
                      onChange={(e) => setState((s) => ({ ...s, ai: { ...s.ai, local_model: e.target.value } }))}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {props.activeStep === "review" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Summary</div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
{JSON.stringify(
  {
    launch_path_id: state.launch_path_id,
    product_name: state.product_name,
    one_liner: state.one_liner,
    brownfield_repo_url: state.brownfield_repo_url || undefined,
    palettes: state.palettes,
    tradeoffs: state.tradeoffs,
    actors: state.actors,
    scenes: state.scenes,
    ai: state.ai
  },
  null,
  2
)}
              </pre>
            </div>

            <button
              onClick={async () => {
                const payload = {
                  launchPathId: state.launch_path_id,
                  productName: state.product_name,
                  oneLiner: state.one_liner,
                  palettes: state.palettes,
                  tradeoffs: state.tradeoffs,
                  actors: state.actors,
                  scenes: state.scenes,
                  ai: state.ai,
                  brownfieldRepoUrl: state.brownfield_repo_url
                };

                await downloadSpecPack(payload);
              }}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "white",
                cursor: "pointer",
                fontWeight: 700
              }}
            >
              Download Spec Pack (ZIP)
            </button>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Next phase: import a repo and generate an Inventory Pack, then compile Inventory + Spec Pack into SDDL.
            </div>
          </div>
        )}
      </section>

      {/* Nav */}
      <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", gap: 10 }}>
        <button
          onClick={goBack}
          disabled={!canBack}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: canBack ? "white" : "#f5f5f5",
            cursor: canBack ? "pointer" : "not-allowed"
          }}
        >
          Back
        </button>

        {props.activeStep !== "review" ? (
          <button
            onClick={goNext}
            disabled={!canNext}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: canNext ? "#111" : "#f5f5f5",
              color: canNext ? "white" : "#777",
              cursor: canNext ? "pointer" : "not-allowed",
              fontWeight: 700
            }}
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => go("launch-path")}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "white",
                      color: "#111",
              cursor: "pointer"
            }}
          >
            Edit launch path
          </button>
        )}
      </div>
    </main>
  );
}
