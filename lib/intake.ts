"use client";

import type { BuildIntentId, IntentIntakeV1, KeyActionId, PaletteId, PrimaryOutcomeId, ValueEmphasisId } from "./types";

export type IntakeOption<T extends string> = {
  id: T;
  label: string;
  hint: string;
};

export const PRIMARY_OUTCOMES: IntakeOption<PrimaryOutcomeId>[] = [
  { id: "inform", label: "Inform", hint: "Help the visitor understand and decide." },
  { id: "convert", label: "Convert", hint: "Turn interest into a clear next step (join / contact / try)." },
  { id: "sell", label: "Sell", hint: "Enable purchases or paid plans (even if payments are handled elsewhere)." },
  { id: "engage", label: "Engage", hint: "Create recurring usage (community, content, collaboration)." },
  { id: "automate", label: "Automate", hint: "Reduce manual work with tools, workflows, or services." },
  { id: "govern", label: "Govern", hint: "Make decisions / policies / approval flows explicit and auditable." },
];

export const VALUE_EMPHASES: IntakeOption<ValueEmphasisId>[] = [
  { id: "clarity", label: "Clarity", hint: "Simple wording and obvious next steps." },
  { id: "speed", label: "Speed", hint: "Fast to use and fast to ship." },
  { id: "trust", label: "Trust", hint: "Proof, transparency, and predictable behavior." },
  { id: "safety", label: "Safety", hint: "Guardrails and careful defaults." },
  { id: "governance", label: "Governance", hint: "Explicit rules, change control, and audit trails." },
  { id: "integration", label: "Integration", hint: "Connect to other systems via APIs and adapters." },
];

export const KEY_ACTIONS: IntakeOption<KeyActionId>[] = [
  { id: "read_key_pages", label: "Read key pages", hint: "Understand what it is, why it matters, and how it works." },
  { id: "subscribe_join", label: "Join / subscribe", hint: "Become a member, subscriber, or community participant." },
  { id: "contact_demo", label: "Contact / request demo", hint: "Start a conversation or request access." },
  { id: "sign_in", label: "Sign in", hint: "Enter the product to access personalized experiences." },
  { id: "do_primary_task", label: "Do the primary task", hint: "Complete the core job-to-be-done." },
  { id: "search_browse", label: "Search / browse", hint: "Find items, features, or information." },
  { id: "view_listing", label: "View listing", hint: "Inspect an item, record, or detail view." },
  { id: "create_post", label: "Create / post", hint: "Create a new item, message, or record." },
  { id: "moderate_report", label: "Moderate / report", hint: "Handle trust & safety operations." },
  { id: "start_checkout", label: "Start checkout", hint: "Begin a purchase flow." },
  { id: "connect_integration", label: "Connect integration", hint: "Wire an external service or account." },
  { id: "create_workflow", label: "Create workflow", hint: "Define automation or an orchestration." },
  { id: "run_monitor", label: "Run / monitor", hint: "Operate and observe system health." },
  { id: "read_docs", label: "Read docs", hint: "Learn how to use or integrate the system." },
  { id: "create_api_key", label: "Create API key", hint: "Generate a credential for programmatic access." },
  { id: "make_first_request", label: "Make first request", hint: "Test the integration with a simple call." },
  { id: "read_rules", label: "Read rules", hint: "Understand policies and constraints." },
  { id: "create_proposal", label: "Create proposal", hint: "Submit a change or decision request." },
  { id: "vote_approve", label: "Vote / approve", hint: "Approve or reject proposals." },
];

function byId<T extends string>(list: IntakeOption<T>[], id: any): IntakeOption<T> | null {
  const key = String(id || "").trim();
  if (!key) return null;
  return list.find((x) => x.id === (key as any)) || null;
}

