import type { CapabilityVectorV1 } from "./capability_vector";

export type BuildIntentId =
  | "website"
  | "product_app"
  | "marketplace"
  | "community"
  | "automation"
  | "data_api"
  | "governed_system";

export type LaunchPathId =
  | "content_site_basic"
  | "product_app_basic"
  | "community_hub"
  | "marketplace_basic"
  | "automation_ops"
  | "api_service_basic"
  | "governed_system_basic"
  | "wiki_basic"
  | "real_estate_listings_basic"
  | "crm_basic";

export type PrimarySurface =
  | "content_site"
  | "web_app"
  | "mobile_app"
  | "cli_tool"
  | "automation"
  | "api_service";

export type PaletteId =
  | "identity_access"
  | "communication_social"
  | "content_media"
  | "knowledge_learning"
  | "search_navigation"
  | "matching_recommendation"
  | "collaboration_work"
  | "commerce_value"
  | "governance_policy"
  | "reputation_safety"
  | "game_incentives"
  | "automation_workflows"
  | "infrastructure_data_files"
  | "connection_integration";


/**
 * Domain IDs are authored in blueprint/domains/manifest.json.
 * Kept as a string type so the manifest can evolve without requiring a TS union edit.
 */
export type DomainId = string;


export type PrimaryOutcomeId = "inform" | "convert" | "sell" | "engage" | "automate" | "govern";

export type ValueEmphasisId = "clarity" | "speed" | "trust" | "safety" | "governance" | "integration";

export type KeyActionId =
  | "read_key_pages"
  | "subscribe_join"
  | "contact_demo"
  | "sign_in"
  | "do_primary_task"
  | "search_browse"
  | "view_listing"
  | "create_post"
  | "moderate_report"
  | "start_checkout"
  | "connect_integration"
  | "create_workflow"
  | "run_monitor"
  | "read_docs"
  | "create_api_key"
  | "make_first_request"
  | "read_rules"
  | "create_proposal"
  | "vote_approve";

export type IntentIntakeV1 = {
  schema: "kindred.intent.intake.v1";
  primary_outcome: PrimaryOutcomeId;
  value_emphasis: ValueEmphasisId;
  key_action_ids: KeyActionId[];
  /**
   * Optional preference anchors.
   * These are intentionally lightweight: links and short notes.
   * They improve proposal alignment without turning free text into the core truth.
   */
  liked_examples?: string[];
  disliked_examples?: string[];
  /**
   * Visual density preference: influences layout defaults but is never hard-binding.
   */
  visual_density?: "airy" | "balanced" | "dense";
  /**
   * Optional notes are allowed, but are explicitly non-normative.
   * Canonical truth is the schema-locked selections above.
   */
  notes?: string;
};

export type DirectorUiBasketV1 = {
  schema: "kindred.director_ui_basket.v1";
  /**
   * Sections/components the Director has bookmarked for placement.
   */
  section_ids: string[];
  /**
   * Last deterministic placement plan (storyboard-ish) derived from the basket.
   */
  last_plan?: {
    generated_at_utc: string;
    screens: { id: string; title: string; section_ids: string[] }[];
  };
};


export type IAItem = {
  id: string;
  title: string;
  parent_id?: string;

  // Optional helpers (v0.20+). These are additive and safe for older packs.
  // route_path is the human-facing URL path (starts with "/").
  route_path?: string;

  // scene_id links this IA node to a UX scene (for jump-to-fix and audits).
  scene_id?: string;
};



export type CopyBlock = {
  /**
   * Stable ID (recommended format: "<page_id>:<slot>")
   */
  id: string;
  /**
   * IA page id this copy belongs to.
   */
  page_id: string;
  /**
   * A flexible slot identifier (e.g. "hero_headline", "hero_subhead", "primary_cta", "page_intro").
   */
  slot: string;
  /**
   * Human-facing copy text.
   */
  text: string;
};

export type LofiLayoutVariant = {
  id: string;
  label: string;
  pages: Record<string, { sections: string[] }>;
};

