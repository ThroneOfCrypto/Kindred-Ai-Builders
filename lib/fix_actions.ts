"use client";

import type { GateIssue } from "./gates";
import { stepForGateIssue, stepLabel, type BuilderStepId } from "./jump_to_fix";

export type FixSuggestion = {
  step: BuilderStepId;
  anchor?: string | null;
  action: string;
};

export function anchorForGateIssue(issue: GateIssue): string | null {
  const step = stepForGateIssue(issue);
  if (!step) return null;
  return anchorForIssue(issue, step);
}

function anchorForIssue(issue: GateIssue, step: BuilderStepId): string | null {
  const f = issue.file || "";
  const code = issue.code || "";

  if (step === "ia") {
    if (f.startsWith("design/lofi_layouts") || code.startsWith("LOFI_")) return "fix-lofi";
    return "fix-ia-tree";
  }

  if (step === "copy") return "fix-copy";

  if (step === "journey") return "fix-journey";
  if (step === "tokens") return "fix-tokens";
  if (step === "brief") return "fix-brief";
  if (step === "palettes") return "fix-palettes";
  if (step === "surface") return "fix-surface";
  if (step === "intent") return "fix-intent";
  if (step === "launch") return "fix-launch";
  if (step === "project") return "fix-project";
  return null;
}

function actionForIssue(issue: GateIssue, step: BuilderStepId): string {
  const code = issue.code || "";

  switch (code) {
    case "BUILD_INTENT_INVALID":
      return "Select a supported build intent";
    case "PRIMARY_SURFACE_INVALID":
      return "Select a supported primary surface";
    case "PALETTES_EMPTY":
      return "Select at least one palette";
    case "PALETTE_INVALID":
      return "Remove invalid palette ids";
    case "PALETTE_RECOMMENDED_MISSING":
      return "Optionally add the recommended palette";
    case "CONSTRAINT_INVALID":
      return "Set the constraint value";
    case "BRIEF_INVALID":
      return "Fill the required brief field";
    case "BRIEF_EMPTY":
      return "Add meaningful brief text";
    case "TOKEN_INVALID":
      return "Choose a valid token option";
    case "TOKEN_MISSING":
      return "Set this token (or accept the default)";
    case "IA_TREE_INVALID":
      return "Add at least one IA page";
    case "IA_ROUTE_MISSING":
      return "Add a route path for this page";
    case "IA_ROUTE_INVALID":
      return "Fix the route path (start with /, no spaces)";
    case "IA_PARENT_INVALID":
      return "Fix the parent link (parent_id)";
    case "IA_CYCLE":
      return "Remove the IA parent loop";
    case "ENTRY_SCENE_INVALID":
      return "Mark exactly one scene as entry";
    case "ACTORS_EMPTY":
      return "Add at least one actor";
    case "SCENES_EMPTY":
      return "Add scenes and set one entry";
    case "FLOWS_EMPTY":
      return "Add at least one flow";
    case "COPY_SCHEMA_INVALID":
      return "Fix the copy blocks schema";
    case "COPY_BLOCK_INVALID":
      return "Fix the copy block fields";
    case "COPY_BLOCK_PAGE_INVALID":
      return "Choose a valid page for this copy block";
    case "COPY_BLOCK_DUPLICATE_ID":
      return "Remove or rename duplicate copy block ids";
    case "LOFI_ACTIVE_INVALID":
      return "Pick an active low-fi variant";
    case "JSON_INVALID":
      return "Fix the fields so export produces valid JSON";
    default:
      return `Fix in ${stepLabel(step)}`;
  }
}

export function suggestionForGateIssue(issue: GateIssue): FixSuggestion | null {
  const step = stepForGateIssue(issue);
  if (!step) return null;
  return {
    step,
    anchor: anchorForIssue(issue, step),
    action: actionForIssue(issue, step),
  };
}
