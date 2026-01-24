"use client";

import type { ProjectState } from "./types";
import { defaultIntentIntake } from "./intake";

/**
 * Deterministic demo state used for proof bundles.
 * - No random IDs
 * - No export-time timestamps
 * - Safe, minimal content
 */
export function demoDeterministicState(): ProjectState {
  return {
    schema: "kindred.builder.state.v1",
    project: {
      id: "p_demo",
      name: "Demo Project",
      created_at_utc: "1980-01-01T00:00:00.000Z",
    },
    intent: {
      palettes: [],
      intake: defaultIntentIntake(),
      constraints: { offline_first: true, no_payments: false, required_env_names: [] },
      brief: {
        audience_description: "",
        problem: "",
        offer: "",
        differentiators: [],
        key_actions: [],
        success_metrics: [],
        non_goals: [],
      },
    },
    design: {
      brand: { name: "", tagline: "", audience: "general_public", tone: "friendly" },
      references: [],
      tokens: {
        radius: "balanced",
        density: "balanced",
        contrast: "balanced",
        accent: "balanced",
        font: "balanced",
        shadow: "balanced",
      },
    },
    director: {
      schema: "kindred.director.state.v1",
      // Minimal director state; leave adopted kits/libraries empty to use kernel-neutral template.
      proposals_v1: {
        schema: "kindred.director_proposals.v1",
        base_pack_b64: null,
        proposal_pack_b64: null,
        last_proposal_summary: null,
        last_merge_report: null,
      },
      libraries_v1: {
        schema: "kindred.director_libraries.v1",
        catalog_version: "v1",
        draft_library_ids: [],
        adopted_library_ids: [],
      },
      patterns_v1: {
        schema: "kindred.director_patterns.v1",
        catalog_version: "v1",
        draft_pattern_ids: [],
        adopted_pattern_ids: [],
      },
      kits_v1: {
        schema: "kindred.director_kits.v1",
        catalog_version: "v1",
        draft_kit_ids: [],
        adopted_kit_ids: [],
      },
    },
  };
}
