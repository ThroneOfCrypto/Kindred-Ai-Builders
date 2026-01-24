"use client";

import type { ProjectState } from "./types";

export type DeployLaneFitTri = "green" | "amber" | "red";

export type DeployLaneFitReportV1 = {
  schema: "kindred.deploy_lane_fit.v1";
  captured_at_utc: string;
  project_id: string;
  tri: DeployLaneFitTri;
  reasons: string[];
  recommendations: string[];
  signals: {
    primary_surface: string | null;
    build_intent: string | null;
    palettes: string[];
    offline_first: boolean;
    no_payments: boolean;
    required_env_names_count: number;
  };
};

function stableNow(): string {
  // Determinism: this report is derived from state; we don't want export-time timestamps.
  return "1980-01-01T00:00:00.000Z";
}

export function computeDeployLaneFit(state: ProjectState | null): DeployLaneFitReportV1 {
  const project_id = state?.project?.id || "(unknown)";
  const primary_surface = (state?.intent?.primary_surface || null) as any;
  const build_intent = (state?.intent?.build_intent || null) as any;
  const palettes = Array.isArray(state?.intent?.palettes) ? state!.intent.palettes.slice() : [];
  const offline_first = Boolean(state?.intent?.constraints?.offline_first);
  const no_payments = Boolean(state?.intent?.constraints?.no_payments);
  const required_env_names_count = Array.isArray(state?.intent?.constraints?.required_env_names)
    ? state!.intent.constraints.required_env_names!.length
    : 0;

  const reasons: string[] = [];
  const recommendations: string[] = [];

  // Baseline logic: Vercel deploy lane should stay lightweight and avoid server-side state.
  // This is heuristic and intentionally conservative.
  let tri: DeployLaneFitTri = "green";

  if (!primary_surface || !build_intent) {
    tri = "amber";
    reasons.push("Project intent is incomplete (build intent / primary surface not selected yet).");
    recommendations.push("Complete Director → Build Intent and Primary Surface so the deploy lane fit can be evaluated.");
  }

  // Payments: higher compliance and backend complexity.
  if (!no_payments) {
    tri = tri === "red" ? tri : "amber";
    reasons.push("Payments enabled (higher compliance + backend requirements).");
    recommendations.push("Keep payments out of deploy lane; use an opt-in integration kit and prove it in Proof Lane.");
  }

  // Required env vars: indicates external integrations, secrets, or nontrivial infra.
  if (required_env_names_count > 0) {
    tri = tri === "red" ? tri : "amber";
    reasons.push(`Requires ${required_env_names_count} environment variables (integrations/secrets).`);
    recommendations.push("Route secrets through Local-only or Proof-lane-only posture; keep Vercel deploy lane stateless.");
  }

  // Palettes: commerce/governance typically imply backend or policy enforcement.
  const hasCommerce = palettes.includes("commerce_value");
  const hasGovernance = palettes.includes("governance_policy") || palettes.includes("reputation_safety");
  if (hasCommerce) {
    tri = tri === "red" ? tri : "amber";
    reasons.push("Commerce palette selected (usually implies backend, compliance, and fraud controls).");
    recommendations.push("Start with non-payment value capture (waitlist, leads) in deploy lane; add payments later via a proved integration.");
  }
  if (hasGovernance) {
    tri = tri === "red" ? tri : "amber";
    reasons.push("Governance/reputation palette selected (policy + moderation implications).");
    recommendations.push("Make governance rules explicit and test them in Proof Lane; avoid server-side policy state in deploy lane.");
  }

  // Primary surface heuristic: API services and automation are rarely a good fit for Vercel beginner deploy.
  if (primary_surface === "api_service" || primary_surface === "automation") {
    tri = "red";
    reasons.push("Primary surface is API/automation (server-side runtime + state is likely required).");
    recommendations.push("Use deploy lane for a static/control surface only; run the real service in a dedicated runtime proven in Proof Lane.");
  }

  // Offline-first is generally good for deploy-lane simplicity.
  if (offline_first) {
    reasons.push("Offline-first constraint enabled (pushes toward local-first state and reduces custodial risk).");
  } else {
    tri = tri === "green" ? "amber" : tri;
    reasons.push("Offline-first not enabled (risk of drifting into custodial defaults).");
    recommendations.push("If possible, enable offline-first and treat hosted services as opt-in overlays.");
  }

  if (reasons.length === 0) {
    reasons.push("No major deploy-lane risks detected for the current intent.");
  }

  return {
    schema: "kindred.deploy_lane_fit.v1",
    captured_at_utc: stableNow(),
    project_id,
    tri,
    reasons,
    recommendations,
    signals: {
      primary_surface: primary_surface || null,
      build_intent: build_intent || null,
      palettes,
      offline_first,
      no_payments,
      required_env_names_count,
    },
  };
}

export function deployLaneFitToPill(tri: DeployLaneFitTri): { label: string; className: string } {
  if (tri === "green") return { label: "Green", className: "pill--success" };
  if (tri === "amber") return { label: "Amber", className: "pill--warn" };
  return { label: "Red", className: "pill--error" };
}
