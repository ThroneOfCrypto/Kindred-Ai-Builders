import type { PaletteId } from "./types";

export type PatternChip = {
  id: string;
  label: string;
  group: string;
  description: string;
  palettes: PaletteId[];
  tags: string[];
};

/**
 * Patterns Builder v1 (catalog-driven)
 *
 * Patterns represent reusable features that compose capability Libraries into product behaviours.
 *
 * - Finite catalog (no free-text requirement entry)
 * - Kernel-neutral: patterns describe behaviour; provider specifics belong in Kits
 * - Designed to compile into UI Blueprints → Kits → Repo Packs
 */

export const PATTERNS_CATALOG_VERSION = "v1" as const;

export const PATTERNS_CATALOG_V1: PatternChip[] = [
  // Information + navigation
  {
    id: "pattern_marketing_landing",
    label: "Landing page (marketing)",
    group: "Information",
    description: "Hero → value props → social proof → FAQ → CTA composition.",
    palettes: ["content_media", "search_navigation"],
    tags: ["landing", "marketing"],
  },
  {
    id: "pattern_docs_portal",
    label: "Docs portal",
    group: "Information",
    description: "Docs IA, sidebar navigation, search, and content blocks.",
    palettes: ["knowledge_learning", "search_navigation", "content_media"],
    tags: ["docs", "knowledge"],
  },
  {
    id: "pattern_search_results",
    label: "Search + results",
    group: "Information",
    description: "Query, filters, result cards, pagination, empty states.",
    palettes: ["search_navigation"],
    tags: ["search", "filters"],
  },

  // Identity
  {
    id: "pattern_sign_in",
    label: "Sign in (provider-neutral)",
    group: "Identity",
    description: "Sign-in routes, session handling, role selection hooks.",
    palettes: ["identity_access"],
    tags: ["auth", "signin"],
  },
  {
    id: "pattern_profile_settings",
    label: "Profile + settings",
    group: "Identity",
    description: "Profile page, settings pages, preferences, privacy toggles.",
    palettes: ["identity_access", "communication_social"],
    tags: ["profile", "settings"],
  },
  {
    id: "pattern_permissions_roles",
    label: "Roles + permissions",
    group: "Identity",
    description: "RBAC matrices, protected routes, admin controls.",
    palettes: ["identity_access", "governance_policy"],
    tags: ["rbac", "roles"],
  },

  // Social & communication
  {
    id: "pattern_feed_timeline",
    label: "Timeline feed",
    group: "Social",
    description: "Compose + render posts, reactions, reposts, pagination.",
    palettes: ["communication_social", "content_media"],
    tags: ["feed", "posts"],
  },
  {
    id: "pattern_comments_threads",
    label: "Comments + threads",
    group: "Social",
    description: "Nested replies, sorting, moderation hooks, reporting.",
    palettes: ["communication_social", "reputation_safety"],
    tags: ["comments", "threads"],
  },
  {
    id: "pattern_messaging_threads",
    label: "Messaging (threads)",
    group: "Social",
    description: "DM threads, read receipts (optional), notifications hooks.",
    palettes: ["communication_social"],
    tags: ["dm", "messaging"],
  },
  {
    id: "pattern_notifications_center",
    label: "Notifications center",
    group: "Social",
    description: "In-app notification list, unread counts, preferences.",
    palettes: ["communication_social", "automation_workflows"],
    tags: ["notifications"],
  },
  {
    id: "pattern_groups_membership",
    label: "Groups + membership",
    group: "Social",
    description: "Group pages, membership roles, invites, join requests.",
    palettes: ["communication_social", "governance_policy"],
    tags: ["groups", "membership"],
  },

  // Commerce
  {
    id: "pattern_marketplace_listings",
    label: "Marketplace listings",
    group: "Commerce",
    description: "Listing cards, listing detail pages, filters, saved searches.",
    palettes: ["commerce_value", "search_navigation"],
    tags: ["marketplace", "listings"],
  },
  {
    id: "pattern_checkout_flow",
    label: "Checkout flow",
    group: "Commerce",
    description: "Cart, checkout steps, confirmation, receipts.",
    palettes: ["commerce_value"],
    tags: ["checkout", "cart"],
  },
  {
    id: "pattern_orders_dashboard",
    label: "Orders dashboard",
    group: "Commerce",
    description: "Order status tracking, cancellation/refunds hooks, history.",
    palettes: ["commerce_value", "collaboration_work"],
    tags: ["orders"],
  },
  {
    id: "pattern_subscriptions_billing",
    label: "Subscriptions + billing",
    group: "Commerce",
    description: "Plan selection, upgrade/downgrade, invoices and billing settings.",
    palettes: ["commerce_value"],
    tags: ["billing", "subscriptions"],
  },

  // Work & collaboration
  {
    id: "pattern_workspace_projects",
    label: "Workspaces + projects",
    group: "Work",
    description: "Workspace switcher, project list, activity stream.",
    palettes: ["collaboration_work", "infrastructure_data_files"],
    tags: ["workspace", "projects"],
  },
  {
    id: "pattern_tasks_kanban",
    label: "Tasks (kanban)",
    group: "Work",
    description: "Columns, task cards, assignment, due dates, filters.",
    palettes: ["collaboration_work"],
    tags: ["tasks", "kanban"],
  },
  {
    id: "pattern_crm_pipeline",
    label: "Pipeline (CRM)",
    group: "Work",
    description: "Leads/opportunities pipeline with stages and notes.",
    palettes: ["collaboration_work", "commerce_value"],
    tags: ["crm", "pipeline"],
  },

  // Governance & safety
  {
    id: "pattern_moderation_queue",
    label: "Moderation queue",
    group: "Governance & Safety",
    description: "Reported content queue, actions, escalation, audit trail.",
    palettes: ["reputation_safety", "governance_policy"],
    tags: ["moderation", "abuse"],
  },
  {
    id: "pattern_policy_rules",
    label: "Policy + rules",
    group: "Governance & Safety",
    description: "Rules surface, enforcement hooks, transparency logs.",
    palettes: ["governance_policy"],
    tags: ["policy", "rules"],
  },

  {
    id: "pattern_proposals_queue",
    label: "Proposals queue",
    group: "Governance & Safety",
    description: "Draft → review → adopt/reject lifecycle with rationale capture and immutable receipts.",
    palettes: ["governance_policy", "collaboration_work"],
    tags: ["governance", "proposals"],
  },
  {
    id: "pattern_voting_quorum",
    label: "Voting + quorum",
    group: "Governance & Safety",
    description: "Voting window, quorum thresholds, and outcome resolution (bundle-ready, no freeform).",
    palettes: ["governance_policy"],
    tags: ["governance", "voting"],
  },
  {
    id: "pattern_roles_assignments",
    label: "Role assignments",
    group: "Governance & Safety",
    description: "Assign/revoke roles with audit trail and constrained permission presets.",
    palettes: ["governance_policy", "identity_access"],
    tags: ["roles", "permissions"],
  },
  {
    id: "pattern_governance_dashboard",
    label: "Governance dashboard",
    group: "Governance & Safety",
    description: "Overview widgets: proposals, votes, members, quorum status, and recent changes.",
    palettes: ["governance_policy", "infrastructure_data_files"],
    tags: ["dashboard", "governance"],
  },
  {
    id: "pattern_changelog_feed",
    label: "Change log feed",
    group: "Governance & Safety",
    description: "Human-readable feed of adopted changes (separate from raw audit logs).",
    palettes: ["governance_policy", "communication_social"],
    tags: ["changelog", "transparency"],
  },
  {
    id: "pattern_reputation_score",
    label: "Reputation scoring",
    group: "Governance & Safety",
    description: "Signals → score, thresholds, rate limits, trust levels.",
    palettes: ["reputation_safety", "game_incentives"],
    tags: ["reputation", "trust"],
  },

  // Automation
  {
    id: "pattern_workflow_builder",
    label: "Workflow builder",
    group: "Automation",
    description: "Trigger → actions graph, schedules, run logs.",
    palettes: ["automation_workflows"],
    tags: ["automation", "workflow"],
  },
  {
    id: "pattern_webhooks_integrations",
    label: "Webhooks + integrations",
    group: "Automation",
    description: "Webhook endpoints, retries, signing, integration catalog.",
    palettes: ["connection_integration", "automation_workflows"],
    tags: ["webhooks", "integrations"],
  },

  // Data & infrastructure
  {
    id: "pattern_admin_dashboard",
    label: "Admin dashboard",
    group: "Data & Infrastructure",
    description: "Admin pages, tables, filters, export/import.",
    palettes: ["infrastructure_data_files", "collaboration_work"],
    tags: ["admin", "dashboard"],
  },
  {
    id: "pattern_audit_log",
    label: "Audit log",
    group: "Data & Infrastructure",
    description: "Append-only audit trail UI + retention policy hooks.",
    palettes: ["governance_policy", "infrastructure_data_files"],
    tags: ["audit", "logs"],
  },
];

export function groupPatterns(items: PatternChip[]): Record<string, PatternChip[]> {
  const grouped: Record<string, PatternChip[]> = {};
  for (const c of items) {
    const g = c.group || "Other";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(c);
  }
  for (const k of Object.keys(grouped)) {
    grouped[k] = grouped[k].slice().sort((a, b) => a.label.localeCompare(b.label));
  }
  return grouped;
}
