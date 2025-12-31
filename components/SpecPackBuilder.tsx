"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import launchPathsRaw from "@/sdde/contracts/launch_paths.json";

type StepId =
  | "launch-path"
  | "basics"
  | "brownfield"
  | "palettes"
  | "design"
  | "ai-connectors"
  | "review";

type Tradeoffs = {
  speed_vs_quality: number;
  simple_vs_powerful: number;
  cheap_vs_reliable: number;
  flexible_vs_safe: number;
};

type Actor = { id: string; label: string };
type Scene = { id: string; label: string; actor_id: string };

type AiMode = "offline" | "hosted" | "local";

type AiConfig = {
  mode: AiMode;
  hosted_model: string;
  local_base_url: string;
  local_model: string;
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

type GateStatus = "pass" | "warn" | "fail";

type Gate = {
  id: string;
  status: GateStatus;
  message: string;
};

type GateReport = {
  schema: "sdde.gate_report.v1";
  created_at_utc: string;
  failures: number;
  warnings: number;
  passes: number;
  ok: boolean;
  gates: Gate[];
};

type LaunchPathOption = {
  id: string;
  label: string;
  help: string;
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

function clampTradeoff(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < -5) return -5;
  if (n > 5) return 5;
  return Math.trunc(n);
}

function isBrownfieldLaunchPath(launchPathId: string): boolean {
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

function normalizeLaunchPaths(raw: any): LaunchPathOption[] {
  const out: LaunchPathOption[] = [];

  const push = (id: unknown, label: unknown, help: unknown) => {
    if (typeof id !== "string" || !id.trim()) return;
    const l = (typeof label === "string" && label.trim()) ? label.trim() : id;
    const h = (typeof help === "string" && help.trim()) ? help.trim() : "";
    out.push({ id: id.trim(), label: l, help: h });
  };

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item && typeof item === "object") {
        push((item as any).id ?? (item as any).launch_path_id, (item as any).label ?? (item as any).title, (item as any).help ?? (item as any).summary);
      }
    }
    return out;
  }

  if (raw && typeof raw === "object") {
    const maybeList =
      (raw as any).launch_paths ??
      (raw as any).items ??
      (raw as any).options ??
      (raw as any).values;

    if (Array.isArray(maybeList)) {
      return normalizeLaunchPaths(maybeList);
    }

    for (const [k, v] of Object.entries(raw as Record<string, any>)) {
      if (!v || typeof v !== "object") continue;
      push(v.id ?? k, v.label ?? v.title, v.help ?? v.summary);
    }
  }

  return out;
}

const FALLBACK_LAUNCH_PATHS: LaunchPathOption[] = [
  { id: "quick_saas_v1", label: "Quick SaaS", help: "Ship a small SaaS with clear surfaces, actors, and flows." },
  { id: "website_rebuild_greenfield_v1", label: "Website (Greenfield)", help: "Design a new website from scratch." },
  { id: "website_upgrade_brownfield_v1", label: "Upgrade Existing Website (Brownfield)", help: "Start from an existing repo and upgrade it." }
];