export type ProjectState = {
  schema: "kindred.builder.state.v1";
  project: {
    id: string;
    name: string;
    created_at_utc: string;
  };
  intent: {
    launch_path_id?: LaunchPathId;
    build_intent?: BuildIntentId;
    primary_surface?: PrimarySurface;
    palettes: PaletteId[];
    /**
     * Optional drill-down after Palettes.
     * Domains compile into SPEL modules and proposal packs.
     */
    domains: DomainId[];
    intake?: IntentIntakeV1;
    /**
     * Director-level capability pressure map (0..3) used to steer proposals and planning.
     * Deterministic and schema-locked (no free-text requirements).
     */
    capability_vector?: CapabilityVectorV1;
    constraints: {
      offline_first: boolean;
      no_payments: boolean;
      /**
       * Optional list of required environment variable NAMES (no values).
       * Used by Brownfield delta reports and deployment checklists.
       */
      required_env_names?: string[];
    };
    brief: {
      audience_description: string;
      problem: string;
      offer: string;
      differentiators: string[];
      key_actions: string[];
      success_metrics: string[];
      non_goals: string[];
    };
  };
  design: {
    brand: {
      name: string;
      tagline: string;
      audience: "general_public" | "builders" | "teams";
      tone: "serious" | "friendly" | "bold" | "calm";
    };
    references: { url: string; note: string }[];
    tokens: {
      radius: "sharp" | "balanced" | "round";
      density: "compact" | "balanced" | "airy";
      contrast: "balanced" | "high";
      motion: "none" | "subtle" | "lively";
      type_scale: "small" | "balanced" | "large";
      line_height: "tight" | "balanced" | "relaxed";
      focus: "standard" | "high";
      elevation: "flat" | "balanced" | "deep";
      layout_width: "narrow" | "balanced" | "wide";
      voice: "serious" | "playful";
      mode: "light" | "dark" | "system";
    };
    ia: {
      pages: IAItem[];
    };
    lofi: {
      active_variant_id: string;
      variants: LofiLayoutVariant[];
    };
  };
  kernel_min: {
    actors: { id: string; display_name: string }[];
    scenes: { id: string; title: string; entry?: boolean }[];
    flows: { id: string; scenes: string[] }[];
  };

  content: {
    /**
     * Copy blocks are short, reusable pieces of content used across wireframes and later codegen.
     * They are intentionally lightweight and can be refined via proposals.
     */
    copy_blocks: CopyBlock[];
  };

  /**
   * Director-facing state extensions.
   *
   * Kept optional so older projects remain valid.
   */
  director?: DirectorStateV1;
};

export type IntentProposalId = "mvp" | "balanced" | "expansion";

export type IntentProposalV1 = {
  schema: "kindred.intent_proposal.v1";
  id: IntentProposalId;
  title: string;
  tagline: string;
  rationale: string[];
  recommended: {
    build_intent: BuildIntentId;
    primary_surface: PrimarySurface;
    palettes: PaletteId[];
  };
  notes: string[];
};

export type DirectorStateV1 = {
  schema: "kindred.director_state.v1";
  intent_proposals?: IntentProposalV1[];
  selected_intent_proposal_id?: IntentProposalId;
  last_intent_proposals_generated_at_utc?: string;
  last_intent_pack_sha256?: string;
  last_intent_pack_generated_at_utc?: string;

  // Blueprint compiler v1 (deterministic UI blueprint derived from Spec Pack).
  last_blueprint_pack_sha256?: string;
  last_blueprint_pack_spec_pack_sha256?: string;
  last_blueprint_pack_generated_at_utc?: string;

  // Library Builder v1 (chips-only). Draft is director-local; adopted is synced from Spec Pack on proposal acceptance.
  libraries_v1?: DirectorLibrariesV1;

  // Patterns Builder v1 (catalog). Draft is director-local; adopted is synced from Spec Pack on proposal acceptance.
  patterns_v1?: DirectorPatternsV1;

  // Kits Builder v1 (bindings). Draft is director-local; adopted is synced from Spec Pack on proposal acceptance.
  // Provider/product specifics must live here (via Kits), keeping the core kernel-neutral.
  kits_v1?: DirectorKitsV1;

  // Data Bindings v1 (input/output wiring). Draft is director-local; adopted is synced from Spec Pack on proposal acceptance.
  // This is deliberately generic: it describes how data enters and leaves selected patterns without naming philosophies.
  data_bindings_v1?: DirectorDataBindingsV1;

  // UI basket v1 (bookmark components → deterministic storyboard plan). Optional.
  ui_basket_v1?: DirectorUiBasketV1;
};

export type DirectorLibrariesV1 = {
  schema: "kindred.director_libraries.v1";
  catalog_version: string;
  draft_library_ids: string[];
  adopted_library_ids: string[];
  adopted_from_spec_pack_sha256?: string;
  adopted_libraries_spel_sha256?: string;
  adopted_at_utc?: string;
};

export type DirectorPatternsV1 = {
  schema: "kindred.director_patterns.v1";
  catalog_version: string;
  draft_pattern_ids: string[];
  adopted_pattern_ids: string[];
  adopted_from_spec_pack_sha256?: string;
  adopted_patterns_spel_sha256?: string;
  adopted_at_utc?: string;
};

export type DirectorKitsV1 = {
  schema: "kindred.director_kits.v1";
  catalog_version: string;
  draft_kit_ids: string[];
  adopted_kit_ids: string[];
  adopted_from_spec_pack_sha256?: string;
  adopted_kits_spel_sha256?: string;
  adopted_at_utc?: string;
};

export type DirectorDataBindingsV1 = {
  schema: "kindred.director_data_bindings.v1";
  catalog_version: string;
  draft: {
    source_id: string;
    sink_ids: string[];
    trigger_id: string;
  };
  adopted: {
    source_id: string;
    sink_ids: string[];
    trigger_id: string;
  };
  adopted_from_spec_pack_sha256?: string;
  adopted_data_bindings_spel_sha256?: string;
  adopted_at_utc?: string;
};
