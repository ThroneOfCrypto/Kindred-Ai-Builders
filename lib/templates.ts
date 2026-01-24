"use client";

import { BuildIntentId, PrimarySurface, PaletteId, IAItem, LofiLayoutVariant, ProjectState } from "./types";
import { normalizeIntentIntake, PRIMARY_OUTCOMES, VALUE_EMPHASES, labelForKeyAction } from "./intake";
import { normalizeCapabilityVector } from "./capability_vector";

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function hasPalette(palettes: PaletteId[], p: PaletteId): boolean {
  return palettes.includes(p);
}

function pushIf<T>(arr: T[], cond: boolean, item: T) {
  if (cond) arr.push(item);
}

export function recommendedSectionsForPage(input: {
  page_id: string;
  build_intent: BuildIntentId;
  primary_surface: PrimarySurface;
}): string[] {
  const pageId = input.page_id;
  const build = input.build_intent;
  const surface = input.primary_surface;

  // Primary heuristics by page id
  const byId = (() => {
    if (pageId === "home" || pageId === "landing") return ["top_nav", "hero", "value_props", "social_proof", "cta", "footer"];
    if (pageId === "about") return ["top_nav", "content", "cta", "footer"];
    if (pageId === "pricing") return ["top_nav", "pricing", "faq", "cta", "footer"];
    if (pageId === "docs") return ["top_nav", "sidebar_nav", "docs_content", "footer"];
    if (pageId === "blog") return ["top_nav", "content", "footer"];
    if (pageId === "contact") return ["top_nav", "content", "cta", "footer"];

    if (pageId === "dashboard") return ["top_nav", "summary_cards", "main_panel", "footer"];
    if (pageId === "settings") return ["top_nav", "main_panel", "footer"];
    if (pageId === "admin") return ["top_nav", "sidebar_nav", "main_panel", "footer"];

    if (pageId === "search") return ["top_nav", "filters", "results_list", "footer"];
    if (pageId === "listing") return ["top_nav", "gallery", "details", "cta", "footer"];
    if (pageId === "checkout") return ["top_nav", "steps", "summary", "payment", "footer"];

    if (pageId === "feed") return ["top_nav", "composer", "feed_list", "footer"];
    if (pageId === "profile") return ["top_nav", "details", "footer"];

    if (pageId === "workflows") return ["top_nav", "sidebar_nav", "main_panel", "footer"];
    if (pageId === "runs") return ["top_nav", "main_panel", "footer"];
    if (pageId === "integrations") return ["top_nav", "main_panel", "footer"];

    return ["top_nav", "content", "footer"];
  })();

  // Surface-level adjustments (deterministic, greyscale-first)
  if (surface === "content_site") {
    // Content sites prefer narrative layouts
    if (pageId === "home" || pageId === "landing") return ["top_nav", "hero", "value_props", "features", "social_proof", "cta", "footer"];
    if (pageId === "docs") return ["top_nav", "sidebar_nav", "docs_content", "footer"];
    return byId;
  }

  if (surface === "web_app" || surface === "mobile_app") {
    // App surfaces prefer nav + panels over long narrative
    if (pageId === "home" || pageId === "landing") return ["top_nav", "summary_cards", "main_panel", "footer"];
    if (pageId === "docs") return ["top_nav", "sidebar_nav", "docs_content", "footer"];
    return byId;
  }

  if (surface === "api_service") {
    // API surfaces are documentation-first
    if (pageId === "home" || pageId === "landing") return ["top_nav", "docs_content", "cta", "footer"];
    if (pageId === "docs") return ["top_nav", "sidebar_nav", "docs_content", "footer"];
    return ["top_nav", "docs_content", "footer"];
  }

  if (surface === "cli_tool") {
    return ["content", "footer"];
  }

  // Build intent adjustments (only when they improve clarity)
  if (build === "marketplace") {
    if (pageId === "home" || pageId === "landing") return ["top_nav", "hero", "filters", "results_list", "social_proof", "footer"];
    if (pageId === "search") return ["top_nav", "filters", "results_list", "footer"];
    if (pageId === "listing") return ["top_nav", "gallery", "details", "cta", "footer"];
  }

  if (build === "community") {
    if (pageId === "home" || pageId === "landing") return ["top_nav", "feed_list", "cta", "footer"];
    if (pageId === "feed") return ["top_nav", "composer", "feed_list", "footer"];
  }

  return byId;
}