function computeGateReport(state: BuilderState): GateReport {
  const gates: Gate[] = [];
  const add = (id: string, status: GateStatus, message: string) => gates.push({ id, status, message });

  if (state.launch_path_id.trim()) add("launch_path_selected", "pass", "Launch path selected.");
  else add("launch_path_selected", "fail", "Choose a launch path.");

  if (state.product_name.trim()) add("product_name", "pass", "Product name set.");
  else add("product_name", "fail", "Set a product name.");

  if (state.one_liner.trim()) add("one_liner", "pass", "One-liner set.");
  else add("one_liner", "fail", "Set a one-liner.");

  if (state.palettes.length > 0) add("palettes_selected", "pass", "At least one palette selected.");
  else add("palettes_selected", "fail", "Select at least one palette.");

  const actorIds = new Set(state.actors.map((a) => a.id));
  if (state.actors.length > 0) add("actors_present", "pass", "At least one actor defined.");
  else add("actors_present", "fail", "Add at least one actor.");

  if (state.scenes.length > 0) add("scenes_present", "pass", "At least one scene defined.");
  else add("scenes_present", "fail", "Add at least one scene.");

  const badSceneRefs = state.scenes.filter((s) => !actorIds.has(s.actor_id));
  if (badSceneRefs.length === 0) add("scene_actor_refs", "pass", "All scenes reference valid actors.");
  else add("scene_actor_refs", "fail", "Some scenes reference missing actors.");

  if (state.ai.mode === "offline" || state.ai.mode === "hosted" || state.ai.mode === "local") add("ai_mode_valid", "pass", "AI mode is valid.");
  else add("ai_mode_valid", "fail", "AI mode is invalid.");

  if (isBrownfieldLaunchPath(state.launch_path_id)) {
    if (state.brownfield_repo_url.trim()) add("brownfield_target", "pass", "Brownfield repo URL provided.");
    else add("brownfield_target", "warn", "Brownfield selected: repo URL not provided yet (you can add it later).");
  } else {
    add("brownfield_target", "pass", "Not a brownfield launch path.");
  }

  const failures = gates.filter((g) => g.status === "fail").length;
  const warnings = gates.filter((g) => g.status === "warn").length;
  const passes = gates.filter((g) => g.status === "pass").length;

  return {
    schema: "sdde.gate_report.v1",
    created_at_utc: nowUtcIso(),
    failures,
    warnings,
    passes,
    ok: failures === 0,
    gates
  };
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

function badge(status: GateStatus): { bg: string; fg: string } {
  if (status === "pass") return { bg: "#e7f6ed", fg: "#0b5" };
  if (status === "warn") return { bg: "#fff4e5", fg: "#b60" };
  return { bg: "#ffe7e7", fg: "#b00" };
}

export default function SpecPackBuilder(props: { activeStep: StepId }) {
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<BuilderState>(() => defaultState());

  useEffect(() => {
    const loaded = safeParseState(localStorage.getItem(STORAGE_KEY));
    if (loaded) setState(loaded);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updated_at_utc: nowUtcIso() }));
  }, [hydrated, state]);

  const steps = useMemo(() => stepsFor(state.launch_path_id), [state.launch_path_id]);

  useEffect(() => {
    if (!hydrated) return;
    if (!steps.includes(props.activeStep)) router.push(hrefFor("basics"));
  }, [hydrated, props.activeStep, router, steps]);

  const stepIndex = Math.max(0, steps.indexOf(props.activeStep));
  const stepNumber = stepIndex + 1;

  const gateReport = useMemo(() => computeGateReport(state), [state]);

  const launchPathOptions = useMemo(() => {
    const contract = normalizeLaunchPaths(launchPathsRaw);
    return contract.length ? contract : FALLBACK_LAUNCH_PATHS;
  }, []);

  function go(step: StepId) { router.push(hrefFor(step)); }
  function goNext() { const i = steps.indexOf(props.activeStep); if (i >= 0 && steps[i + 1]) go(steps[i + 1]); }
  function goBack() { const i = steps.indexOf(props.activeStep); if (i > 0 && steps[i - 1]) go(steps[i - 1]); }

  function resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    setState(defaultState());
    router.push(hrefFor("launch-path"));
  }

  const canNext = useMemo(() => {
    if (!hydrated) return false;
    switch (props.activeStep) {
      case "launch-path": return !!state.launch_path_id;
      case "basics": return state.product_name.trim().length > 0 && state.one_liner.trim().length > 0;
      case "brownfield": return true;
      case "palettes": return state.palettes.length > 0;
      case "design": return state.actors.length > 0 && state.scenes.length > 0;
      case "ai-connectors": return true;
      case "review": return false;
    }
  }, [hydrated, props.activeStep, state]);

  const canBack = useMemo(() => hydrated && steps.indexOf(props.activeStep) > 0, [hydrated, props.activeStep, steps]);

  const title = useMemo(() => {
    switch (props.activeStep) {
      case "launch-path": return "Launch Path";
      case "basics": return "Deterministic Intake";
      case "brownfield": return "Brownfield Target";
      case "palettes": return "Palettes & Tradeoffs";
      case "design": return "Design Skeleton (Actors & Scenes)";
      case "ai-connectors": return "Interop (AI Connectors)";
      case "review": return "Gates & Artifacts";
    }
  }, [props.activeStep]);

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>SDDE Workbench</h1>
          <p style={{ marginTop: 8, opacity: 0.85 }}>Deterministic workflow: choices → gates → artifacts.</p>
        </div>
        <button onClick={resetAll} style={{ border: "1px solid #ccc", padding: "8px 10px", borderRadius: 8, background: "white", color: "#111", cursor: "pointer" }}>
          Start over
        </button>
      </div>

      <div style={{ marginTop: 14, padding: 12, border: "1px solid #2a2a2a", borderRadius: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>SDDE workflow</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 10 }}>
          {[
            { k: "Choose", step: "launch-path" as StepId, desc: "Launch Path" },
            { k: "Intake", step: "basics" as StepId, desc: "Deterministic inputs" },
            { k: "Design", step: "design" as StepId, desc: "Actors/Scenes" },
            { k: "Interop", step: "ai-connectors" as StepId, desc: "Connectors" },
            { k: "Gates", step: "review" as StepId, desc: "Report + artifacts" }
          ].map((x) => {
            const active = props.activeStep === x.step || (x.step === "design" && props.activeStep === "palettes");
            return (
              <div key={x.k} style={{ border: active ? "2px solid #fff" : "1px solid #444", borderRadius: 10, padding: 10, opacity: active ? 1 : 0.9 }}>
                <div style={{ fontWeight: 800 }}>{x.k}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{x.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 18, padding: 14, border: "1px solid #e5e5e5", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Step {stepNumber} of {steps.length}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{hydrated ? "Saved" : "Loading…"}</div>
        </div>
      </div>

      <div style={{ marginTop: 14, border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontWeight: 800 }}>Gates</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {gateReport.ok ? "OK" : "Not ready"} • {gateReport.failures} fail • {gateReport.warnings} warn
          </div>
        </div>

        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {gateReport.gates.slice(0, 6).map((g) => {
            const c = badge(g.status);
            return (
              <div key={g.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 800 }}>
                  {g.status.toUpperCase()}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.85 }}>{g.id}</span>
                <span style={{ fontSize: 12, opacity: 0.85 }}>{g.message}</span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>Full report is included in the Spec Pack ZIP.</div>
      </div>

      <section style={{ marginTop: 18 }}>
        {props.activeStep === "launch-path" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ opacity: 0.85 }}>
              Choose what you want to build. This choice determines which steps appear next (brownfield adds a target step).
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {launchPathOptions.map((lp) => {
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
                    <div style={{ fontWeight: 800 }}>{lp.label}</div>
                    <div style={{ marginTop: 6, opacity: 0.85, fontSize: 13 }}>{lp.help}</div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, fontFamily: "monospace" }}>{lp.id}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
              Launch paths come from: <span style={{ fontFamily: "monospace" }}>sdde/contracts/launch_paths.json</span>
            </div>
          </div>
        )}

        {props.activeStep === "basics" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Determinism: decisions are cards/toggles; free text is limited to labels.
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Product name (label)</span>
              <input
                value={state.product_name}
                onChange={(e) => setState((s) => ({ ...s, product_name: e.target.value }))}
                placeholder="e.g., Kindred Builders"
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#111" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>One-liner (label)</span>
              <input
                value={state.one_liner}
                onChange={(e) => setState((s) => ({ ...s, one_liner: e.target.value }))}
                placeholder="What does it do, in one sentence?"
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#111" }}
              />
            </label>
          </div>
        )}

        {props.activeStep === "brownfield" && (
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ opacity: 0.85 }}>
              Brownfield means: we generate an Inventory Pack next (repo scan), then map it into SDDE specs.
            </p>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>GitHub repo URL</span>
              <input
                value={state.brownfield_repo_url}
                onChange={(e) => setState((s) => ({ ...s, brownfield_repo_url: e.target.value }))}
                placeholder="e.g., https://github.com/Kindred-Digital/Kindred-official.git"
                style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#111" }}
              />
            </label>
          </div>
        )}

        {props.activeStep === "palettes" && (
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Select Palettes</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
                {PALETTES.map((p) => {
                  const checked = state.palettes.includes(p.id);
                  return (
                    <label key={p.id} style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12, display: "grid", gap: 6, background: "white", color: "#111" }}>
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
                        <div style={{ fontWeight: 700 }}>{p.label}</div>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{p.help}</div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Tradeoffs (-5..+5)</div>
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
                      <span style={{ fontWeight: 700 }}>{label}</span>
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
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12, background: "white", color: "#111" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Actors</div>
                <button
                  onClick={() => {
                    const id = `actor_${Math.random().toString(16).slice(2)}`;
                    setState((s) => ({ ...s, actors: [...s.actors, { id, label: "New Actor" }] }));
                  }}
                  style={{ border: "1px solid #ccc", padding: "6px 10px", borderRadius: 8, background: "white", color: "#111", cursor: "pointer" }}
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
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#111" }}
                    />
                    <button
                      onClick={() => setState((s) => ({ ...s, actors: s.actors.filter((x) => x.id !== a.id), scenes: s.scenes.filter((sc) => sc.actor_id !== a.id) }))}
                      style={{ border: "1px solid #ccc", padding: "6px 10px", borderRadius: 8, background: "white", color: "#111", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12, background: "white", color: "#111" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Scenes</div>
                <button
                  onClick={() => {
                    const id = `scene_${Math.random().toString(16).slice(2)}`;
                    const actor_id = state.actors[0]?.id ?? "actor_user";
                    setState((s) => ({ ...s, scenes: [...s.scenes, { id, label: "New Scene", actor_id }] }));
                  }}
                  style={{ border: "1px solid #ccc", padding: "6px 10px", borderRadius: 8, background: "white", color: "#111", cursor: "pointer" }}
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
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#111" }}
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
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#111" }}
                    >
                      {state.actors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                    <button
                      onClick={() => setState((s) => ({ ...s, scenes: s.scenes.filter((x) => x.id !== sc.id) }))}
                      style={{ border: "1px solid #ccc", padding: "6px 10px", borderRadius: 8, background: "white", color: "#111", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {props.activeStep === "ai-connectors" && (
          <div style={{ display: "grid", gap: 16 }}>
            <p style={{ opacity: 0.85 }}>AI mode is an interop decision. Secrets never go in the Spec Pack ZIP.</p>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="radio" name="ai_mode" value="offline" checked={state.ai.mode === "offline"} onChange={() => setState((s) => ({ ...s, ai: { ...s.ai, mode: "offline" } }))} />
                <div>
                  <div style={{ fontWeight: 800 }}>Offline</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>No network calls. Best for first-time users.</div>
                </div>
              </label>

              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="radio" name="ai_mode" value="hosted" checked={state.ai.mode === "hosted"} onChange={() => setState((s) => ({ ...s, ai: { ...s.ai, mode: "hosted" } }))} />
                <div>
                  <div style={{ fontWeight: 800 }}>Hosted (OpenAI-compatible)</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Uses server environment variables (e.g. OPENAI_API_KEY).</div>
                </div>
              </label>

              {state.ai.mode === "hosted" && (
                <label style={{ display: "grid", gap: 6, marginLeft: 28 }}>
                  <span style={{ fontWeight: 700 }}>Model</span>
                  <input value={state.ai.hosted_model} onChange={(e) => setState((s) => ({ ...s, ai: { ...s.ai, hosted_model: e.target.value } }))} style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#111" }} />
                </label>
              )}

              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="radio" name="ai_mode" value="local" checked={state.ai.mode === "local"} onChange={() => setState((s) => ({ ...s, ai: { ...s.ai, mode: "local" } }))} />
                <div>
                  <div style={{ fontWeight: 800 }}>Local</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Use a local OpenAI-compatible endpoint.</div>
                </div>
              </label>

              {state.ai.mode === "local" && (
                <div style={{ marginLeft: 28, display: "grid", gap: 10 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontWeight: 700 }}>Base URL</span>
                    <input value={state.ai.local_base_url} onChange={(e) => setState((s) => ({ ...s, ai: { ...s.ai, local_base_url: e.target.value } }))} style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#111" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontWeight: 700 }}>Model</span>
                    <input value={state.ai.local_model} onChange={(e) => setState((s) => ({ ...s, ai: { ...s.ai, local_model: e.target.value } }))} style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc", background: "white", color: "#111" }} />
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {props.activeStep === "review" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12, background: "white", color: "#111" }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Gate Report</div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(gateReport, null, 2)}</pre>
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
                  brownfieldRepoUrl: state.brownfield_repo_url,
                  gateReport
                };
                await downloadSpecPack(payload);
              }}
              disabled={!gateReport.ok}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: gateReport.ok ? "#111" : "#f5f5f5",
                color: gateReport.ok ? "white" : "#777",
                cursor: gateReport.ok ? "pointer" : "not-allowed",
                fontWeight: 800
              }}
            >
              Download Spec Pack (ZIP)
            </button>

            {!gateReport.ok ? (
              <div style={{ fontSize: 12, opacity: 0.8 }}>Fix failing gates first (red). Warnings (orange) are allowed.</div>
            ) : null}
          </div>
        )}
      </section>

      <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", gap: 10 }}>
        <button
          onClick={goBack}
          disabled={!canBack}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: canBack ? "white" : "#f5f5f5",
            color: "#111",
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
              fontWeight: 800
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
