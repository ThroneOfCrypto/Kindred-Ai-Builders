"use client";

import { SpecPack } from "./spec_pack";
import { validateSpecPack, type ValidationIssue } from "./validation";

/**
 * Builder gates are a presentation of the same validation primitives used
 * by Workbench's schema validator inspector.
 */
export type GateIssue = ValidationIssue;

export type GateReport = {
  schema: "kindred.workbench_gate_report.v1";
  captured_at_utc: string;
  status: "pass" | "fail";
  issues: GateIssue[];
};

export function runGates(pack: SpecPack): GateReport {
  const vr = validateSpecPack(pack);
  return {
    schema: "kindred.workbench_gate_report.v1",
    captured_at_utc: vr.captured_at_utc,
    status: vr.status,
    issues: vr.issues,
  };
}
