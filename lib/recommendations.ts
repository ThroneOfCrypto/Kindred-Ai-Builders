"use client";

import type { BuildIntentId, PaletteId, PrimarySurface } from "./types";

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * Deterministic recommendations used by both Builder UX and Workbench gates.
 *
 * These are *not* requirements. Missing recommendations should show as warnings,
 * never as export-blocking errors.
 */
export function recommendedPalettes(args: {
  build_intent?: BuildIntentId;
  primary_surface?: PrimarySurface;
  constraints?: { offline_first: boolean; no_payments: boolean };
}): { recommended: PaletteId[]; rationale: string[] } {
  const build_intent = args.build_intent;
  const surface = args.primary_surface;
  const no_payments = !!args.constraints?.no_payments;

  const rec: PaletteId[] = [];
  const why: string[] = [];

  // Intent-driven recommendations.
  if (build_intent === "website") {
    rec.push("content_media", "search_navigation", "connection_integration");
    why.push("website → content + navigation + integrations");
  }

  if (build_intent === "product_app") {
    rec.push("identity_access", "infrastructure_data_files", "connection_integration");
    why.push("product_app → identity + data + integrations");
  }

  if (build_intent === "marketplace") {
    rec.push("identity_access", "search_navigation", "matching_recommendation", "reputation_safety");
    if (!no_payments) rec.push("commerce_value");
    else why.push("no_payments=true → commerce is optional");
    why.push("marketplace → identity + search + matching + safety (+ commerce if enabled)");
  }

  if (build_intent === "community") {
    rec.push("identity_access", "communication_social", "reputation_safety", "governance_policy");
    why.push("community → identity + social + safety + rules");
  }

  if (build_intent === "automation") {
    rec.push("automation_workflows", "connection_integration", "infrastructure_data_files");
    why.push("automation → workflows + integrations + data");
  }

  if (build_intent === "data_api") {
    rec.push("identity_access", "infrastructure_data_files", "connection_integration", "governance_policy");
    why.push("data_api → identity + data + integrations + policy");
  }

  if (build_intent === "governed_system") {
    rec.push("identity_access", "governance_policy", "reputation_safety", "game_incentives", "communication_social");
    why.push("governed_system → identity + policy + safety + incentives (+ comms)");
  }

  // Surface-driven nudges.
  if (surface === "content_site") {
    rec.push("content_media", "search_navigation");
    why.push("content_site → content + navigation");
  }

  if (surface === "web_app") {
    rec.push("identity_access", "infrastructure_data_files");
    why.push("web_app → identity + data");
  }

  if (surface === "mobile_app") {
    rec.push("identity_access");
    why.push("mobile_app → identity");
  }

  if (surface === "cli_tool") {
    rec.push("infrastructure_data_files");
    why.push("cli_tool → data/files");
  }

  if (surface === "automation") {
    rec.push("automation_workflows", "connection_integration");
    why.push("automation surface → workflows + integrations");
  }

  if (surface === "api_service") {
    rec.push("identity_access", "infrastructure_data_files", "connection_integration", "governance_policy");
    why.push("api_service → identity + data + integrations + policy");
  }

  return { recommended: uniq(rec), rationale: uniq(why) };
}

export function recommendedSurfacesForIntent(build_intent?: BuildIntentId): PrimarySurface[] {
  if (!build_intent) return [];
  const map: Record<BuildIntentId, PrimarySurface[]> = {
    website: ["content_site", "web_app"],
    product_app: ["web_app", "mobile_app"],
    marketplace: ["web_app", "mobile_app"],
    community: ["web_app", "mobile_app"],
    automation: ["automation", "web_app", "cli_tool"],
    data_api: ["api_service", "web_app", "cli_tool"],
    governed_system: ["web_app", "mobile_app"],
  };
  return map[build_intent] || [];
}
