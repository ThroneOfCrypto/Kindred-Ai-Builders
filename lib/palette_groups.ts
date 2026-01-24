import type { PaletteId } from "./types";

/**
 * Palette grouping is a UX-only view of the 14 Palettes.
 *
 * Doctrine:
 * - Palettes remain a closed set of 14 IDs (see blueprint/palettes/manifest.json).
 * - Grouping must not change meaning; it only reduces arbitrariness for beginners.
 *
 * This is intentionally a 2×7 split:
 * - Human Expression (what humans directly do/see)
 * - System Mechanics (how the system enforces/executes)
 *
 * Tension notes:
 * - identity_access touches both expression (identity) and mechanics (permissions).
 * - governance_policy and reputation_safety straddle policy + social dynamics.
 */

export type PaletteGroupId = "human_expression" | "system_mechanics";

export const PALETTE_GROUPS_V1: Record<PaletteGroupId, { label: string; palette_ids: PaletteId[] }> = {
  human_expression: {
    label: "Human expression",
    palette_ids: [
      "identity_access",
      "communication_social",
      "content_media",
      "knowledge_learning",
      "search_navigation",
      "matching_recommendation",
      "collaboration_work",
    ],
  },
  system_mechanics: {
    label: "System mechanics",
    palette_ids: [
      "commerce_value",
      "governance_policy",
      "reputation_safety",
      "game_incentives",
      "automation_workflows",
      "infrastructure_data_files",
      "connection_integration",
    ],
  },
};

export function groupForPalette(id: PaletteId): PaletteGroupId {
  for (const [gid, g] of Object.entries(PALETTE_GROUPS_V1) as any) {
    if (Array.isArray(g.palette_ids) && g.palette_ids.includes(id)) return gid as PaletteGroupId;
  }
  // Deterministic fallback: place unknown (should not happen) into mechanics.
  return "system_mechanics";
}
