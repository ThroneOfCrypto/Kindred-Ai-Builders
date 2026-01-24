"use client";

import type { ProjectState, PaletteId, PrimarySurface } from "./types";
import { APP_VERSION } from "./version";
import { stableJsonText } from "./stable_json";
import { sha256Hex } from "./hash";

export type CoherenceSeverity = "fail" | "warn" | "info";
export type CoherenceTri = "pass" | "warn" | "fail";

export type CoherenceFindingV1 = {
  id: string;
  severity: CoherenceSeverity;
  title: string;
  detail: string;
  why_it_matters: string;
  suggested_next: { label: string; href?: string }[];
};

export type CoherenceRecommendationV1 = {
  question_probes: { id: string; prompt: string; rationale: string }[];
  kit_slots: { slot_id: string; reason: string }[];
};

export type CoherenceReportV1 = {
  schema: "kindred.coherence_report.v1";
  app_version: string;
  created_at_utc: string;
  project: { id: string; name: string };

  tri: CoherenceTri;
  score_0_100: number;

  findings: CoherenceFindingV1[];
  recommendations: CoherenceRecommendationV1;

  snapshot: {
    primary_surface?: string;
    palettes: string[];
    constraints: {
      offline_first: boolean;
      no_payments: boolean;
      required_env_names: string[];
    };
    brief: {
      audience_description: string;
      problem: string;
      offer: string;
      differentiators: string[];
      success_metrics: string[];
      non_goals: string[];
    };
  };
};

