import type { PaletteId } from "./types";

export type LibraryChip = {
  id: string;
  label: string;
  group: string;
  description: string;
  palettes: PaletteId[];
  tags: string[];
};

/**
 * Library Builder v1 (chips-only)
 *
 * - Finite catalog (no free-text requirement entry)
 * - Kernel-neutral: capabilities only (provider specifics belong in Kits)
 * - Designed to be composable into Patterns → Kits → Repo Packs
 */

export const LIBRARIES_CATALOG_VERSION = "v1" as const;

export const LIBRARIES_CATALOG_V1: LibraryChip[] = [
  // Core surfaces
  {
    id: "core_offline_first_storage",
    label: "Offline-first storage",
    group: "Core",
    description: "Local-first persistence, sync-ready shapes, deterministic exports.",
    palettes: ["infrastructure_data_files"],
    tags: ["offline", "storage", "local"],
  },
  {
    id: "core_proposals_governance",
    label: "Proposals + adopt",
    group: "Core",
    description: "Proposal → adopt → lock loop with diffs + provenance.",
    palettes: ["governance_policy"],
    tags: ["governance", "diff", "adopt"],
  },
  {
    id: "core_design_tokens",
    label: "Design tokens",
    group: "Core",
    description: "Token knobs compile into UI blueprints (no special casing).",
    palettes: ["content_media"],
    tags: ["tokens", "ui", "style"],
  },
  {
    id: "core_accessibility_basics",
    label: "Accessibility basics",
    group: "Core",
    description: "Focusable controls, contrast guidance, keyboard flows.",
    palettes: ["reputation_safety"],
    tags: ["a11y", "ux"],
  },

  // Identity & trust
  {
    id: "identity_sessions",
    label: "Sessions & roles",
    group: "Identity & Trust",
    description: "Roles, permissions, and session primitives (provider-neutral).",
    palettes: ["identity_access"],
    tags: ["auth", "rbac"],
  },
  {
    id: "identity_wallet_bridge",
    label: "Wallet login bridge",
    group: "Identity & Trust",
    description: "Wallet-based authentication via a Kit (e.g., browser wallet bridge).",
    palettes: ["identity_access", "connection_integration"],
    tags: ["wallet", "login"],
  },
  {
    id: "identity_did_core",
    label: "DID primitives",
    group: "Identity & Trust",
    description: "Decentralized identity shapes and verification hooks (via Kits).",
    palettes: ["identity_access", "governance_policy"],
    tags: ["did", "verifiable"],
  },
  {
    id: "trust_safety_moderation",
    label: "Moderation & safety",
    group: "Identity & Trust",
    description: "Reporting, moderation actions, and audit trails.",
    palettes: ["reputation_safety"],
    tags: ["moderation", "abuse"],
  },

  // Social & communication
  {
    id: "social_profiles",
    label: "Profiles",
    group: "Social",
    description: "User profiles, display names, and identity metadata.",
    palettes: ["communication_social"],
    tags: ["profiles"],
  },
  {
    id: "social_feed_posts",
    label: "Feed + posts",
    group: "Social",
    description: "Post objects, timelines, reactions, reposts.",
    palettes: ["communication_social", "content_media"],
    tags: ["feed", "posts"],
  },
  {
    id: "social_graph_follow",
    label: "Follow graph",
    group: "Social",
    description: "Follow relationships and derived views (who follows whom).",
    palettes: ["matching_recommendation", "communication_social"],
    tags: ["graph", "follow"],
  },
  {
    id: "social_messaging",
    label: "Messaging",
    group: "Social",
    description: "DMs, threads, typing indicators (transport via Kits).",
    palettes: ["communication_social"],
    tags: ["chat", "dm"],
  },
  {
    id: "social_notifications",
    label: "Notifications",
    group: "Social",
    description: "Notification primitives (in-app, email, push via Kits).",
    palettes: ["communication_social", "automation_workflows"],
    tags: ["notify"],
  },

  // Content & media
  {
    id: "content_media_library",
    label: "Media library",
    group: "Content & Media",
    description: "Uploads, transforms, and references (storage via Kits).",
    palettes: ["content_media", "infrastructure_data_files"],
    tags: ["media", "uploads"],
  },
  {
    id: "content_editor_richtext",
    label: "Rich text editor",
    group: "Content & Media",
    description: "Rich text blocks and rendering pipeline (editor is a Kit).",
    palettes: ["content_media"],
    tags: ["editor"],
  },
  {
    id: "content_video_pipeline",
    label: "Video pipeline",
    group: "Content & Media",
    description: "Video upload, encoding, playback integration (via Kits).",
    palettes: ["content_media", "connection_integration"],
    tags: ["video"],
  },

  // Search & recommendation
  {
    id: "search_fulltext",
    label: "Full-text search",
    group: "Search & Recommendation",
    description: "Indexing + queries; provider specifics via Kits.",
    palettes: ["search_navigation", "infrastructure_data_files"],
    tags: ["search", "index"],
  },
  {
    id: "rec_basic_ranking",
    label: "Basic recommendation",
    group: "Search & Recommendation",
    description: "Ranking, relevance scoring, and explore feeds.",
    palettes: ["matching_recommendation"],
    tags: ["recommendation", "ranking"],
  },

  // Commerce
  {
    id: "commerce_catalog_listings",
    label: "Catalog + listings",
    group: "Commerce",
    description: "Products, inventory, listings, and filters.",
    palettes: ["commerce_value", "search_navigation"],
    tags: ["catalog", "listings"],
  },
  {
    id: "commerce_orders",
    label: "Orders",
    group: "Commerce",
    description: "Order lifecycle, carts, and fulfillment states.",
    palettes: ["commerce_value", "automation_workflows"],
    tags: ["orders"],
  },
  {
    id: "commerce_payments",
    label: "Payments",
    group: "Commerce",
    description: "Payment orchestration primitives (processors via Kits).",
    palettes: ["commerce_value", "connection_integration"],
    tags: ["payments"],
  },

  // Governance
  {
    id: "gov_proposals_voting",
    label: "Governance: proposals + voting",
    group: "Governance",
    description: "Proposal lifecycles, voting, tallies, and audit.",
    palettes: ["governance_policy"],
    tags: ["governance", "vote"],
  },

  // Automation & integration
  {
    id: "auto_workflows",
    label: "Automation workflows",
    group: "Automation & Integration",
    description: "Event triggers, scheduled jobs, and workflow graphs (runners via Kits).",
    palettes: ["automation_workflows"],
    tags: ["automation", "workflows"],
  },
  {
    id: "integrations_webhooks",
    label: "Webhooks",
    group: "Automation & Integration",
    description: "Inbound/outbound webhook primitives; endpoints via Kits.",
    palettes: ["connection_integration"],
    tags: ["webhook"],
  },
  {
    id: "integrations_connectors",
    label: "Connectors",
    group: "Automation & Integration",
    description: "Integration shapes for external services (Kits implement specifics).",
    palettes: ["connection_integration"],
    tags: ["integrations", "connectors"],
  },
];

export function groupLibraries(list: LibraryChip[]): Record<string, LibraryChip[]> {
  const out: Record<string, LibraryChip[]> = {};
  for (const c of list) {
    const g = c.group || "Other";
    if (!out[g]) out[g] = [];
    out[g].push(c);
  }
  for (const g of Object.keys(out)) {
    out[g].sort((a, b) => a.label.localeCompare(b.label));
  }
  return out;
}
