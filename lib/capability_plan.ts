"use client";

import type { ProjectState } from "./types";

export type CapabilityDomainId =
  | "data"
  | "compute"
  | "delivery"
  | "security"
  | "observability"
  | "governance"
  | "integrations";

export type CapabilityItem = {
  id: string;
  label: string;
  description: string;
  complexity: "low" | "medium" | "high";
  default_posture: "local_only" | "proof_lane_only" | "hosted_opt_in";
  notes: string[];
};

export type CapabilityDomain = {
  id: CapabilityDomainId;
  title: string;
  intent_relevance: "core" | "optional" | "avoid";
  items: CapabilityItem[];
};

export type CapabilityPlanV1 = {
  schema: "kindred.capability_plan.v1";
  captured_at_utc: string;
  project_id: string;
  summary: string[];
  domains: CapabilityDomain[];
};

function stableNow(): string {
  return "1980-01-01T00:00:00.000Z";
}

function domain(id: CapabilityDomainId, title: string, intent_relevance: CapabilityDomain["intent_relevance"], items: CapabilityItem[]): CapabilityDomain {
  return { id, title, intent_relevance, items };
}

export function computeCapabilityPlan(state: ProjectState | null): CapabilityPlanV1 {
  const project_id = state?.project?.id || "(unknown)";
  const build_intent = String(state?.intent?.build_intent || "");
  const primary_surface = String(state?.intent?.primary_surface || "");
  const palettes = Array.isArray(state?.intent?.palettes) ? state!.intent.palettes : [];
  const offline_first = Boolean(state?.intent?.constraints?.offline_first);
  const no_payments = Boolean(state?.intent?.constraints?.no_payments);

  const summary: string[] = [];
  if (!build_intent || !primary_surface) {
    summary.push("Plan is provisional: select Build Intent + Primary Surface to unlock sharper recommendations.");
  }
  summary.push("Capabilities are a tech stack plan. They do not change Kindred primitives.");
  summary.push("Defaults are non-custodial and local-first. Hosted integrations are opt-in overlays.");

  const wantsCommerce = palettes.includes("commerce_value") && !no_payments;
  const wantsGovernance = palettes.includes("governance_policy") || palettes.includes("reputation_safety");

  const domains: CapabilityDomain[] = [];

  // Data
  domains.push(
    domain("data", "Data", primary_surface === "api_service" ? "core" : "optional", [
      {
        id: "data.local_storage",
        label: "Local-first state",
        description: "Keep user state portable (browser storage/exportable packs).",
        complexity: "low",
        default_posture: "local_only",
        notes: offline_first
          ? ["Offline-first is enabled. Prefer local-first and deterministic exports."]
          : ["Consider enabling offline-first to reduce accidental custodial defaults."],
      },
      {
        id: "data.external_store",
        label: "External database (optional)",
        description: "Only add persistent server-side storage when your plan truly requires it.",
        complexity: "high",
        default_posture: "hosted_opt_in",
        notes: ["External storage pushes you out of beginner deploy lane. Prove in Proof Lane."],
      },
    ])
  );

  // Compute
  domains.push(
    domain("compute", "Compute", primary_surface === "api_service" || primary_surface === "automation" ? "core" : "optional", [
      {
        id: "compute.serverless",
        label: "Serverless functions (careful)",
        description: "Useful for small glue tasks, but avoid stateful workloads in Vercel Deploy Lane.",
        complexity: "medium",
        default_posture: "proof_lane_only",
        notes: ["Avoid filesystem writes outside /tmp. Watch bundle size."]
      },
      {
        id: "compute.dedicated_runtime",
        label: "Dedicated runtime (optional)",
        description: "Use when you need long-running workers, background jobs, or heavy compute.",
        complexity: "high",
        default_posture: "hosted_opt_in",
        notes: ["Treat as a separate surface from Vercel. Prove it in Proof Lane."],
      },
    ])
  );

  // Delivery
  domains.push(
    domain("delivery", "Delivery", "core", [
      {
        id: "delivery.vercel_deploy_lane",
        label: "Vercel Deploy Lane",
        description: "Fast deploys for the beginner surface (static + light serverless).",
        complexity: "low",
        default_posture: "local_only",
        notes: ["Deploy lane is not proof lane. CI/local runners produce evidence."],
      },
      {
        id: "delivery.ci_proof_lane",
        label: "Proof Lane",
        description: "Runs strict gates (lint/typecheck/build/governance/publish_ready) and stores evidence.",
        complexity: "medium",
        default_posture: "proof_lane_only",
        notes: ["Attach evidence to git tags before calling anything publish-ready."],
      },
    ])
  );

  // Security
  domains.push(
    domain("security", "Security", wantsCommerce || wantsGovernance ? "core" : "optional", [
      {
        id: "security.secrets",
        label: "Secrets posture",
        description: "No secrets in repo. Default local-only; CI secrets only when needed.",
        complexity: "medium",
        default_posture: "local_only",
        notes: ["Hosted key storage is opt-in only."]
      },
      {
        id: "security.threat_model",
        label: "Threat model (lightweight)",
        description: "Write down what you defend against and what you explicitly do not.",
        complexity: "medium",
        default_posture: "local_only",
        notes: ["Even a short threat model beats vibes."]
      },
    ])
  );

  // Observability
  domains.push(
    domain("observability", "Observability", primary_surface === "web_app" ? "optional" : "core", [
      {
        id: "obs.client_logs",
        label: "Client-side diagnostics",
        description: "A failure report that can be exported without leaking secrets.",
        complexity: "medium",
        default_posture: "local_only",
        notes: ["Prefer exportable bundles to hosted log ingestion by default."],
      },
      {
        id: "obs.server_metrics",
        label: "Server metrics (optional)",
        description: "Only needed when you run dedicated runtimes.",
        complexity: "high",
        default_posture: "hosted_opt_in",
        notes: ["If you add servers, you add ops. No freebies."],
      },
    ])
  );

  // Governance
  domains.push(
    domain("governance", "Governance", wantsGovernance ? "core" : "optional", [
      {
        id: "gov.decision_register",
        label: "Decision Register",
        description: "Append-only log of why you changed a gate, posture, or policy.",
        complexity: "low",
        default_posture: "local_only",
        notes: ["You will forget why you did things. This prevents that."],
      },
      {
        id: "gov.evidence_bundle",
        label: "Evidence bundle",
        description: "Artifacts that prove what ran, with versions and logs.",
        complexity: "medium",
        default_posture: "proof_lane_only",
        notes: ["No evidence, no claim."],
      },
    ])
  );

  // Integrations
  domains.push(
    domain("integrations", "Integrations", wantsCommerce ? "core" : "optional", [
      {
        id: "int.email",
        label: "Email (opt-in)",
        description: "Transactional comms. Avoid making it mandatory for MVP.",
        complexity: "medium",
        default_posture: "hosted_opt_in",
        notes: ["Keep deliverability and secrets out of Vercel deploy lane."],
      },
      {
        id: "int.payments",
        label: "Value exchange (opt-in)",
        description: "Handle money/value flows only when you're ready for compliance and abuse controls.",
        complexity: "high",
        default_posture: "hosted_opt_in",
        notes: wantsCommerce ? ["Value exchange is on. Expect a slower, more rigorous proof loop."] : ["Value exchange is off. Keep it that way until you have product proof."],
      },
      {
        id: "int.blockchain",
        label: "Blockchain (background tool)",
        description: "Treat it as infrastructure. Add it only when it solves a specific problem.",
        complexity: "high",
        default_posture: "hosted_opt_in",
        notes: ["Not part of the Director loop by default."]
      },
    ])
  );

  return {
    schema: "kindred.capability_plan.v1",
    captured_at_utc: stableNow(),
    project_id,
    summary,
    domains,
  };
}
