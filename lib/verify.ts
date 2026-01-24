"use client";

import { stableJsonText } from "./stable_json";
import { APP_VERSION } from "./version";

export type VerifyTri = "pass" | "warn" | "fail";
export type VerifyStepStatus = VerifyTri | "skip";

export type VerifyPlanStep = {
  id: string;
  title: string;
  required: boolean;
  commands: string[];
  expect?: string[];
};

export type VerifyPlanMapping = {
  required_step_fail: "fail";
  required_step_warn: "warn";
  required_step_skip: "warn";
  optional_step_fail: "warn";
  optional_step_warn: "warn";
  all_pass: "pass";
};

export type VerifyPlan = {
  schema: "kindred.verify_plan.v1";
  plan_id: string;
  plan_version: string;
  title: string;
  description?: string;
  created_at_utc: string;
  instructions_md?: string;
  steps: VerifyPlanStep[];
  mapping: VerifyPlanMapping;
  provenance?: {
    app_version?: string;
    kit_id?: string;
    kit_version?: string;
  };
};

export type VerifyReport = {
  schema: "kindred.verify_report.v1";
  captured_at_utc: string;
  plan_id: string;
  plan_version: string;
  subject?: {
    label?: string;
    notes?: string;
  };
  overall: VerifyTri;
  steps: Array<{
    id: string;
    title: string;
    required: boolean;
    status: VerifyStepStatus;
    commands?: string[];
    exit_code?: number;
    stdout_excerpt?: string;
    stderr_excerpt?: string;
  }>;
  raw_text?: string;
  notes?: string[];
  provenance?: {
    tool?: string;
    tool_version?: string;
    app_version?: string;
    kit_id?: string;
    kit_version?: string;
  };
};

export type VerifyStoreV1 = {
  schema: "kindred.verify_store.v1";
  reports: VerifyReport[];
};

const VERIFY_STORE_KEY_PREFIX = "kindred_verify_store_v1:";

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function verifyStoreKeyForProject(projectId: string): string {
  return `${VERIFY_STORE_KEY_PREFIX}${projectId}`;
}

export function computeVerifyOverallFromSteps(steps: VerifyReport["steps"]): VerifyTri {
  // Required step fail => FAIL.
  for (const s of steps) {
    if (s.required && s.status === "fail") return "fail";
  }

  // Required warn/skip => WARN.
  for (const s of steps) {
    if (s.required && (s.status === "warn" || s.status === "skip")) return "warn";
  }

  // Optional fail/warn => WARN.
  for (const s of steps) {
    if (!s.required && (s.status === "fail" || s.status === "warn")) return "warn";
  }

  return "pass";
}

function normalizeVerifyStore(raw: any): VerifyStoreV1 {
  if (!raw || typeof raw !== "object") return { schema: "kindred.verify_store.v1", reports: [] };
  if (raw.schema !== "kindred.verify_store.v1") return { schema: "kindred.verify_store.v1", reports: [] };
  const reportsIn: any[] = Array.isArray(raw.reports) ? raw.reports : [];

  const reports: VerifyReport[] = [];
  for (const r of reportsIn) {
    const nr = normalizeVerifyReport(r);
    if (nr.ok && nr.report) reports.push(nr.report);
  }

  return { schema: "kindred.verify_store.v1", reports };
}

