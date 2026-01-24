"use client";

import { normalizeLibraryIds } from "./libraries_spel";
import { normalizePatternIds } from "./patterns_spel";
import { normalizeKitIds } from "./kits_spel";

export type GoldenPathSeedV1 = {
  schema: "kindred.golden_path_seed.v1";
  launch_path_id: string;
  recommended_library_ids: string[];
  recommended_pattern_ids: string[];
  recommended_kit_ids: string[];
};

const CORE_LIBS: string[] = [
  "core_offline_first_storage",
  "core_proposals_governance",
  "core_design_tokens",
  "core_accessibility_basics",
];

const PATTERNS_BY_LAUNCH: Record<string, string[]> = {
  content_site_basic: [
    "pattern_marketing_landing",
    "pattern_docs_portal",
  ],

  wiki_basic: [
    "pattern_docs_portal",
    "pattern_search_results",
    "pattern_permissions_roles",
    "pattern_policy_rules",
    "pattern_audit_log",
    "pattern_proposals_queue",
    "pattern_voting_quorum",
    "pattern_roles_assignments",
    "pattern_governance_dashboard",
    "pattern_changelog_feed",
  ],

  product_app_basic: [
    "pattern_workspace_projects",
    "pattern_tasks_kanban",
    "pattern_notifications_center",
  ],
  community_hub_basic: [
    "pattern_feed_timeline",
    "pattern_comments_threads",
    "pattern_moderation_queue",
  ],
  marketplace_basic: [
    "pattern_marketplace_listings",
    "pattern_search_results",
    "pattern_checkout_flow",
  ],
  automation_ops_basic: [
    "pattern_workflow_builder",
    "pattern_webhooks_integrations",
    "pattern_admin_dashboard",
  ],
  api_service_basic: [
    "pattern_admin_dashboard",
    "pattern_audit_log",
    "pattern_policy_rules",
  ],
  governed_system_basic: [
    "pattern_policy_rules",
    "pattern_audit_log",
    "pattern_reputation_score",
  ],
};

const KITS_BY_LAUNCH: Record<string, string[]> = {
  governed_system_basic: ["kit__auth_stub"],
  wiki_basic: ["kit__auth_stub"],
};

function uniq(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const v = String(x || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function goldenPathSeedForLaunchPath(launch_path_id: string): GoldenPathSeedV1 {
  const launchId = String(launch_path_id || "").trim() || "content_site_basic";

  const libs = normalizeLibraryIds(uniq([...CORE_LIBS]));
  const pats = normalizePatternIds(uniq([...(PATTERNS_BY_LAUNCH[launchId] || [])]));
  const kits = normalizeKitIds(uniq([...(KITS_BY_LAUNCH[launchId] || [])]));

  return {
    schema: "kindred.golden_path_seed.v1",
    launch_path_id: launchId,
    recommended_library_ids: libs,
    recommended_pattern_ids: pats,
    recommended_kit_ids: kits,
  };
}
