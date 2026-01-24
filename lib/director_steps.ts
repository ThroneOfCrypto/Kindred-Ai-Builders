export type DirectorPhaseId = "brief" | "structure" | "style" | "review";

export type DirectorPhase = {
  id: DirectorPhaseId;
  title: string;
  hint: string;
};

/**
 * Director Mode phases.
 *
 * These are a translation layer for non-technical directors. Under the hood the
 * Builder still uses fine-grained steps.
 */
export const DIRECTOR_PHASES: DirectorPhase[] = [
  { id: "brief", title: "Brief", hint: "Direction + constraints" },
  { id: "structure", title: "Structure", hint: "Journeys + pages" },
  { id: "style", title: "Style", hint: "Voice + design knobs" },
  { id: "review", title: "Review", hint: "Export-ready" },
];

export const DIRECTOR_PHASE_TO_BUILDER_STEPS: Record<DirectorPhaseId, string[]> = {
  brief: ["project", "launch", "intent", "surface", "palettes", "brief"],
  structure: ["journey", "ia"],
  style: ["copy", "tokens"],
  review: ["review"],
};

export function directorPhaseForBuilderStep(stepId: string): DirectorPhaseId {
  const s = (stepId || "").trim();
  for (const phase of DIRECTOR_PHASES) {
    const steps = DIRECTOR_PHASE_TO_BUILDER_STEPS[phase.id];
    if (steps.includes(s)) return phase.id;
  }
  return "brief";
}

export function directorPhaseDone(phaseId: DirectorPhaseId, doneBuilderSteps: Set<string>): boolean {
  const steps = DIRECTOR_PHASE_TO_BUILDER_STEPS[phaseId] || [];
  return steps.every((s) => doneBuilderSteps.has(s));
}

/**
 * Choose a useful Builder step for a Director phase.
 * Prefer the first incomplete step; otherwise pick the last step in the phase.
 */
export function pickBuilderStepForDirectorPhase(phaseId: DirectorPhaseId, doneBuilderSteps: Set<string>): string {
  const steps = DIRECTOR_PHASE_TO_BUILDER_STEPS[phaseId] || [];
  for (const s of steps) {
    if (!doneBuilderSteps.has(s)) return s;
  }
  return steps[steps.length - 1] || "project";
}

export function directorPhaseTitle(phaseId: DirectorPhaseId): string {
  const hit = DIRECTOR_PHASES.find((p) => p.id === phaseId);
  return hit ? hit.title : "Brief";
}