export function normalizeVerifyReport(raw: any): { ok: boolean; report?: VerifyReport; issues: string[] } {
  const issues: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, issues: ["Not an object."] };

  if (raw.schema !== "kindred.verify_report.v1") issues.push("schema must be kindred.verify_report.v1");

  const captured_at_utc = typeof raw.captured_at_utc === "string" ? raw.captured_at_utc : "";
  if (!captured_at_utc) issues.push("captured_at_utc is required");

  const plan_id = typeof raw.plan_id === "string" ? raw.plan_id : "";
  if (!plan_id) issues.push("plan_id is required");

  const plan_version = typeof raw.plan_version === "string" ? raw.plan_version : "";
  if (!plan_version) issues.push("plan_version is required");

  const overall = raw.overall === "pass" || raw.overall === "warn" || raw.overall === "fail" ? (raw.overall as VerifyTri) : null;
  if (!overall) issues.push("overall must be pass|warn|fail");

  const stepsIn: any[] = Array.isArray(raw.steps) ? raw.steps : [];
  if (stepsIn.length === 0) issues.push("steps must be a non-empty array");

  const steps: VerifyReport["steps"] = [];
  for (const s of stepsIn) {
    if (!s || typeof s !== "object") continue;
    const id = typeof s.id === "string" ? s.id : "";
    const title = typeof s.title === "string" ? s.title : "";
    const required = typeof s.required === "boolean" ? s.required : false;
    const status: VerifyStepStatus = s.status === "pass" || s.status === "warn" || s.status === "fail" || s.status === "skip" ? s.status : "skip";
    if (!id || !title) continue;

    const commands = Array.isArray(s.commands) ? s.commands.filter((c: any) => typeof c === "string") : undefined;
    const exit_code = typeof s.exit_code === "number" ? s.exit_code : undefined;
    const stdout_excerpt = typeof s.stdout_excerpt === "string" ? s.stdout_excerpt : undefined;
    const stderr_excerpt = typeof s.stderr_excerpt === "string" ? s.stderr_excerpt : undefined;

    steps.push({ id, title, required, status, commands, exit_code, stdout_excerpt, stderr_excerpt });
  }

  const subject = raw.subject && typeof raw.subject === "object" ? {
    label: typeof raw.subject.label === "string" ? raw.subject.label : undefined,
    notes: typeof raw.subject.notes === "string" ? raw.subject.notes : undefined,
  } : undefined;

  const raw_text = typeof raw.raw_text === "string" ? raw.raw_text : undefined;
  const notes = Array.isArray(raw.notes) ? raw.notes.filter((n: any) => typeof n === "string") : undefined;

  const provenance = raw.provenance && typeof raw.provenance === "object" ? {
    tool: typeof raw.provenance.tool === "string" ? raw.provenance.tool : undefined,
    tool_version: typeof raw.provenance.tool_version === "string" ? raw.provenance.tool_version : undefined,
    app_version: typeof raw.provenance.app_version === "string" ? raw.provenance.app_version : undefined,
    kit_id: typeof raw.provenance.kit_id === "string" ? raw.provenance.kit_id : undefined,
    kit_version: typeof raw.provenance.kit_version === "string" ? raw.provenance.kit_version : undefined,
  } : undefined;

  if (issues.length > 0) return { ok: false, issues };

  const report: VerifyReport = {
    schema: "kindred.verify_report.v1",
    captured_at_utc,
    plan_id,
    plan_version,
    subject,
    overall: overall as VerifyTri,
    steps,
    raw_text,
    notes,
    provenance,
  };

  // Defensive: ensure overall matches computed result when possible.
  if (steps.length > 0) {
    const computed = computeVerifyOverallFromSteps(steps);
    report.overall = computed;
  }

  return { ok: true, report, issues: [] };
}

export function wrapRawTextAsVerifyReport(plan: VerifyPlan, rawText: string, opts?: { subject_label?: string }): VerifyReport {
  const now = new Date().toISOString();
  const clipped = rawText.length > 200_000 ? rawText.slice(0, 200_000) + "\n\n[clipped]\n" : rawText;

  const steps: VerifyReport["steps"] = plan.steps.map((s) => ({
    id: s.id,
    title: s.title,
    required: s.required,
    status: "skip" as VerifyStepStatus,
    commands: s.commands,
  }));

  const overall = computeVerifyOverallFromSteps(steps);

  return {
    schema: "kindred.verify_report.v1",
    captured_at_utc: now,
    plan_id: plan.plan_id,
    plan_version: plan.plan_version,
    subject: {
      label: opts?.subject_label || "",
      notes: "Uploaded as raw text; step statuses are unconfirmed.",
    },
    overall,
    steps,
    raw_text: clipped,
    notes: [],
    provenance: {
      tool: "kindred_ui_upload",
      tool_version: APP_VERSION,
      app_version: APP_VERSION,
    },
  };
}

export function loadVerifyStore(projectId: string): VerifyStoreV1 {
  try {
    const raw = localStorage.getItem(verifyStoreKeyForProject(projectId)) || "";
    if (!raw) return { schema: "kindred.verify_store.v1", reports: [] };
    const parsed = safeJsonParse<any>(raw);
    return normalizeVerifyStore(parsed);
  } catch {
    return { schema: "kindred.verify_store.v1", reports: [] };
  }
}

export function saveVerifyStore(projectId: string, store: VerifyStoreV1) {
  try {
    localStorage.setItem(verifyStoreKeyForProject(projectId), stableJsonText(store, 2));
  } catch {
    // ignore
  }
  dispatch("kindred_verify_reports_changed");
}

function sortNewestFirst(reports: VerifyReport[]): VerifyReport[] {
  return [...reports].sort((a, b) => (b.captured_at_utc || "").localeCompare(a.captured_at_utc || ""));
}

export function addVerifyReport(projectId: string, report: VerifyReport, opts?: { max_reports?: number }): VerifyStoreV1 {
  const max = typeof opts?.max_reports === "number" ? opts.max_reports : 20;
  const store = loadVerifyStore(projectId);
  const reports = sortNewestFirst([...store.reports, report]);
  const trimmed = reports.slice(0, Math.max(1, max));
  const next: VerifyStoreV1 = { schema: "kindred.verify_store.v1", reports: trimmed };
  saveVerifyStore(projectId, next);
  return next;
}

export function deleteVerifyReport(projectId: string, captured_at_utc: string): VerifyStoreV1 {
  const store = loadVerifyStore(projectId);
  const next: VerifyStoreV1 = {
    schema: "kindred.verify_store.v1",
    reports: store.reports.filter((r) => r.captured_at_utc !== captured_at_utc),
  };
  saveVerifyStore(projectId, next);
  return next;
}

export function getLatestVerifyReport(projectId: string): VerifyReport | null {
  const store = loadVerifyStore(projectId);
  const sorted = sortNewestFirst(store.reports);
  return sorted.length > 0 ? sorted[0] : null;
}
