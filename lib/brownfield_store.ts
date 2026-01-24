"use client";

import { stableJsonText } from "./stable_json";
import type { BrownfieldReportV1 } from "./brownfield_scan";

export const BROWNFIELD_REPORT_SCHEMA_ID = "kindred.brownfield_report.v1" as const;

const KEY_PREFIX = "kindred_brownfield_report_v1:";

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

export function brownfieldReportKeyForProject(projectId: string): string {
  return `${KEY_PREFIX}${projectId}`;
}

export function getBrownfieldReport(projectId: string): BrownfieldReportV1 | null {
  try {
    const raw = localStorage.getItem(brownfieldReportKeyForProject(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    if (!parsed || parsed.schema !== BROWNFIELD_REPORT_SCHEMA_ID) return null;
    return parsed as BrownfieldReportV1;
  } catch {
    return null;
  }
}

export function setBrownfieldReport(projectId: string, report: BrownfieldReportV1): void {
  try {
    localStorage.setItem(brownfieldReportKeyForProject(projectId), stableJsonText(report, 2));
  } catch {
    // ignore
  }
  dispatch("kindred_brownfield_report_changed");
}

export function clearBrownfieldReport(projectId: string): void {
  try {
    localStorage.removeItem(brownfieldReportKeyForProject(projectId));
  } catch {
    // ignore
  }
  dispatch("kindred_brownfield_report_changed");
}
