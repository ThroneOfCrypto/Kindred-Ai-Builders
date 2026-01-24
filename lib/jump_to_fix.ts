import type { GateIssue } from "./gates";

export type BuilderStepId =
  | "project"
  | "launch"
  | "intent"
  | "surface"
  | "palettes"
  | "brief"
  | "journey"
  | "ia"
  | "copy"
  | "tokens"
  | "review";

export function stepLabel(step: BuilderStepId): string {
  const map: Record<BuilderStepId, string> = {
    project: "Project",
    launch: "Launch Path",
    intent: "Build Intent",
    surface: "Primary Surface",
    palettes: "Palettes",
    brief: "Brief",
    journey: "Journey",
    ia: "IA & Low-fi",
    copy: "Copy",
    tokens: "Tokens",
    review: "Review",
  };
  return map[step] || step;
}

function stepForFile(path: string): BuilderStepId | null {
  if (path.startsWith("project/")) return "project";
  if (path.startsWith("intent/launch_path")) return "launch";
  if (path.startsWith("intent/build_intent")) return "intent";
  if (path.startsWith("intent/targets")) return "surface";
  if (path.startsWith("intent/palettes")) return "palettes";
  if (path.startsWith("intent/constraints")) return "brief";
  if (path.startsWith("intent/brief")) return "brief";
  if (path.startsWith("design/profile")) return "brief";
  if (path.startsWith("design/references")) return "brief";
  if (path.startsWith("design/ia_tree")) return "ia";
  if (path.startsWith("design/lofi_layouts")) return "ia";
  if (path.startsWith("content/copy_blocks")) return "copy";
  if (path.startsWith("design/tokens")) return "tokens";
  if (path.startsWith("kernel_min/") || path.startsWith("ux/")) return "journey";
  if (path.startsWith("dist/") || path.startsWith("blueprint/") || path === "spec_pack_manifest.json") return "review";
  return null;
}

export function stepForGateIssue(issue: GateIssue): BuilderStepId | null {
  if (issue.file) {
    const byFile = stepForFile(issue.file);
    if (byFile) return byFile;
  }

  // Fallback for code-based mapping where file is missing.
  const code = issue.code || "";
  if (code.includes("LAUNCH_PATH")) return "launch";
  if (code.includes("BUILD_INTENT")) return "intent";
  if (code.includes("PRIMARY_SURFACE")) return "surface";
  if (code.includes("PALETTE")) return "palettes";
  if (code.includes("TOKEN")) return "tokens";
  if (code.includes("COPY")) return "copy";
  if (code.includes("IA_")) return "ia";
  if (code.includes("SCENE") || code.includes("FLOW") || code.includes("ACTOR")) return "journey";
  if (code.includes("MANIFEST")) return "review";
  return null;
}