function slugId(raw: string, fallback: string): string {
  const s = String(raw || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!s) return fallback;
  // Keep IDs short-ish and readable.
  return s.slice(0, 32);
}


function idToPathSegment(id: string): string {
  const s = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_/g, "-");
  return s || "page";
}

function defaultRoutePathForId(id: string): string {
  const x = String(id || "").trim().toLowerCase();
  if (x === "home" || x === "landing") return "/";
  return `/${idToPathSegment(x)}`;
}

function normWords(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchActionToSceneId(action: string, known: { id: string; title: string }[], build_intent?: BuildIntentId): string | null {
  const a = normWords(action);
  if (!a) return null;

  // Prefer obvious direct matches.
  for (const k of known) {
    const t = normWords(k.title);
    if (t && a.includes(t)) return k.id;
  }

  // Heuristic keyword mapping (deterministic).
  const has = (w: string) => a.includes(w);
  if (has("sign in") || has("login") || has("log in")) {
    const hit = known.find((x) => x.id === "sign_in");
    if (hit) return hit.id;
  }
  if (has("sign up") || has("register") || has("create account") || has("join")) {
    const hit = known.find((x) => x.id === "sign_up");
    if (hit) return hit.id;
  }
  if (has("contact") || has("email") || has("message")) {
    const hit = known.find((x) => x.id === "contact");
    if (hit) return hit.id;
  }
  if (has("pricing") || has("plan")) {
    const hit = known.find((x) => x.id === "pricing");
    if (hit) return hit.id;
  }
  if (has("search") || has("browse") || has("discover")) {
    const hit = known.find((x) => x.id === "search");
    if (hit) return hit.id;
  }
  if (build_intent === "marketplace" && (has("checkout") || has("buy") || has("purchase"))) {
    const hit = known.find((x) => x.id === "checkout") || known.find((x) => x.id === "cart");
    if (hit) return hit.id;
  }
  if (build_intent === "community" && (has("post") || has("publish") || has("create"))) {
    const hit = known.find((x) => x.id === "post");
    if (hit) return hit.id;
  }
  if (build_intent === "automation" && (has("workflow") || has("run") || has("monitor"))) {
    const hit = known.find((x) => x.id === "workflows") || known.find((x) => x.id === "runs");
    if (hit) return hit.id;
  }
  if (build_intent === "data_api" && (has("docs") || has("api docs") || has("documentation"))) {
    const hit = known.find((x) => x.id === "api_docs");
    if (hit) return hit.id;
  }

  return null;
}

export function deriveStarterUxAndIa(input: {
  build_intent?: BuildIntentId;
  primary_surface?: PrimarySurface;
  palettes: PaletteId[];
  brand_name?: string;
  brief?: {
    key_actions?: string[];
  };
}): {
  actors: { id: string; display_name: string }[];
  scenes: { id: string; title: string; entry?: boolean }[];
  flows: { id: string; scenes: string[] }[];
  ia_pages: IAItem[];
  lofi_variants: LofiLayoutVariant[];
} {
  const build_intent = input.build_intent;
  const surface = input.primary_surface;
  const palettes = input.palettes || [];
  const briefKeyActions = Array.isArray(input.brief?.key_actions) ? input.brief!.key_actions!.filter((x) => typeof x === "string" && x.trim() !== "") : [];

  // Base actors
  const actors: { id: string; display_name: string }[] = [{ id: "visitor", display_name: "Visitor" }];

  // Helper pages/scenes list
  let pages: { id: string; title: string; parent_id?: string }[] = [];
  let scenes: { id: string; title: string; entry?: boolean }[] = [];

  // Baselines by build intent (orthogonal defaults)
  switch (build_intent) {
    case "website":
      pages = [
        { id: "home", title: "Home" },
        { id: "about", title: "About" },
        { id: "contact", title: "Contact" },
      ];
      scenes = [
        { id: "home", title: "Home", entry: true },
        { id: "about", title: "About" },
        { id: "contact", title: "Contact" },
      ];
      break;

    case "product_app":
      actors.push({ id: "member", display_name: "Member" });
      pages = [
        { id: "landing", title: "Landing" },
        { id: "dashboard", title: "Dashboard" },
        { id: "settings", title: "Settings" },
      ];
      scenes = [
        { id: "landing", title: "Landing", entry: true },
        { id: "dashboard", title: "Dashboard" },
        { id: "settings", title: "Settings" },
      ];
      break;

    case "marketplace":
      actors.push({ id: "buyer", display_name: "Buyer" });
      actors.push({ id: "seller", display_name: "Seller" });
      pages = [
        { id: "landing", title: "Landing" },
        { id: "search", title: "Search" },
        { id: "listing", title: "Listing" },
        { id: "account", title: "Account" },
      ];
      scenes = [
        { id: "landing", title: "Landing", entry: true },
        { id: "search", title: "Search" },
        { id: "listing", title: "Listing" },
        { id: "account", title: "Account" },
      ];
      break;

    case "community":
      actors.push({ id: "member", display_name: "Member" });
      pages = [
        { id: "home", title: "Home" },
        { id: "feed", title: "Feed" },
        { id: "post", title: "Post" },
        { id: "profile", title: "Profile" },
      ];
      scenes = [
        { id: "home", title: "Home", entry: true },
        { id: "feed", title: "Feed" },
        { id: "post", title: "Post" },
        { id: "profile", title: "Profile" },
      ];
      break;

    case "automation":
      actors.push({ id: "operator", display_name: "Operator" });
      pages = [
        { id: "home", title: "Home" },
        { id: "workflows", title: "Workflows" },
        { id: "runs", title: "Runs" },
        { id: "integrations", title: "Integrations" },
      ];
      scenes = [
        { id: "home", title: "Home", entry: true },
        { id: "workflows", title: "Workflows" },
        { id: "runs", title: "Runs" },
        { id: "integrations", title: "Integrations" },
      ];
      break;

    case "data_api":
      actors.push({ id: "admin", display_name: "Admin" });
      pages = [
        { id: "landing", title: "Landing" },
        { id: "dashboard", title: "Dashboard" },
        { id: "api_docs", title: "API Docs" },
        { id: "api_keys", title: "API Keys" },
      ];
      scenes = [
        { id: "landing", title: "Landing", entry: true },
        { id: "dashboard", title: "Dashboard" },
        { id: "api_docs", title: "API Docs" },
        { id: "api_keys", title: "API Keys" },
      ];
      break;

    case "governed_system":
      actors.push({ id: "member", display_name: "Member" });
      actors.push({ id: "moderator", display_name: "Moderator" });
      pages = [
        { id: "home", title: "Home" },
        { id: "rules", title: "Rules" },
        { id: "proposals", title: "Proposals" },
        { id: "audit", title: "Audit" },
      ];
      scenes = [
        { id: "home", title: "Home", entry: true },
        { id: "rules", title: "Rules" },
        { id: "proposals", title: "Proposals" },
        { id: "audit", title: "Audit" },
      ];
      break;

    default:
      pages = [{ id: "home", title: "Home" }];
      scenes = [{ id: "home", title: "Home", entry: true }];
      break;
  }

  // Palette-driven additions (capabilities)
  const identity = hasPalette(palettes, "identity_access");
  const commerce = hasPalette(palettes, "commerce_value");
  const comms = hasPalette(palettes, "communication_social");
  const governance = hasPalette(palettes, "governance_policy");
  const safety = hasPalette(palettes, "reputation_safety");

  pushIf(pages, identity, { id: "sign_in", title: "Sign in" });
  pushIf(pages, identity, { id: "sign_up", title: "Sign up" });

  pushIf(scenes, identity, { id: "sign_in", title: "Sign in" });
  pushIf(scenes, identity, { id: "sign_up", title: "Sign up" });

  // Commerce additions differ by intent
  if (commerce) {
    pushIf(pages, build_intent === "marketplace", { id: "cart", title: "Cart" });
    pushIf(pages, build_intent === "marketplace", { id: "checkout", title: "Checkout" });
    pushIf(pages, build_intent !== "marketplace", { id: "pricing", title: "Pricing" });

    pushIf(scenes, build_intent === "marketplace", { id: "cart", title: "Cart" });
    pushIf(scenes, build_intent === "marketplace", { id: "checkout", title: "Checkout" });
    pushIf(scenes, build_intent !== "marketplace", { id: "pricing", title: "Pricing" });
  }

  if (comms) {
    pushIf(pages, true, { id: "notifications", title: "Notifications" });
    pushIf(scenes, true, { id: "notifications", title: "Notifications" });
  }

  if (governance && build_intent !== "governed_system") {
    pushIf(pages, true, { id: "rules", title: "Rules" });
    pushIf(pages, true, { id: "proposals", title: "Proposals" });
    pushIf(scenes, true, { id: "rules", title: "Rules" });
    pushIf(scenes, true, { id: "proposals", title: "Proposals" });
  }

  if (safety) {
    pushIf(pages, true, { id: "reports", title: "Reports" });
    pushIf(scenes, true, { id: "reports", title: "Reports" });
    pushIf(actors, true, { id: "moderator", display_name: "Moderator" });
  }

  // Brief-driven additions: translate key actions into scenes/pages (when possible).
  // This is deterministic and conservative: it prefers mapping to existing scenes, and only adds new ones when needed.
  const actionSceneIds: string[] = [];
  if (briefKeyActions.length > 0) {
    for (const action of briefKeyActions) {
      const known = scenes.map((s) => ({ id: s.id, title: s.title }));
      const mapped = matchActionToSceneId(action, known, build_intent);
      if (mapped) {
        if (!actionSceneIds.includes(mapped)) actionSceneIds.push(mapped);
        continue;
      }
      const id = `action_${slugId(action, "action")}`;
      if (!actionSceneIds.includes(id)) actionSceneIds.push(id);
      // Add missing page + scene for this action.
      pushIf(pages, true, { id, title: String(action).trim() || "Action" });
      pushIf(scenes, true, { id, title: String(action).trim() || "Action" });
    }
  }

  // Surface-specific adjustments (keep it minimal in v1)
  if (surface === "cli_tool") {
    // Convert "pages" to command-like nodes; keep same structure but names reflect commands.
    pages = pages.map((p) => ({ ...p, title: p.title.replace(" ", " ") }));
  }

  // Ensure uniqueness by id
  const pageById = new Map<string, IAItem>();
  for (const p of pages) pageById.set(p.id, p);
  let ia_pages = Array.from(pageById.values()).map((p) => ({
    ...p,
    route_path: p.route_path || defaultRoutePathForId(p.id),
  }));

  const sceneById = new Map<string, { id: string; title: string; entry?: boolean }>();
  for (const s of scenes) sceneById.set(s.id, s);
  let sceneList = Array.from(sceneById.values());

  // Ensure exactly one entry scene
  if (sceneList.filter((s) => s.entry).length !== 1) {
    sceneList = sceneList.map((s) => ({ ...s, entry: s.id === (sceneList[0]?.id || "home") }));
  }


  // Link IA pages to scenes (when obvious) and ensure route_path exists.
  const sceneIdSet = new Set(sceneList.map((s) => s.id));
  ia_pages = ia_pages.map((p) => ({
    ...p,
    route_path: p.route_path || defaultRoutePathForId(p.id),
    scene_id: p.scene_id || (sceneIdSet.has(p.id) ? p.id : undefined),
  }));

  // Flows: primary journey in likely order.
  // If key actions exist, order the flow by: entry -> key action scenes -> remaining scenes.
  const entryId = sceneList.find((s) => s.entry)?.id || sceneList[0]?.id || "home";
  const flowOrder: string[] = [];
  const pushUnique = (id: string) => {
    if (!flowOrder.includes(id)) flowOrder.push(id);
  };
  pushUnique(entryId);
  for (const id of actionSceneIds) {
    if (sceneList.some((s) => s.id === id)) pushUnique(id);
  }
  for (const s of sceneList) pushUnique(s.id);
  const flows = [{ id: "primary", scenes: flowOrder }];

  // Low-fi layout variants (greyscale sections)
  const baseSections = (pageId: string): string[] => {
    const base = recommendedSectionsForPage({
      page_id: pageId,
      build_intent,
      primary_surface: surface,
    });

    // Palette-aware tweaks (small, deterministic additions)
    const next = base.slice();

    // If content/media palette is present, prefer docs_content on docs-like pages
    if (hasPalette(palettes, "content_media") && (pageId === "docs" || pageId === "blog")) {
      if (!next.includes("docs_content") && next.includes("content")) {
        const idx = next.indexOf("content");
        next.splice(idx, 1, "docs_content");
      }
    }

    // If search/navigation palette is present, ensure search pages show filters + results
    if (hasPalette(palettes, "search_navigation") && pageId === "search") {
      if (!next.includes("filters")) next.splice(1, 0, "filters");
      if (!next.includes("results_list")) next.splice(1, 0, "results_list");
    }

    return uniq(next);
  };

  const strict: LofiLayoutVariant = {
    id: "strict",
    label: "Strict (minimal)",
    pages: Object.fromEntries(ia_pages.map((p) => [p.id, { sections: baseSections(p.id).slice(0, 4) }])),
  };

  const balanced: LofiLayoutVariant = {
    id: "balanced",
    label: "Balanced",
    pages: Object.fromEntries(ia_pages.map((p) => [p.id, { sections: baseSections(p.id) }])),
  };

  const explore: LofiLayoutVariant = {
    id: "explore",
    label: "Explore (more sections)",
    pages: Object.fromEntries(
      ia_pages.map((p) => [p.id, { sections: uniq(baseSections(p.id).concat(["faq", "secondary_cta"])) }])
    ),
  };

  return {
    actors,
    scenes: sceneList,
    flows,
    ia_pages,
    lofi_variants: [strict, balanced, explore],
  };
}


export function deriveBriefFromIntent(state: ProjectState): ProjectState {
  const build = state.intent.build_intent || "website";
  const surface = state.intent.primary_surface || "content_site";
  const palettes = state.intent.palettes || [];
  const name = state.design.brand.name.trim() || state.project.name.trim() || "This product";

  const capability_vector = normalizeCapabilityVector((state.intent as any).capability_vector);

  const intake = normalizeIntentIntake({
    raw: (state.intent as any).intake,
    build_intent: build,
    palettes,
    legacy_notes: typeof (state.intent as any)?.intake?.notes === "string" ? String((state.intent as any).intake.notes) : "",
  });

  const primaryLabel = PRIMARY_OUTCOMES.find((x) => x.id === intake.primary_outcome)?.label || String(intake.primary_outcome);
  const emphasisLabel = VALUE_EMPHASES.find((x) => x.id === intake.value_emphasis)?.label || String(intake.value_emphasis);

  const defaultAudience = (() => {
    if (build === "website") return "Visitors who want clear information and a simple path to act.";
    if (build === "product_app") return "Users who need to sign in and complete a repeatable job-to-be-done quickly and safely.";
    if (build === "marketplace") return "Buyers and sellers who need discovery, trust, and smooth decisions.";
    if (build === "community") return "Members who want healthy participation with moderation and clear norms.";
    if (build === "automation") return "Operators who want repeatable workflows and reliable integrations.";
    if (build === "data_api") return "Developers and admins who need stable APIs, keys, and observability.";
    return "Stakeholders who need transparent rules, proposals, and auditability.";
  })();

  const defaultProblem = (() => {
    if (build === "website") return `${name} needs a clear public narrative and a low-friction path to the next action.`;
    if (build === "product_app") return `${name} needs a focused signed-in experience that delivers value without complexity.`;
    if (build === "marketplace") return `${name} needs safe discovery and clear decision-making with trust signals.`;
    if (build === "community") return `${name} needs a space where members can contribute while maintaining quality and safety.`;
    if (build === "automation") return `${name} needs reliable workflows that reduce manual effort and operational risk.`;
    if (build === "data_api") return `${name} needs a stable service surface (docs, keys, usage) that can be operated confidently.`;
    return `${name} needs governed change (rules, proposals, reputation) with accountability.`;
  })();

  const defaultOffer = (() => {
    if (surface === "content_site") return "A fast, readable site with clear sections and one primary call to action.";
    if (surface === "web_app") return "A web app with a primary workflow and account controls (sign-in only if required).";
    if (surface === "api_service") return "An API-first service with docs, keys, and a minimal admin surface.";
    if (surface === "mobile_app") return "A mobile-first experience optimized for short sessions and safe defaults.";
    if (surface === "cli_tool") return "A CLI tool with clear commands, help output, and deterministic behavior.";
    return "A clean, auditable system surface with clear navigation and guardrails.";
  })();

  const keyActions = (Array.isArray(intake.key_action_ids) ? intake.key_action_ids : []).map((id) => labelForKeyAction(id));

  const defaultMetrics = (() => {
    const base = (() => {
      if (intake.primary_outcome === "inform") return ["Clarity of key pages", "Time to first meaningful read", "Reduced confusion / support pings"];
      if (intake.primary_outcome === "convert") return ["Conversion to primary action", "Time-to-first-action", "Drop-off reduction"];
      if (intake.primary_outcome === "sell") return ["Checkout initiation rate", "Purchase completion rate", "Refund/dispute rate reduction"];
      if (intake.primary_outcome === "engage") return ["Weekly active usage", "Healthy engagement rate", "Retention of good contributors"];
      if (intake.primary_outcome === "automate") return ["Hours saved per week", "Failure/retry rate", "Mean time to recovery"];
      return ["Proposal throughput", "Rule compliance rate", "Audit issues reduced"];
    })();
    return base.slice(0, 6);
  })();

  const paletteDiffs: string[] = [];
  if (palettes.includes("identity_access")) paletteDiffs.push("Clear identity boundaries and access controls.");
  if (palettes.includes("reputation_safety")) paletteDiffs.push("Safety and trust signals are first-class.");
  if (palettes.includes("governance_policy")) paletteDiffs.push("Explicit rules and governance surfaces.");
  if (palettes.includes("connection_integration")) paletteDiffs.push("Integration-ready interfaces and data flows.");
  if (palettes.includes("automation_workflows")) paletteDiffs.push("Automation-friendly primitives and guardrails.");
  if (palettes.includes("content_media")) paletteDiffs.push("Content structures that can evolve without redesign.");
  if (palettes.includes("commerce_value")) paletteDiffs.push("Commerce and value exchange are designed as explicit surfaces.");

  const differentiators = [
    `Primary outcome: ${primaryLabel}.`,
    `Value emphasis: ${emphasisLabel}.`,
    (() => {
      const top = Object.entries(capability_vector.levels)
        .filter(([, v]) => v >= 2)
        .map(([k, v]) => `${k}=${v}`)
        .sort();
      if (top.length === 0) return "Capability priorities: balanced.";
      return `Capability priorities: ${top.slice(0, 6).join(", ")}${top.length > 6 ? ", …" : ""}.`;
    })(),
    ...paletteDiffs,
    "Director intake is schema-locked (no free-text requirement entry).",
    "AI is proposal-only; adoption and locking remain explicit.",
    "Artefacts are deterministic (packs/hashes) and portable (no lock-in).",
  ].filter((x) => String(x || "").trim().length > 0);

  const non_goals: string[] = [];
  if (state.intent.constraints?.offline_first) non_goals.push("Hard dependency on always-online services (offline_first=true).");
  if (state.intent.constraints?.no_payments) non_goals.push("Payments inside the product (no_payments=true).");

  const brief = {
    audience_description: defaultAudience,
    problem: defaultProblem,
    offer: defaultOffer,
    differentiators,
    key_actions: keyActions.length > 0 ? keyActions : ["Read key pages", "Choose a primary action", "Complete the first successful run"],
    success_metrics: defaultMetrics,
    non_goals,
  };

  return { ...state, intent: { ...state.intent, intake, capability_vector, brief } };
}


export function applyDerivedTemplates(state: ProjectState): ProjectState {
  const derived = deriveStarterUxAndIa({
    build_intent: state.intent.build_intent,
    primary_surface: state.intent.primary_surface,
    palettes: state.intent.palettes,
    brand_name: state.design.brand.name,
    brief: state.intent.brief,
  });

  return {
    ...state,
    kernel_min: {
      ...state.kernel_min,
      actors: derived.actors,
      scenes: derived.scenes,
      flows: derived.flows,
    },
    design: {
      ...state.design,
      ia: { pages: derived.ia_pages },
      lofi: { active_variant_id: "balanced", variants: derived.lofi_variants },
    },
  };
}