function uniq<T>(xs: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const k = String(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function addFinding(findings: CoherenceFindingV1[], f: CoherenceFindingV1) {
  findings.push(f);
}

function palettesToSlots(palettes: PaletteId[]): { slot_id: string; reason: string }[] {
  const slots: { slot_id: string; reason: string }[] = [];
  const pset = new Set(palettes);

  if (pset.has("identity_access")) slots.push({ slot_id: "identity_access", reason: "You selected Identity & Access; plan an identity primitive and auth boundary." });
  if (pset.has("communication_social_surfaces")) slots.push({ slot_id: "communication", reason: "You selected Communication; plan messaging/email/notifications surfaces." });
  if (pset.has("content_media")) slots.push({ slot_id: "content_media", reason: "You selected Content & Media; plan storage, rendering, and moderation surfaces." });
  if (pset.has("knowledge_learning")) slots.push({ slot_id: "knowledge_learning", reason: "You selected Knowledge & Learning; plan information architecture + retrieval." });
  if (pset.has("search_navigation_discovery")) slots.push({ slot_id: "search_discovery", reason: "You selected Search/Discovery; plan indexing and navigation patterns." });
  if (pset.has("matching_recommendation")) slots.push({ slot_id: "recommendation", reason: "You selected Matching/Recommendation; plan ranking inputs and evaluation." });
  if (pset.has("collaboration_work")) slots.push({ slot_id: "collaboration", reason: "You selected Collaboration; plan roles, permissions, and shared objects." });
  if (pset.has("commerce_value_exchange")) slots.push({ slot_id: "commerce", reason: "You selected Commerce/Value; plan payments/ledger boundaries and disputes." });
  if (pset.has("governance_rules_policy")) slots.push({ slot_id: "governance", reason: "You selected Governance/Policy; plan rule files, approvals, and audit trails." });
  if (pset.has("reputation_trust_safety")) slots.push({ slot_id: "trust_safety", reason: "You selected Trust & Safety; plan abuse cases, reporting, and enforcement." });
  if (pset.has("game_incentive_mechanics")) slots.push({ slot_id: "incentives", reason: "You selected Incentives; plan points/rewards and anti-gaming safeguards." });
  if (pset.has("automation_agents_workflows")) slots.push({ slot_id: "automation", reason: "You selected Automation; plan jobs, triggers, and deterministic logs." });
  if (pset.has("infrastructure_data_files")) slots.push({ slot_id: "infra_data", reason: "You selected Infrastructure/Data/Files; plan storage, backups, and portability." });
  if (pset.has("connection_integration")) slots.push({ slot_id: "integrations", reason: "You selected Integrations; plan adapters and boundary contracts." });

  return slots.sort((a, b) => a.slot_id.localeCompare(b.slot_id));
}

function surfaceToSlot(surface?: PrimarySurface): { slot_id: string; reason: string } | null {
  if (!surface) return null;
  if (surface === "website") return { slot_id: "surface.website", reason: "Primary surface is a website; prioritize content structure + publishing." };
  if (surface === "web_app") return { slot_id: "surface.web_app", reason: "Primary surface is a web app; prioritize workflows, objects, and forms." };
  if (surface === "mobile_app") return { slot_id: "surface.mobile_app", reason: "Primary surface is mobile; prioritize offline UX and sync boundaries." };
  if (surface === "api_service") return { slot_id: "surface.api_service", reason: "Primary surface is an API; prioritize contracts, versioning, and clients." };
  if (surface === "cli_tool") return { slot_id: "surface.cli_tool", reason: "Primary surface is CLI; prioritize commands, docs, and packaging." };
  if (surface === "desktop_app") return { slot_id: "surface.desktop_app", reason: "Primary surface is desktop; prioritize installability and local data." };
  return { slot_id: `surface.${surface}`, reason: "Primary surface selected." };
}

export function buildCoherenceReport(state: ProjectState): CoherenceReportV1 {
  const findings: CoherenceFindingV1[] = [];

  const name = String(state.project?.name || "");
  const primary = state.intent?.primary_surface;
  const palettes = Array.isArray(state.intent?.palettes) ? [...state.intent.palettes].map((x) => x as PaletteId) : [];
  const constraints = state.intent?.constraints || { offline_first: false, no_payments: false, required_env_names: [] as string[] };

  const brief = state.intent?.brief || {
    audience_description: "",
    problem: "",
    offer: "",
    differentiators: [],
    success_metrics: [],
    non_goals: [],
  };

  if (!name.trim()) {
    addFinding(findings, {
      id: "project_name_missing",
      severity: "fail",
      title: "Project name is missing",
      detail: "Give the project a clear name. This becomes the anchor for previews, exports, and artefacts.",
      why_it_matters: "Without a stable name, directors struggle to compare artefacts and reviewers lose context.",
      suggested_next: [{ label: "Set project name", href: "/director/brief" }],
    });
  }

  if (!primary) {
    addFinding(findings, {
      id: "primary_surface_missing",
      severity: "fail",
      title: "Primary surface not selected",
      detail: "Pick one primary surface (web app, website, API, etc.). This controls defaults and review expectations.",
      why_it_matters: "A director cannot judge progress without knowing what surface is primary.",
      suggested_next: [{ label: "Choose a primary surface", href: "/director/brief" }],
    });
  }

  if (!brief.offer.trim()) {
    addFinding(findings, {
      id: "offer_missing",
      severity: "warn",
      title: "Offer is unclear",
      detail: "Write the offer in one sentence: what do users get, in plain language?",
      why_it_matters: "The offer is the north star for page IA, storyboard, and UI decisions.",
      suggested_next: [{ label: "Clarify the offer", href: "/director/brief" }],
    });
  }

  if (!brief.problem.trim()) {
    addFinding(findings, {
      id: "problem_missing",
      severity: "warn",
      title: "Problem is unclear",
      detail: "Write the problem in one sentence: what pain, for whom, in what situation?",
      why_it_matters: "Without a clear problem, proposals become aesthetic guesses instead of accountable solutions.",
      suggested_next: [{ label: "Clarify the problem", href: "/director/brief" }],
    });
  }

  if (!brief.audience_description.trim()) {
    addFinding(findings, {
      id: "audience_missing",
      severity: "warn",
      title: "Audience is unclear",
      detail: "Describe your primary audience in a sentence (role, context, what they care about).",
      why_it_matters: "Audience clarity drives tone, UX density, accessibility, and IA prioritization.",
      suggested_next: [{ label: "Describe the audience", href: "/director/brief" }],
    });
  }

  if (palettes.length === 0) {
    addFinding(findings, {
      id: "palettes_missing",
      severity: "warn",
      title: "No palettes selected",
      detail: "Select the capability palettes that describe what the system must do.",
      why_it_matters: "Palettes prevent special-casing: they declare the capability universe up front.",
      suggested_next: [{ label: "Select palettes", href: "/director/brief" }],
    });
  }

  if (constraints.no_payments && palettes.includes("commerce_value_exchange")) {
    addFinding(findings, {
      id: "commerce_no_payments_tension",
      severity: "warn",
      title: "Commerce selected, but payments disabled",
      detail: "You selected Commerce/Value Exchange but also set 'no payments'. That may be intentional (non-monetary value), but it must be explicit.",
      why_it_matters: "This is a common director/CTO mismatch: teams implement payments by default unless constrained.",
      suggested_next: [{ label: "Clarify value exchange", href: "/director/brief" }],
    });
  }

  if (constraints.offline_first && primary === "api_service") {
    addFinding(findings, {
      id: "offline_first_api_surface",
      severity: "warn",
      title: "Offline-first with API primary surface",
      detail: "Offline-first usually implies a client surface. If API is primary, specify the offline client(s) as secondary surfaces.",
      why_it_matters: "Otherwise the team will build an API with no clear offline UX to test against.",
      suggested_next: [{ label: "Adjust surfaces", href: "/director/brief" }],
    });
  }

  const question_probes: { id: string; prompt: string; rationale: string }[] = [];
  if (!brief.offer.trim()) {
    question_probes.push({
      id: "probe_offer",
      prompt: "In one sentence, what does a user get the moment your product works?",
      rationale: "This becomes the primary hero message and the anchor for the first flow.",
    });
  }
  if (!brief.problem.trim()) {
    question_probes.push({
      id: "probe_problem",
      prompt: "What bad outcome happens if the user does nothing?",
      rationale: "Clarifies urgency and prioritization; prevents feature drift.",
    });
  }
  if (!primary) {
    question_probes.push({
      id: "probe_surface",
      prompt: "Where does the user primarily experience this product (web app, website, mobile, API, CLI)?",
      rationale: "Sets default templates and proof expectations.",
    });
  }
  if (palettes.length === 0) {
    question_probes.push({
      id: "probe_palettes",
      prompt: "Which capability bundles must exist (identity, content, automation, commerce, governance, etc.)?",
      rationale: "Declares scope without special-casing later.",
    });
  }

  const kit_slots = [] as { slot_id: string; reason: string }[];
  const surfaceSlot = surfaceToSlot(primary);
  if (surfaceSlot) kit_slots.push(surfaceSlot);
  if (constraints.offline_first) kit_slots.push({ slot_id: "constraint.offline_first", reason: "Offline-first chosen; ensure local persistence and conflict strategy (even if sync is deferred)." });
  if (!constraints.no_payments && palettes.includes("commerce_value_exchange")) kit_slots.push({ slot_id: "constraint.payments_allowed", reason: "Payments allowed; require dispute + refund boundary decisions." });

  for (const s of palettesToSlots(palettes)) kit_slots.push(s);
  const kit_slots_dedup = uniq(kit_slots.map((x) => JSON.stringify(x))).map((s) => JSON.parse(s));

  // Score: start at 100; deduct for fails/warns
  let score = 100;
  for (const f of findings) {
    if (f.severity === "fail") score -= 25;
    if (f.severity === "warn") score -= 10;
    if (f.severity === "info") score -= 2;
  }
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  const tri: CoherenceTri =
    findings.some((f) => f.severity === "fail") ? "fail" : findings.some((f) => f.severity === "warn") ? "warn" : "pass";

  return {
    schema: "kindred.coherence_report.v1",
    app_version: APP_VERSION,
    created_at_utc: new Date().toISOString(),
    project: { id: String(state.project.id || ""), name: String(state.project.name || "") },
    tri,
    score_0_100: score,
    findings: findings.sort((a, b) => a.severity.localeCompare(b.severity) || a.id.localeCompare(b.id)),
    recommendations: {
      question_probes: question_probes.sort((a, b) => a.id.localeCompare(b.id)),
      kit_slots: kit_slots_dedup.sort((a: any, b: any) => String(a.slot_id).localeCompare(String(b.slot_id))),
    },
    snapshot: {
      primary_surface: primary ? String(primary) : undefined,
      palettes: palettes.map(String).sort(),
      constraints: {
        offline_first: Boolean(constraints.offline_first),
        no_payments: Boolean(constraints.no_payments),
        required_env_names: Array.isArray(constraints.required_env_names) ? constraints.required_env_names.map(String).sort() : [],
      },
      brief: {
        audience_description: String(brief.audience_description || ""),
        problem: String(brief.problem || ""),
        offer: String(brief.offer || ""),
        differentiators: Array.isArray(brief.differentiators) ? brief.differentiators.map(String).filter(Boolean) : [],
        success_metrics: Array.isArray(brief.success_metrics) ? brief.success_metrics.map(String).filter(Boolean) : [],
        non_goals: Array.isArray(brief.non_goals) ? brief.non_goals.map(String).filter(Boolean) : [],
      },
    },
  };
}

export function coherenceReportJson(state: ProjectState): string {
  return stableJsonText(buildCoherenceReport(state), 2);
}

export function coherenceReportSha256(state: ProjectState): string {
  return sha256Hex(coherenceReportJson(state));
}
