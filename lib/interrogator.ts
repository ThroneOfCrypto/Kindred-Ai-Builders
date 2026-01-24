"use client";

import type { ProjectState, PaletteId, PrimarySurface } from "./types";
import { APP_VERSION } from "./version";
import { stableJsonText } from "./stable_json";
import { sha256Hex } from "./hash";

export type Likert4 = "-2" | "-1" | "+1" | "+2";

export type InterrogatorQuestionKind = "likert4" | "single_select" | "multi_select";

export type InterrogatorQuestionV1 = {
  id: string;
  kind: InterrogatorQuestionKind;

  prompt: string;
  rationale: string;

  required: boolean;

  // for select types
  options?: { id: string; label: string; help?: string }[];
};

export type InterrogatorPackV1 = {
  schema: "kindred.interrogator_pack.v1";
  app_version: string;
  created_at_utc: string;

  project: { id: string; name: string };

  derived_from: {
    primary_surface?: string;
    palettes: string[];
    constraints: {
      offline_first: boolean;
      no_payments: boolean;
      required_env_names: string[];
    };
  };

  items: InterrogatorQuestionV1[];
};

export type InterrogatorAnswerValueV1 =
  | { kind: "likert4"; value: Likert4 }
  | { kind: "single_select"; value: string }
  | { kind: "multi_select"; value: string[] };

export type InterrogatorAnswersV1 = {
  schema: "kindred.interrogator_answers.v1";
  app_version: string;
  captured_at_utc: string;
  project: { id: string; name: string };

  answers: Record<string, InterrogatorAnswerValueV1>;

  completeness: { required_total: number; required_answered: number; ok: boolean };

  kit_slots: { slot_id: string; reason: string }[];

  notes: string[];
};