function uniq<T>(arr: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const k = String(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

export function defaultIntentIntake(args?: {
  build_intent?: BuildIntentId | null;
  palettes?: PaletteId[];
  legacy_notes?: string;
}): IntentIntakeV1 {
  const build_intent = args?.build_intent || null;
  const palettes = Array.isArray(args?.palettes) ? args!.palettes! : [];
  return normalizeIntentIntake({ raw: {}, build_intent, palettes, legacy_notes: args?.legacy_notes });
}

export function recommendPrimaryOutcome(build_intent?: BuildIntentId | null): PrimaryOutcomeId {
  const b = String(build_intent || "").trim();
  if (b === "website") return "inform";
  if (b === "product_app") return "convert";
  if (b === "marketplace") return "sell";
  if (b === "community") return "engage";
  if (b === "automation") return "automate";
  if (b === "data_api") return "automate";
  if (b === "governed_system") return "govern";
  return "inform";
}

export function recommendValueEmphasis(args: { build_intent?: BuildIntentId | null; palettes?: PaletteId[] }): ValueEmphasisId {
  const palettes = Array.isArray(args.palettes) ? args.palettes : [];
  if (palettes.includes("reputation_safety")) return "safety";
  if (palettes.includes("identity_access")) return "trust";
  if (palettes.includes("governance_policy")) return "governance";
  if (palettes.includes("connection_integration")) return "integration";
  const b = String(args.build_intent || "").trim();
  if (b === "automation" || b === "data_api") return "speed";
  return "clarity";
}

export function recommendKeyActionIds(args: { build_intent?: BuildIntentId | null; palettes?: PaletteId[] }): KeyActionId[] {
  const b = String(args.build_intent || "").trim();
  const palettes = Array.isArray(args.palettes) ? args.palettes : [];

  let base: KeyActionId[];
  if (b === "website") base = ["read_key_pages", "subscribe_join", "contact_demo"];
  else if (b === "product_app") base = ["sign_in", "do_primary_task", "search_browse"];
  else if (b === "marketplace") base = ["search_browse", "view_listing", "start_checkout"];
  else if (b === "community") base = ["search_browse", "create_post", "moderate_report"];
  else if (b === "automation") base = ["connect_integration", "create_workflow", "run_monitor"];
  else if (b === "data_api") base = ["read_docs", "create_api_key", "make_first_request"];
  else if (b === "governed_system") base = ["read_rules", "create_proposal", "vote_approve"];
  else base = ["read_key_pages", "subscribe_join", "contact_demo"];

  if (palettes.includes("governance_policy")) {
    base = base.concat(["read_rules", "create_proposal", "vote_approve"]);
  }
  if (palettes.includes("reputation_safety") && !base.includes("moderate_report")) {
    base = base.concat(["moderate_report"]);
  }
  if (palettes.includes("commerce_value") && !base.includes("start_checkout")) {
    base = base.concat(["start_checkout"]);
  }

  return uniq(base).slice(0, 8);
}

export function normalizeKeyActionIds(raw: any): KeyActionId[] {
  const ids = Array.isArray(raw) ? raw : [];
  const out: KeyActionId[] = [];
  for (const x of ids) {
    const opt = byId(KEY_ACTIONS, x);
    if (!opt) continue;
    out.push(opt.id);
  }
  return uniq(out).slice(0, 8);
}

export function normalizeIntentIntake(args: {
  raw: any;
  build_intent?: BuildIntentId | null;
  palettes?: PaletteId[];
  legacy_notes?: string;
}): IntentIntakeV1 {
  const raw = args.raw && typeof args.raw === "object" ? args.raw : {};

  const primary = (byId(PRIMARY_OUTCOMES, (raw as any).primary_outcome)?.id ||
    recommendPrimaryOutcome(args.build_intent)) as PrimaryOutcomeId;

  const emphasis = (byId(VALUE_EMPHASES, (raw as any).value_emphasis)?.id ||
    recommendValueEmphasis({ build_intent: args.build_intent, palettes: args.palettes })) as ValueEmphasisId;

  const rawActions = normalizeKeyActionIds((raw as any).key_action_ids);
  const key_action_ids = rawActions.length > 0 ? rawActions : recommendKeyActionIds({ build_intent: args.build_intent, palettes: args.palettes });

  const notes = typeof (raw as any).notes === "string" ? String((raw as any).notes) : String(args.legacy_notes || "");

  const normalizeExamples = (v: any): string[] => {
    const arr = Array.isArray(v) ? v : [];
    const cleaned = arr
      .map((x) => String(x || "").trim())
      .filter((x) => x.length > 0)
      .slice(0, 8);
    return cleaned;
  };

  const liked_examples = normalizeExamples((raw as any).liked_examples);
  const disliked_examples = normalizeExamples((raw as any).disliked_examples);

  const vdRaw = String((raw as any).visual_density || "").trim();
  const visual_density = (vdRaw === "airy" || vdRaw === "balanced" || vdRaw === "dense") ? (vdRaw as any) : undefined;

  return {
    schema: "kindred.intent.intake.v1",
    primary_outcome: primary,
    value_emphasis: emphasis,
    key_action_ids,
    ...(liked_examples.length ? { liked_examples } : {}),
    ...(disliked_examples.length ? { disliked_examples } : {}),
    ...(visual_density ? { visual_density } : {}),
    notes,
  };
}

export function legacyBriefToNotes(brief: any): string {
  const b = brief && typeof brief === "object" ? brief : {};
  const lines: string[] = [];

  const aud = String((b as any).audience_description || "").trim();
  const prob = String((b as any).problem || "").trim();
  const offer = String((b as any).offer || "").trim();
  if (aud) lines.push(`Audience: ${aud}`);
  if (prob) lines.push(`Problem: ${prob}`);
  if (offer) lines.push(`Offer: ${offer}`);

  function list(title: string, raw: any) {
    const arr = Array.isArray(raw) ? raw : [];
    const cleaned = arr.map((x) => String(x || "").trim()).filter((x) => x.length > 0).slice(0, 10);
    if (cleaned.length === 0) return;
    lines.push(`${title}:`);
    for (const x of cleaned) lines.push(`- ${x}`);
  }

  list("Differentiators", (b as any).differentiators);
  list("Key actions", (b as any).key_actions);
  list("Success metrics", (b as any).success_metrics);
  list("Non-goals", (b as any).non_goals);

  return lines.join("\n").trim();
}

export function labelForKeyAction(id: KeyActionId): string {
  return byId(KEY_ACTIONS, id)?.label || String(id);
}
