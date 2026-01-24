"use client";

import { stableJsonText } from "./stable_json";
import { APP_VERSION } from "./version";

export type FeedbackReportV1 = {
  schema: "kindred.feedback_report.v1";
  captured_at_utc: string;
  project_id: string;
  subject: {
    label: string;
    deployment_url?: string;
    environment?: string;
    git_commit_sha?: string;
    git_commit_ref?: string;
  };
  report: {
    title: string;
    expected: string;
    actual: string;
    steps: string;
    severity: "low" | "medium" | "high";
    area: "ux" | "copy" | "flow" | "bug" | "performance" | "accessibility" | "security" | "other";
  };
  context?: {
    url?: string;
    user_agent?: string;
    viewport?: { w: number; h: number };
    local_time?: string;
  };
  evidence?: {
    vercel_log_share_url?: string;
    notes?: string;
  };
  provenance: {
    tool: string;
    tool_version: string;
    app_version: string;
  };
};

export type FeedbackStoreV1 = {
  schema: "kindred.feedback_store.v1";
  project_id: string;
  reports: FeedbackReportV1[];
};

const KEY_PREFIX = "kindred_feedback_store_v1:";

function keyForProject(projectId: string): string {
  return `${KEY_PREFIX}${String(projectId || "").trim() || "default"}`;
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function loadFeedbackStore(projectId: string): FeedbackStoreV1 {
  const pid = String(projectId || "").trim() || "default";
  try {
    const raw = localStorage.getItem(keyForProject(pid));
    if (!raw) return { schema: "kindred.feedback_store.v1", project_id: pid, reports: [] };
    const parsed = safeJsonParse<any>(raw);
    if (!parsed || parsed.schema !== "kindred.feedback_store.v1" || !Array.isArray(parsed.reports)) {
      return { schema: "kindred.feedback_store.v1", project_id: pid, reports: [] };
    }

    const reports: FeedbackReportV1[] = parsed.reports
      .filter((r: any) => r && r.schema === "kindred.feedback_report.v1")
      .map((r: any) => r as FeedbackReportV1);

    return { schema: "kindred.feedback_store.v1", project_id: pid, reports: reports.slice(0, 200) };
  } catch {
    return { schema: "kindred.feedback_store.v1", project_id: pid, reports: [] };
  }
}

export function saveFeedbackStore(store: FeedbackStoreV1): void {
  const pid = String(store?.project_id || "").trim() || "default";
  try {
    localStorage.setItem(keyForProject(pid), stableJsonText(store));
  } catch {
    // ignore
  }
}

export function createFeedbackReport(args: {
  project_id: string;
  title: string;
  expected: string;
  actual: string;
  steps: string;
  severity: FeedbackReportV1["report"]["severity"];
  area: FeedbackReportV1["report"]["area"];
  subject_label?: string;
  subject_meta?: Partial<FeedbackReportV1["subject"]>;
  evidence?: FeedbackReportV1["evidence"];
}): FeedbackReportV1 {
  const now = new Date();
  const ctx: FeedbackReportV1["context"] = {
    url: typeof window !== "undefined" ? window.location.href : undefined,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    viewport: typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : undefined,
    local_time: now.toString(),
  };

  return {
    schema: "kindred.feedback_report.v1",
    captured_at_utc: now.toISOString(),
    project_id: String(args.project_id || "default"),
    subject: {
      label: args.subject_label || "feedback",
      ...(args.subject_meta || {}),
    },
    report: {
      title: args.title,
      expected: args.expected,
      actual: args.actual,
      steps: args.steps,
      severity: args.severity,
      area: args.area,
    },
    context: ctx,
    evidence: args.evidence,
    provenance: {
      tool: "kindred_feedback",
      tool_version: APP_VERSION,
      app_version: APP_VERSION,
    },
  };
}

export function addFeedbackReport(projectId: string, report: FeedbackReportV1): FeedbackStoreV1 {
  const pid = String(projectId || "").trim() || "default";
  const store = loadFeedbackStore(pid);
  const next: FeedbackStoreV1 = {
    schema: "kindred.feedback_store.v1",
    project_id: pid,
    reports: [report, ...store.reports].slice(0, 200),
  };
  saveFeedbackStore(next);
  return next;
}

export function deleteFeedbackReport(projectId: string, captured_at_utc: string): FeedbackStoreV1 {
  const pid = String(projectId || "").trim() || "default";
  const store = loadFeedbackStore(pid);
  const next: FeedbackStoreV1 = {
    schema: "kindred.feedback_store.v1",
    project_id: pid,
    reports: store.reports.filter((r) => r.captured_at_utc !== captured_at_utc),
  };
  saveFeedbackStore(next);
  return next;
}