function uniq<T>(xs: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const k = JSON.stringify(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function baseQuestions(): InterrogatorQuestionV1[] {
  return [
    {
      id: "dial.speed_over_polish",
      kind: "likert4",
      prompt: "Prioritize shipping quickly over polish.",
      rationale: "This sets how aggressively we trade refinement for time-to-value (especially in early cycles).",
      required: true,
    },
    {
      id: "dial.flexibility_over_simplicity",
      kind: "likert4",
      prompt: "Prefer flexibility even if the system becomes more complex.",
      rationale: "This drives architecture: simple + narrow vs modular + extensible.",
      required: true,
    },
    {
      id: "dial.vendor_lock_in_tolerance",
      kind: "likert4",
      prompt: "Accept vendor lock-in if it reduces effort and risk.",
      rationale: "Low tolerance implies portability-first patterns and clearer adapter boundaries.",
      required: true,
    },
    {
      id: "dial.security_over_convenience",
      kind: "likert4",
      prompt: "Prefer security and auditability over convenience.",
      rationale: "High preference implies stricter identity boundaries, logging, and governance checks.",
      required: true,
    },
    {
      id: "dial.opinionated_over_customizable",
      kind: "likert4",
      prompt: "Prefer an opinionated product over deep customization.",
      rationale: "Opinionated products are easier for beginners; customization increases complexity and support burden.",
      required: true,
    },
    {
      id: "dial.cost_sensitivity_high",
      kind: "likert4",
      prompt: "Minimize ongoing cost, even if it limits capabilities.",
      rationale: "High cost-sensitivity pushes toward offline-first, minimal infra, and fewer external services.",
      required: true,
    },
    {
      id: "dial.automation_over_manual",
      kind: "likert4",
      prompt: "Automate workflows even if that increases system complexity.",
      rationale: "High automation preference implies job systems, logs, and deterministic workflow contracts.",
      required: false,
    },
    {
      id: "target.platforms",
      kind: "multi_select",
      prompt: "Target platforms (where should this work?).",
      rationale: "Clarifies what we must support. Multi-platform implies stronger portability boundaries.",
      required: true,
      options: [
        { id: "web", label: "Web (browser)" },
        { id: "ios", label: "iOS" },
        { id: "android", label: "Android" },
        { id: "windows", label: "Windows" },
        { id: "macos", label: "macOS" },
        { id: "linux", label: "Linux" },
      ],
    },
  ];
}

function paletteQuestions(palettes: PaletteId[], constraints: { no_payments: boolean }): InterrogatorQuestionV1[] {
  const out: InterrogatorQuestionV1[] = [];
  const pset = new Set(palettes);

  if (pset.has("identity_access")) {
    out.push({
      id: "identity.privacy_level",
      kind: "single_select",
      prompt: "Identity posture (default).",
      rationale: "This impacts onboarding, trust/safety, and compliance assumptions.",
      required: true,
      options: [
        { id: "anonymous", label: "Anonymous", help: "No identity required; lowest friction, hardest to enforce policies." },
        { id: "pseudonymous", label: "Pseudonymous", help: "Stable identity without real-name requirements (common in Web3)." },
        { id: "real_name", label: "Real-name / verified", help: "Highest trust posture; highest onboarding burden." },
      ],
    });
  }

  if (pset.has("commerce_value_exchange")) {
    out.push({
      id: "commerce.value_exchange_mode",
      kind: "single_select",
      prompt: "Value exchange mode.",
      rationale: "Clarifies whether 'commerce' means payments, non-monetary exchange, or later integration.",
      required: true,
      options: [
        { id: "none", label: "No payments (value without money)", help: "Points, access, reputation, barter, etc." },
        { id: "later", label: "Payments later (defer)", help: "Design boundaries now; integrate later via a Kit." },
        { id: "crypto", label: "Crypto/Web3", help: "Wallet-based value exchange (staking, delegation, etc.) via Kit." },
      ],
    });

    if (constraints.no_payments) {
      out.push({
        id: "commerce.no_payments_confirmed",
        kind: "single_select",
        prompt: "Confirm: Payments are disabled in constraints.",
        rationale: "Prevents accidental implementation of payments when the constraint is explicit.",
        required: true,
        options: [
          { id: "confirmed", label: "Confirmed: no payments", help: "We will not implement payments in this phase." },
          { id: "change_constraint", label: "Change constraint later", help: "Keep it disabled now; revisit before shipping payments." },
        ],
      });
    }
  }

  if (pset.has("governance_rules_policy")) {
    out.push({
      id: "governance.approval_rigor",
      kind: "single_select",
      prompt: "Governance rigor for changes.",
      rationale: "Defines how strict the adoption/lock/release gates must be.",
      required: true,
      options: [
        { id: "light", label: "Light (fast iterations)", help: "Quick review, fewer artefacts." },
        { id: "standard", label: "Standard (balanced)", help: "Default: evidence + basic approvals." },
        { id: "strict", label: "Strict (audit-grade)", help: "More gates, more reports, higher assurance." },
      ],
    });
  }

  return out;
}

function surfaceQuestions(surface?: PrimarySurface, constraints?: { offline_first: boolean }): InterrogatorQuestionV1[] {
  const out: InterrogatorQuestionV1[] = [];
  if (surface === "mobile_app" || surface === "desktop_app") {
    out.push({
      id: "surface.local_data_expectation",
      kind: "single_select",
      prompt: "Local data expectation for your primary surface.",
      rationale: "Local-first affects storage, backup, and sync boundaries.",
      required: true,
      options: [
        { id: "cache_only", label: "Cache only", help: "Local data is replaceable; server is source of truth." },
        { id: "offline_first", label: "Offline-first", help: "Local is primary; sync is optional or deferred." },
        { id: "hybrid", label: "Hybrid", help: "Some core flows must work offline; others require network." },
      ],
    });
  }
  if (constraints?.offline_first) {
    out.push({
      id: "constraint.offline_first_strength",
      kind: "single_select",
      prompt: "Offline-first strength (given the constraint).",
      rationale: "Clarifies whether offline-first is mandatory for the core flow or a preferred best-effort.",
      required: true,
      options: [
        { id: "mandatory_core", label: "Mandatory for core flow", help: "Core must work offline; no excuses." },
        { id: "best_effort", label: "Best-effort", help: "Offline is a goal; some flows may require network." },
      ],
    });
  }
  return out;
}

export function buildInterrogatorPack(state: ProjectState): InterrogatorPackV1 {
  const palettes = Array.isArray(state.intent?.palettes) ? (state.intent.palettes as PaletteId[]) : [];
  const constraints = state.intent?.constraints || { offline_first: false, no_payments: false, required_env_names: [] as string[] };

  const items = [
    ...baseQuestions(),
    ...surfaceQuestions(state.intent?.primary_surface, { offline_first: Boolean(constraints.offline_first) }),
    ...paletteQuestions(palettes, { no_payments: Boolean(constraints.no_payments) }),
  ].filter((q) => q && q.id);

  items.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return {
    schema: "kindred.interrogator_pack.v1",
    app_version: APP_VERSION,
    created_at_utc: new Date().toISOString(),
    project: { id: String(state.project.id || ""), name: String(state.project.name || "") },
    derived_from: {
      primary_surface: state.intent?.primary_surface ? String(state.intent.primary_surface) : undefined,
      palettes: palettes.map(String).sort(),
      constraints: {
        offline_first: Boolean(constraints.offline_first),
        no_payments: Boolean(constraints.no_payments),
        required_env_names: Array.isArray(constraints.required_env_names) ? constraints.required_env_names.map(String).sort() : [],
      },
    },
    items,
  };
}

export function interrogatorPackJson(state: ProjectState): string {
  return stableJsonText(buildInterrogatorPack(state), 2);
}

export function interrogatorPackSha256(state: ProjectState): string {
  return sha256Hex(interrogatorPackJson(state));
}

function likertToSlots(id: string, v: Likert4): { slot_id: string; reason: string }[] {
  const out: { slot_id: string; reason: string }[] = [];
  // -2/-1 => "no", +1/+2 => "yes"
  const yes = v === "+1" || v === "+2";
  const strongYes = v === "+2";
  const strongNo = v === "-2";

  if (id === "dial.vendor_lock_in_tolerance" && !yes) {
    out.push({ slot_id: "constraint.vendor_lock_in_low", reason: "Low lock-in tolerance: prefer adapters + portable storage and avoid irreversible provider dependencies." });
  }
  if (id === "dial.speed_over_polish" && yes) {
    out.push({ slot_id: "constraint.time_to_value_high", reason: "Speed preference: choose simpler defaults and smaller scope per cycle." });
  }
  if (id === "dial.security_over_convenience" && strongYes) {
    out.push({ slot_id: "constraint.auditability_high", reason: "Strong security preference: require logging, provenance, and stricter gates." });
  }
  if (id === "dial.opinionated_over_customizable" && strongNo) {
    out.push({ slot_id: "constraint.customization_high", reason: "Low opinionated preference: plan plugin points and configuration surfaces early." });
  }

  return out;
}

function answersCompleteness(pack: InterrogatorPackV1, answers: Record<string, InterrogatorAnswerValueV1>): { required_total: number; required_answered: number; ok: boolean } {
  const required = pack.items.filter((q) => q.required);
  const required_total = required.length;
  let required_answered = 0;

  for (const q of required) {
    const a = answers[q.id];
    if (!a) continue;
    if (a.kind === "multi_select") {
      if (Array.isArray(a.value) && a.value.length > 0) required_answered += 1;
    } else {
      if (String((a as any).value || "").trim()) required_answered += 1;
    }
  }

  return { required_total, required_answered, ok: required_total === required_answered };
}

export function buildInterrogatorAnswers(state: ProjectState, answers: Record<string, InterrogatorAnswerValueV1>): InterrogatorAnswersV1 {
  const pack = buildInterrogatorPack(state);
  const completeness = answersCompleteness(pack, answers);

  const slots: { slot_id: string; reason: string }[] = [];

  for (const [qid, ans] of Object.entries(answers)) {
    if (ans.kind === "likert4") {
      slots.push(...likertToSlots(qid, ans.value));
    }
    if (qid === "target.platforms" && ans.kind === "multi_select") {
      if (ans.value.includes("ios") || ans.value.includes("android")) {
        slots.push({ slot_id: "surface.mobile", reason: "Mobile platforms selected: ensure mobile patterns and offline UX expectations are explicit." });
      }
      if (ans.value.includes("windows") || ans.value.includes("macos") || ans.value.includes("linux")) {
        slots.push({ slot_id: "surface.desktop", reason: "Desktop platforms selected: ensure packaging/install boundaries are considered." });
      }
    }
  }

  const dedup = uniq(slots).sort((a, b) => a.slot_id.localeCompare(b.slot_id));

  return {
    schema: "kindred.interrogator_answers.v1",
    app_version: APP_VERSION,
    captured_at_utc: new Date().toISOString(),
    project: { id: String(state.project.id || ""), name: String(state.project.name || "") },
    answers,
    completeness,
    kit_slots: dedup,
    notes: [],
  };
}

export function interrogatorAnswersJson(state: ProjectState, answers: Record<string, InterrogatorAnswerValueV1>): string {
  return stableJsonText(buildInterrogatorAnswers(state, answers), 2);
}

export function interrogatorAnswersSha256(state: ProjectState, answers: Record<string, InterrogatorAnswerValueV1>): string {
  return sha256Hex(interrogatorAnswersJson(state, answers));
}
