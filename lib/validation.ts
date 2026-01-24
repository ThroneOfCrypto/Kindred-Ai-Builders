"use client";

import { SpecPack, asText, tryParseJson, getManifest, validateManifest } from "./spec_pack";
import { SECTION_LIBRARY } from "./section_library";
import { recommendedPalettes, recommendedSurfacesForIntent } from "./recommendations";

export type ValidationIssue = {
  severity: "error" | "warn";
  code: string;
  message: string;
  file?: string;
  pointer?: string; // JSON pointer-ish hint
};

export type ValidationReport = {
  schema: "kindred.spec_pack_validation_report.v1";
  captured_at_utc: string;
  status: "pass" | "fail";
  issues: ValidationIssue[];
};

export type SchemaEntry = {
  path: string;
  schema_id: string;
  title: string;
  kind: "json" | "text";
  /**
   * Builder v1 expects these files when exporting a full pack.
   * Missing entries will be reported as warnings (for backward compatibility).
   */
  expected_in_builder_v1?: boolean;
};

/**
 * Spec Pack schema registry (v1)
 *
 * Pragmatic, path-keyed. Used by Workbench as an inspector surface.
 */
export const SPEC_PACK_SCHEMA_REGISTRY_V1: SchemaEntry[] = [
  { path: "spec_pack_manifest.json", schema_id: "kindred.spec_pack_manifest.v1", title: "Spec Pack manifest", kind: "json", expected_in_builder_v1: true },
  { path: "project/meta.json", schema_id: "kindred.project_meta.v1", title: "Project metadata", kind: "json", expected_in_builder_v1: true },
  { path: "contracts/rigor.json", schema_id: "kindred.rigor_contract.v1", title: "Rigor contract", kind: "json", expected_in_builder_v1: true },
  { path: "intent/launch_path.json", schema_id: "kindred.intent.launch_path.v1", title: "Launch Path selection", kind: "json", expected_in_builder_v1: true },
  { path: "intent/build_intent.json", schema_id: "kindred.intent.build_intent.v1", title: "Build Intent selection", kind: "json", expected_in_builder_v1: true },
  { path: "intent/targets.json", schema_id: "kindred.intent.targets.v1", title: "Primary surface", kind: "json", expected_in_builder_v1: true },
  { path: "intent/palettes.json", schema_id: "kindred.intent.palettes.v1", title: "Interaction palettes", kind: "json", expected_in_builder_v1: true },
  { path: "intent/domains.json", schema_id: "kindred.intent.domains.v1", title: "Domains (drill-down)", kind: "json", expected_in_builder_v1: true },
  { path: "intent/constraints.json", schema_id: "kindred.intent.constraints.v1", title: "Constraints", kind: "json", expected_in_builder_v1: true },
  { path: "intent/intake.json", schema_id: "kindred.intent.intake.v1", title: "Deterministic intent intake", kind: "json", expected_in_builder_v1: true },
  { path: "intent/selections.json", schema_id: "kindred.intent.selections.v1", title: "Deterministic selections", kind: "json", expected_in_builder_v1: true },
  { path: "intent/brief.json", schema_id: "kindred.intent.brief.v1", title: "Product brief", kind: "json", expected_in_builder_v1: true },
  { path: "design/profile.json", schema_id: "kindred.design.profile.v1", title: "Brand profile", kind: "json", expected_in_builder_v1: true },
  { path: "design/references.json", schema_id: "kindred.design.references.v1", title: "Design references", kind: "json", expected_in_builder_v1: true },
  { path: "design/tokens.json", schema_id: "kindred.design.tokens.v1", title: "Design tokens (input)", kind: "json", expected_in_builder_v1: true },
  { path: "design/tokens_compiled.json", schema_id: "kindred.design.tokens_compiled.v1", title: "Design tokens (compiled)", kind: "json", expected_in_builder_v1: true },
  { path: "design/ia_tree.json", schema_id: "kindred.design.ia_tree.v1", title: "IA tree", kind: "json", expected_in_builder_v1: true },
  { path: "design/lofi_layouts.json", schema_id: "kindred.design.lofi_layouts.v1", title: "Low-fi layouts", kind: "json", expected_in_builder_v1: true },
  { path: "content/copy_blocks.json", schema_id: "kindred.content.copy_blocks.v1", title: "Copy blocks", kind: "json", expected_in_builder_v1: true },
  { path: "kernel_min/actors.json", schema_id: "kindred.kernel_min.actors.v1", title: "Actors (canonical)", kind: "json", expected_in_builder_v1: true },
  { path: "kernel_min/scenes.json", schema_id: "kindred.kernel_min.scenes.v1", title: "Scenes (canonical)", kind: "json", expected_in_builder_v1: true },
  { path: "kernel_min/flows.json", schema_id: "kindred.kernel_min.flows.v1", title: "Flows (canonical)", kind: "json", expected_in_builder_v1: true },
  { path: "ux/actors.json", schema_id: "kindred.kernel_min.actors.v1", title: "Actors (legacy alias)", kind: "json", expected_in_builder_v1: false },
  { path: "ux/scenes.json", schema_id: "kindred.kernel_min.scenes.v1", title: "Scenes (legacy alias)", kind: "json", expected_in_builder_v1: false },
  { path: "ux/flows.json", schema_id: "kindred.kernel_min.flows.v1", title: "Flows (legacy alias)", kind: "json", expected_in_builder_v1: false },
  { path: "brownfield/inventory.json", schema_id: "kindred.brownfield.inventory.v1", title: "Brownfield inventory", kind: "json", expected_in_builder_v1: true },
  { path: "dist/builder_gate_report.json", schema_id: "kindred.builder_gate_report.v1", title: "Builder gate report", kind: "json", expected_in_builder_v1: true },
  { path: "blueprint/hello.spel", schema_id: "kindred.spel.v1", title: "SPEL slice (auditing)", kind: "text", expected_in_builder_v1: false },
  { path: "spel/libraries.spel", schema_id: "kindred.libraries.spel.v1", title: "Libraries module (chips-only)", kind: "text", expected_in_builder_v1: false },
  { path: "spel/patterns.spel", schema_id: "kindred.patterns.spel.v1", title: "Patterns module (catalog)", kind: "text", expected_in_builder_v1: false },
  { path: "spel/kits.spel", schema_id: "kindred.kits.spel.v1", title: "Kits module (bindings)", kind: "text", expected_in_builder_v1: false },
  { path: "spel/domains.spel", schema_id: "kindred.domains.spel.v1", title: "Domains module (drill-down)", kind: "text", expected_in_builder_v1: false },
];

const BUILD_INTENTS = new Set([
  "website",
  "product_app",
  "marketplace",
  "community",
  "automation",
  "data_api",
  "governed_system",
]);

const PRIMARY_SURFACES = new Set([
  "content_site",
  "web_app",
  "mobile_app",
  "cli_tool",
  "automation",
  "api_service",
]);

const PALETTES = new Set([
  "identity_access",
  "communication_social",
  "content_media",
  "knowledge_learning",
  "search_navigation",
  "matching_recommendation",
  "collaboration_work",
  "commerce_value",
  "governance_policy",
  "reputation_safety",
  "game_incentives",
  "automation_workflows",
  "infrastructure_data_files",
  "connection_integration",
]);

const RIGOR_LEVELS = new Set(["safe", "strict", "audit"]);

function nowUtc() {
  return new Date().toISOString();
}

function push(issues: ValidationIssue[], issue: ValidationIssue) {
  issues.push(issue);
}


function requireOneOfFiles(pack: SpecPack, paths: string[], issues: ValidationIssue[], requiredTitle: string) {
  const has = paths.find((p) => pack.fileMap.has(p));
  if (!has) {
    push(issues, { severity: "error", code: "MISSING_FILE", message: `Missing required ${requiredTitle}. Expected one of: ${paths.join(', ')}`, file: paths[0] });
    return null;
  }
  // Prefer canonical path if present.
  return pack.fileMap.has(paths[0]) ? paths[0] : has;
}

function requireFile(pack: SpecPack, path: string, issues: ValidationIssue[]) {
  if (!pack.fileMap.has(path)) {
    push(issues, { severity: "error", code: "MISSING_FILE", message: `Missing required file: ${path}`, file: path });
  }
}


const VALID_SECTION_IDS = new Set(SECTION_LIBRARY.map((s) => s.id));

function isStringArray(x: any): boolean {
  return Array.isArray(x) && x.every((i) => typeof i === "string");
}

/**
 * Deterministic Spec Pack validation used by:
 * - Builder (pre-export gates)
 * - Workbench (inspector + jump-to-fix)
 */
export function validateSpecPack(pack: SpecPack): ValidationReport {
  const issues: ValidationIssue[] = [];

  // Parsed core fields (used for cross-file recommendations).
  let buildIntent: string | undefined;
  let primarySurface: string | undefined;
  let palettes: string[] | undefined;
  let constraints: { offline_first: boolean; no_payments: boolean } | undefined;

  // Manifest checks (structure + contents).
  const m = getManifest(pack);
  if (!m.ok) {
    push(issues, { severity: "error", code: "MANIFEST_INVALID", message: m.error, file: "spec_pack_manifest.json" });
  } else {
    const vm = validateManifest(pack);
    for (const msg of vm.issues) {
      if (msg.startsWith("Manifest refers to missing file:")) {
        const path = msg.replace("Manifest refers to missing file:", "").trim();
        push(issues, { severity: "error", code: "MANIFEST_REF_MISSING", message: msg, file: path || "spec_pack_manifest.json" });
      } else if (msg.startsWith("Extra file not listed in manifest:")) {
        const path = msg.replace("Extra file not listed in manifest:", "").trim();
        push(issues, { severity: "warn", code: "MANIFEST_EXTRA_FILE", message: msg, file: path || "spec_pack_manifest.json" });
      } else {
        push(issues, { severity: "warn", code: "MANIFEST_NOTE", message: msg, file: "spec_pack_manifest.json" });
      }
    }
  }

  // Schema registry coverage hints.
  const registryPaths = new Set(SPEC_PACK_SCHEMA_REGISTRY_V1.map((e) => e.path));
  for (const path of pack.fileMap.keys()) {
    if (!registryPaths.has(path)) {
      push(issues, {
        severity: "warn",
        code: "SCHEMA_UNKNOWN_FILE",
        message: "File is not in the schema registry (v1). This is allowed, but the Workbench may not fully understand it yet.",
        file: path,
      });
    }
  }
  for (const e of SPEC_PACK_SCHEMA_REGISTRY_V1) {
    if (e.expected_in_builder_v1 && !pack.fileMap.has(e.path)) {
      push(issues, {
        severity: "warn",
        code: "SCHEMA_EXPECTED_FILE_MISSING",
        message: `Expected file missing (builder v1): ${e.path}`,
        file: e.path,
      });
    }
  }

  // Required baseline files (v0.x compatibility)
  requireFile(pack, "spec_pack_manifest.json", issues);
  requireFile(pack, "project/meta.json", issues);
  requireFile(pack, "contracts/rigor.json", issues);
  requireFile(pack, "intent/build_intent.json", issues);
  requireFile(pack, "intent/targets.json", issues);
  requireFile(pack, "intent/palettes.json", issues);
  requireFile(pack, "intent/constraints.json", issues);
  requireFile(pack, "design/profile.json", issues);
  requireFile(pack, "design/references.json", issues);
  requireFile(pack, "design/tokens.json", issues);
  requireFile(pack, "design/ia_tree.json", issues);
  requireFile(pack, "design/lofi_layouts.json", issues);
  requireOneOfFiles(pack, ["kernel_min/actors.json", "ux/actors.json"], issues, "kernel_min actors");
  requireOneOfFiles(pack, ["kernel_min/scenes.json", "ux/scenes.json"], issues, "kernel_min scenes");
  requireOneOfFiles(pack, ["kernel_min/flows.json", "ux/flows.json"], issues, "kernel_min flows");

  // Optional brief (helps proposals + review, but not required).
  if (!pack.fileMap.has("intent/brief.json")) {
    push(issues, { severity: "warn", code: "OPTIONAL_FILE_MISSING", message: "Missing optional brief.", file: "intent/brief.json" });
  }

  // Optional artifacts (useful for auditing, but not required).
  if (!pack.fileMap.has("dist/builder_gate_report.json")) {
    push(issues, { severity: "warn", code: "OPTIONAL_FILE_MISSING", message: "Missing optional builder gate report.", file: "dist/builder_gate_report.json" });
  }

  // Rigor contract (required): controls how WARN/FAIL is interpreted in guided rails.
  const rigorFile = pack.fileMap.get("contracts/rigor.json");
  if (rigorFile) {
    const parsed = tryParseJson<any>(asText(rigorFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: "contracts/rigor.json" });
    } else {
      const schema = String(parsed.value?.schema || "");
      const level = String(parsed.value?.level || "");
      if (schema !== "kindred.rigor_contract.v1") {
        push(issues, { severity: "error", code: "RIGOR_CONTRACT_INVALID", message: "contracts/rigor.json has wrong schema", file: "contracts/rigor.json", pointer: "/schema" });
      }
      if (!RIGOR_LEVELS.has(level)) {
        push(issues, { severity: "error", code: "RIGOR_LEVEL_INVALID", message: "rigor.level must be one of: safe, strict, audit", file: "contracts/rigor.json", pointer: "/level" });
      }
    }
  }

  // Parse + validate build_intent
  const buildIntentFile = pack.fileMap.get("intent/build_intent.json");
  if (buildIntentFile) {
    const parsed = tryParseJson<any>(asText(buildIntentFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: "intent/build_intent.json" });
    } else {
      const v = parsed.value?.build_intent;
      if (!v || typeof v !== "string" || !BUILD_INTENTS.has(v)) {
        push(issues, {
          severity: "error",
          code: "BUILD_INTENT_INVALID",
          message: "build_intent must be one of the supported intents",
          file: "intent/build_intent.json",
          pointer: "/build_intent",
        });
      }
      if (typeof v === "string" && BUILD_INTENTS.has(v)) {
        buildIntent = v;
      }
    }
  }

  // Parse + validate primary surface
  const targetsFile = pack.fileMap.get("intent/targets.json");
  if (targetsFile) {
    const parsed = tryParseJson<any>(asText(targetsFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: "intent/targets.json" });
    } else {
      const v = parsed.value?.primary_surface;
      if (!v || typeof v !== "string" || !PRIMARY_SURFACES.has(v)) {
        push(issues, {
          severity: "error",
          code: "PRIMARY_SURFACE_INVALID",
          message: "primary_surface must be one of the supported surfaces",
          file: "intent/targets.json",
          pointer: "/primary_surface",
        });
      }
      if (typeof v === "string" && PRIMARY_SURFACES.has(v)) {
        primarySurface = v;
      }
    }
  }

  // Parse + validate palettes
  const palettesFile = pack.fileMap.get("intent/palettes.json");
  if (palettesFile) {
    const parsed = tryParseJson<any>(asText(palettesFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: "intent/palettes.json" });
    } else {
      const arr = parsed.value?.palettes;
      if (!Array.isArray(arr) || arr.length === 0) {
        push(issues, {
          severity: "error",
          code: "PALETTES_EMPTY",
          message: "palettes must be a non-empty array",
          file: "intent/palettes.json",
          pointer: "/palettes",
        });
      } else {
        let okAll = true;
        for (const p of arr) {
          if (typeof p !== "string" || !PALETTES.has(p)) {
            okAll = false;
            push(issues, {
              severity: "error",
              code: "PALETTE_INVALID",
              message: `Invalid palette id: ${String(p)}`,
              file: "intent/palettes.json",
              pointer: "/palettes",
            });
          }
        }

        if (okAll) {
          palettes = arr.slice();
        }
      }
    }
  }

  // Parse + validate constraints
  const constraintsFile = pack.fileMap.get("intent/constraints.json");
  if (constraintsFile) {
    const parsed = tryParseJson<any>(asText(constraintsFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: "intent/constraints.json" });
    } else {
      const v = parsed.value || {};
      const offline_first = v?.offline_first;
      const no_payments = v?.no_payments;
      if (typeof offline_first !== "boolean") {
        push(issues, { severity: "error", code: "CONSTRAINT_INVALID", message: "offline_first must be boolean", file: "intent/constraints.json", pointer: "/offline_first" });
      }
      if (typeof no_payments !== "boolean") {
        push(issues, { severity: "error", code: "CONSTRAINT_INVALID", message: "no_payments must be boolean", file: "intent/constraints.json", pointer: "/no_payments" });
      }
      if (typeof offline_first === "boolean" && typeof no_payments === "boolean") {
        constraints = { offline_first, no_payments };
      }
    }
  }

  // Cross-file guidance: recommended palettes + recommended surface for the chosen intent.
  if (buildIntent && primarySurface && palettes && constraints) {
    const allowedSurfaces = recommendedSurfacesForIntent(buildIntent as any);
    if (allowedSurfaces.length > 0 && !allowedSurfaces.includes(primarySurface as any)) {
      push(issues, {
        severity: "warn",
        code: "SURFACE_NOT_RECOMMENDED",
        message: `Surface "${primarySurface}" is unusual for intent "${buildIntent}" (recommended: ${allowedSurfaces.join(", ")}).`,
        file: "intent/targets.json",
        pointer: "/primary_surface",
      });
    }

    const rec = recommendedPalettes({
      build_intent: buildIntent as any,
      primary_surface: primarySurface as any,
      constraints,
    });

    for (const p of rec.recommended) {
      if (!palettes.includes(p)) {
        push(issues, {
          severity: "warn",
          code: "PALETTE_RECOMMENDED_MISSING",
          message: `Recommended palette missing: ${p} (intent=${buildIntent}, surface=${primarySurface}).`,
          file: "intent/palettes.json",
          pointer: "/palettes",
        });
      }
    }

    if (constraints.no_payments && buildIntent === "marketplace") {
      push(issues, {
        severity: "warn",
        code: "NO_PAYMENTS_MARKETPLACE",
        message: "no_payments=true is set for a marketplace intent. Ensure checkout/payment flows are removed or replaced with off-platform value exchange.",
        file: "intent/constraints.json",
        pointer: "/no_payments",
      });
    }
  }

  // Parse + validate brief (if present)
  const briefFile = pack.fileMap.get("intent/brief.json");
  if (briefFile) {
    const parsed = tryParseJson<any>(asText(briefFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `intent/brief.json is not valid JSON: ${parsed.error}`, file: "intent/brief.json" });
    } else {
      const v = parsed.value || {};
      const schema = v?.schema;
      if (schema && schema !== "kindred.intent.brief.v1") {
        push(issues, { severity: "warn", code: "BRIEF_SCHEMA_UNEXPECTED", message: "Brief schema is unexpected (still accepted).", file: "intent/brief.json", pointer: "/schema" });
      }
      const audience_description = v?.audience_description;
      const problem = v?.problem;
      const offer = v?.offer;
      const differentiators = v?.differentiators;
      const key_actions = v?.key_actions;
      const success_metrics = v?.success_metrics;
      const non_goals = v?.non_goals;

      if (typeof audience_description !== "string") {
        push(issues, { severity: "error", code: "BRIEF_INVALID", message: "audience_description must be a string", file: "intent/brief.json", pointer: "/audience_description" });
      }
      if (typeof problem !== "string") {
        push(issues, { severity: "error", code: "BRIEF_INVALID", message: "problem must be a string", file: "intent/brief.json", pointer: "/problem" });
      }
      if (typeof offer !== "string") {
        push(issues, { severity: "error", code: "BRIEF_INVALID", message: "offer must be a string", file: "intent/brief.json", pointer: "/offer" });
      }

      if (differentiators !== undefined && !isStringArray(differentiators)) {
        push(issues, { severity: "error", code: "BRIEF_INVALID", message: "differentiators must be an array of strings", file: "intent/brief.json", pointer: "/differentiators" });
      }
      if (key_actions !== undefined && !isStringArray(key_actions)) {
        push(issues, { severity: "error", code: "BRIEF_INVALID", message: "key_actions must be an array of strings", file: "intent/brief.json", pointer: "/key_actions" });
      }
      if (success_metrics !== undefined && !isStringArray(success_metrics)) {
        push(issues, { severity: "error", code: "BRIEF_INVALID", message: "success_metrics must be an array of strings", file: "intent/brief.json", pointer: "/success_metrics" });
      }
      if (non_goals !== undefined && !isStringArray(non_goals)) {
        push(issues, { severity: "error", code: "BRIEF_INVALID", message: "non_goals must be an array of strings", file: "intent/brief.json", pointer: "/non_goals" });
      }

      if (typeof problem === "string" && problem.trim() === "") {
        push(issues, { severity: "warn", code: "BRIEF_EMPTY", message: "Brief problem is empty.", file: "intent/brief.json", pointer: "/problem" });
      }
      if (typeof offer === "string" && offer.trim() === "") {
        push(issues, { severity: "warn", code: "BRIEF_EMPTY", message: "Brief offer is empty.", file: "intent/brief.json", pointer: "/offer" });
      }
    }
  }

  // Parse + validate tokens (minimal sanity)
  const tokensFile = pack.fileMap.get("design/tokens.json");
  if (tokensFile) {
    const parsed = tryParseJson<any>(asText(tokensFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: "design/tokens.json" });
    } else {
      const t = parsed.value || {};
      const enums: Record<string, { set: Set<string>; pointer: string }> = {
        radius: { set: new Set(["sharp", "balanced", "round"]), pointer: "/radius" },
        density: { set: new Set(["compact", "balanced", "airy"]), pointer: "/density" },
        contrast: { set: new Set(["balanced", "high"]), pointer: "/contrast" },
        motion: { set: new Set(["none", "subtle", "lively"]), pointer: "/motion" },
        type_scale: { set: new Set(["small", "balanced", "large"]), pointer: "/type_scale" },
        line_height: { set: new Set(["tight", "balanced", "relaxed"]), pointer: "/line_height" },
        focus: { set: new Set(["standard", "high"]), pointer: "/focus" },
        elevation: { set: new Set(["flat", "balanced", "deep"]), pointer: "/elevation" },
        layout_width: { set: new Set(["narrow", "balanced", "wide"]), pointer: "/layout_width" },
        voice: { set: new Set(["serious", "playful"]), pointer: "/voice" },
        mode: { set: new Set(["light", "dark", "system"]), pointer: "/mode" },
      };
      for (const [k, meta] of Object.entries(enums)) {
        const v = t[k];
        if (v === undefined || v === null || v === "") {
          push(issues, {
            severity: "warn",
            code: "TOKEN_MISSING",
            message: `Token missing: ${k}. A default will be assumed by newer builders.`,
            file: "design/tokens.json",
            pointer: meta.pointer,
          });
          continue;
        }
        if (typeof v !== "string" || !meta.set.has(v)) {
          push(issues, {
            severity: "error",
            code: "TOKEN_INVALID",
            message: `Invalid token value for ${k}`,
            file: "design/tokens.json",
            pointer: meta.pointer,
          });
        }
      }
    }
  }

  // Parse + validate IA tree
  const iaFile = pack.fileMap.get("design/ia_tree.json");
  if (iaFile) {
    const parsed = tryParseJson<any>(asText(iaFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: "design/ia_tree.json" });
    } else {
      const pages = parsed.value?.pages;

      // Optional: load scenes for scene_id validation.
      const sceneIds = new Set<string>();
      const scenesFileForIa = pack.fileMap.get("kernel_min/scenes.json") || pack.fileMap.get("ux/scenes.json");
      if (scenesFileForIa) {
        const parsedScenes = tryParseJson<any>(asText(scenesFileForIa));
        if (parsedScenes.ok && Array.isArray(parsedScenes.value?.scenes)) {
          for (const s of parsedScenes.value.scenes) {
            if (s && typeof s.id === "string") sceneIds.add(s.id);
          }
        }
      }

      if (!Array.isArray(pages) || pages.length === 0) {
        push(issues, { severity: "error", code: "IA_TREE_INVALID", message: "ia_tree.pages must be a non-empty array", file: "design/ia_tree.json", pointer: "/pages" });
      } else {
        const ids = new Set<string>();
        const routePaths = new Map<string, string>(); // route_path -> page_id
        let rootCount = 0;

        for (const p of pages) {
          if (!p || typeof p !== "object" || typeof p.id !== "string" || !p.id.trim()) {
            push(issues, { severity: "error", code: "IA_PAGE_ID_INVALID", message: "Each page must have a non-empty id", file: "design/ia_tree.json", pointer: "/pages" });
            continue;
          }
          if (ids.has(p.id)) {
            push(issues, { severity: "error", code: "IA_PAGE_ID_DUP", message: `Duplicate page id: ${p.id}`, file: "design/ia_tree.json", pointer: "/pages" });
          }
          ids.add(p.id);

          if (typeof p.title !== "string" || !p.title.trim()) {
            push(issues, { severity: "warn", code: "IA_PAGE_TITLE_EMPTY", message: `Page ${p.id} has an empty title`, file: "design/ia_tree.json", pointer: "/pages" });
          }

          if (!p.parent_id) rootCount += 1;

          if (p.route_path !== undefined) {
            if (typeof p.route_path !== "string" || !p.route_path.startsWith("/") || /\s/.test(p.route_path)) {
              push(issues, { severity: "warn", code: "IA_ROUTE_INVALID", message: `route_path should start with "/" and contain no spaces (page: ${p.id})`, file: "design/ia_tree.json", pointer: "/pages" });
            } else {
              const existing = routePaths.get(p.route_path);
              if (existing && existing !== p.id) {
                push(issues, { severity: "warn", code: "IA_ROUTE_DUP", message: `Duplicate route_path: ${p.route_path} (pages: ${existing}, ${p.id})`, file: "design/ia_tree.json", pointer: "/pages" });
              } else {
                routePaths.set(p.route_path, p.id);
              }
            }
          } else {
            push(issues, { severity: "warn", code: "IA_ROUTE_MISSING", message: `route_path missing for page: ${p.id}`, file: "design/ia_tree.json", pointer: "/pages" });
          }

          if (p.scene_id !== undefined) {
            if (typeof p.scene_id !== "string" || !p.scene_id.trim()) {
              push(issues, { severity: "warn", code: "IA_SCENE_LINK_INVALID", message: `scene_id must be a string (page: ${p.id})`, file: "design/ia_tree.json", pointer: "/pages" });
            } else if (sceneIds.size > 0 && !sceneIds.has(p.scene_id)) {
              push(issues, { severity: "warn", code: "IA_SCENE_LINK_MISSING", message: `scene_id points to a missing scene: ${p.scene_id} (page: ${p.id})`, file: "design/ia_tree.json", pointer: "/pages" });
            }
          }
        }

        if (rootCount === 0) {
          push(issues, { severity: "warn", code: "IA_NO_ROOT", message: "IA has no root pages (parent_id missing on none).", file: "design/ia_tree.json", pointer: "/pages" });
        }

        // Parent validity + cycle detection
        const children = new Map<string, string[]>();
        for (const p of pages) {
          if (!p || typeof p.id !== "string") continue;
          const parent = p.parent_id;
          if (parent && typeof parent === "string") {
            if (!ids.has(parent)) {
              push(issues, { severity: "error", code: "IA_PARENT_INVALID", message: `Unknown parent_id: ${parent} (page: ${p.id})`, file: "design/ia_tree.json", pointer: "/pages" });
            } else {
              if (!children.has(parent)) children.set(parent, []);
              children.get(parent)!.push(p.id);
            }
          }
        }

        const visiting = new Set<string>();
        const visited = new Set<string>();
        let cycleFound = false;

        function dfs(id: string) {
          if (cycleFound) return;
          if (visiting.has(id)) {
            cycleFound = true;
            return;
          }
          if (visited.has(id)) return;
          visiting.add(id);
          const kids = children.get(id) || [];
          for (const k of kids) dfs(k);
          visiting.delete(id);
          visited.add(id);
        }

        for (const id of ids) dfs(id);

        if (cycleFound) {
          push(issues, { severity: "error", code: "IA_CYCLE", message: "IA tree has a cycle (parent_id chain loops).", file: "design/ia_tree.json", pointer: "/pages" });
        }
      }
    }
  }

  // Parse + validate low-fi layouts
  const lofiFile = pack.fileMap.get("design/lofi_layouts.json");
  if (lofiFile) {
    const parsed = tryParseJson<any>(asText(lofiFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: "design/lofi_layouts.json" });
    } else {
      const variants = parsed.value?.variants;
      const active = parsed.value?.active_variant_id;

      if (!Array.isArray(variants) || variants.length === 0) {
        push(issues, { severity: "warn", code: "LOFI_EMPTY", message: "No low-fi variants found. This is allowed but not ideal.", file: "design/lofi_layouts.json", pointer: "/variants" });
      } else {
        if (!active || typeof active !== "string") {
          push(issues, { severity: "warn", code: "LOFI_ACTIVE_MISSING", message: "active_variant_id missing; default will be used.", file: "design/lofi_layouts.json", pointer: "/active_variant_id" });
        } else {
          const ok = variants.some((v: any) => v?.id === active);
          if (!ok) {
            push(issues, { severity: "error", code: "LOFI_ACTIVE_INVALID", message: "active_variant_id does not match any variant id.", file: "design/lofi_layouts.json", pointer: "/active_variant_id" });
          }
        }

        // Coverage check: if IA exists, warn if active variant has no entry for a page
        const iaFile2 = pack.fileMap.get("design/ia_tree.json");
        if (iaFile2 && active && typeof active === "string") {
          const iaParsed = tryParseJson<any>(asText(iaFile2));
          if (iaParsed.ok) {
            const pages = iaParsed.value?.pages;
            const activeVariant = variants.find((v: any) => v?.id === active);
            const pageMap = activeVariant?.pages || {};
            if (Array.isArray(pages) && activeVariant) {
              for (const p of pages) {
                const id = p?.id;
                if (typeof id === "string" && !(id in pageMap)) {
                  push(issues, { severity: "warn", code: "LOFI_PAGE_MISSING", message: `Active low-fi variant has no layout for page: ${id}`, file: "design/lofi_layouts.json" });
                }
              }
            }
          }
        }

        // Section validation: warn on unknown sections, duplicates, and overly-long lists.
        for (const v of variants) {
          const pages = (v as any)?.pages || {};
          for (const [pageId, entry] of Object.entries(pages)) {
            const secs = (entry as any)?.sections;
            if (!Array.isArray(secs)) continue;

            const seen = new Set<string>();
            for (const s of secs) {
              if (typeof s !== "string") continue;
              if (seen.has(s)) {
                push(issues, {
                  severity: "warn",
                  code: "LOFI_SECTION_DUP",
                  message: `Duplicate section "${s}" in ${String((v as any)?.id || "variant")} for page ${pageId}.`,
                  file: "design/lofi_layouts.json",
                });
              }
              seen.add(s);

              if (!VALID_SECTION_IDS.has(s)) {
                push(issues, {
                  severity: "warn",
                  code: "LOFI_SECTION_UNKNOWN",
                  message: `Unknown section "${s}" in ${String((v as any)?.id || "variant")} for page ${pageId}.`,
                  file: "design/lofi_layouts.json",
                });
              }
            }

            if (secs.length > 14) {
              push(issues, {
                severity: "warn",
                code: "LOFI_SECTION_TOO_MANY",
                message: `Page ${pageId} has ${secs.length} sections in ${String((v as any)?.id || "variant")}. Consider trimming for clarity.`,
                file: "design/lofi_layouts.json",
              });
            }
          }
        }
      }
    }
  }

  // Parse + validate copy blocks (optional)
  const copyFile = pack.fileMap.get("content/copy_blocks.json");
  if (copyFile) {
    const parsed = tryParseJson<any>(asText(copyFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: "content/copy_blocks.json" });
    } else {
      const schema = parsed.value?.schema;
      if (schema !== "kindred.content.copy_blocks.v1") {
        push(issues, {
          severity: "warn",
          code: "COPY_SCHEMA_MISMATCH",
          message: "copy_blocks.schema should be kindred.content.copy_blocks.v1",
          file: "content/copy_blocks.json",
          pointer: "/schema",
        });
      }
      const blocks = parsed.value?.blocks;
      if (!Array.isArray(blocks)) {
        push(issues, {
          severity: "error",
          code: "COPY_BLOCKS_INVALID",
          message: "copy_blocks.blocks must be an array",
          file: "content/copy_blocks.json",
          pointer: "/blocks",
        });
      } else {
        const pageIds = new Set<string>();
        const iaFileForCopy = pack.fileMap.get("design/ia_tree.json");
        if (iaFileForCopy) {
          const parsedIa = tryParseJson<any>(asText(iaFileForCopy));
          if (parsedIa.ok && Array.isArray(parsedIa.value?.pages)) {
            for (const p of parsedIa.value.pages) {
              if (p && typeof p.id === "string") pageIds.add(p.id);
            }
          }
        }

        const ids = new Set<string>();
        for (let i = 0; i < blocks.length; i += 1) {
          const b = blocks[i];
          const ptr = `/blocks/${i}`;
          if (!b || typeof b !== "object") {
            push(issues, { severity: "warn", code: "COPY_BLOCK_INVALID", message: "Copy block must be an object", file: "content/copy_blocks.json", pointer: ptr });
            continue;
          }
          const id = typeof b.id === "string" ? b.id.trim() : "";
          const page_id = typeof b.page_id === "string" ? b.page_id.trim() : "";
          const slot = typeof b.slot === "string" ? b.slot.trim() : "";
          const text = typeof b.text === "string" ? b.text : "";

          if (!id) {
            push(issues, { severity: "warn", code: "COPY_ID_MISSING", message: "Copy block id missing", file: "content/copy_blocks.json", pointer: `${ptr}/id` });
          } else {
            if (ids.has(id)) {
              push(issues, { severity: "warn", code: "COPY_ID_DUP", message: `Duplicate copy block id: ${id}`, file: "content/copy_blocks.json", pointer: `${ptr}/id` });
            }
            ids.add(id);
          }

          if (!page_id) {
            push(issues, { severity: "warn", code: "COPY_PAGE_MISSING", message: "Copy block page_id missing", file: "content/copy_blocks.json", pointer: `${ptr}/page_id` });
          } else if (pageIds.size > 0 && !pageIds.has(page_id)) {
            push(issues, { severity: "warn", code: "COPY_PAGE_UNKNOWN", message: `page_id does not exist in IA: ${page_id}`, file: "content/copy_blocks.json", pointer: `${ptr}/page_id` });
          }

          if (!slot) {
            push(issues, { severity: "warn", code: "COPY_SLOT_MISSING", message: "Copy block slot missing", file: "content/copy_blocks.json", pointer: `${ptr}/slot` });
          }

          if (typeof text !== "string") {
            push(issues, { severity: "warn", code: "COPY_TEXT_INVALID", message: "Copy block text must be a string", file: "content/copy_blocks.json", pointer: `${ptr}/text` });
          }
        }
      }
    }
  }
  const actorsPath = pack.fileMap.has("kernel_min/actors.json") ? "kernel_min/actors.json" : "ux/actors.json";
  const actorsFile = pack.fileMap.get(actorsPath);
  if (actorsFile) {
    const parsed = tryParseJson<any>(asText(actorsFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: actorsPath });
    } else {
      const actors = parsed.value?.actors;
      if (!Array.isArray(actors) || actors.length === 0) {
        push(issues, { severity: "error", code: "ACTORS_EMPTY", message: "actors must be a non-empty array", file: actorsPath, pointer: "/actors" });
      } else {
        const ids = new Set<string>();
        for (const a of actors) {
          if (!a || typeof a !== "object") continue;
          if (typeof a.id !== "string" || !a.id.trim()) {
            push(issues, { severity: "error", code: "ACTOR_ID_INVALID", message: "actor id must be a non-empty string", file: actorsPath, pointer: "/actors" });
            continue;
          }
          if (ids.has(a.id)) {
            push(issues, { severity: "error", code: "ACTOR_ID_DUP", message: `Duplicate actor id: ${a.id}`, file: actorsPath });
          }
          ids.add(a.id);
          if (typeof a.display_name !== "string" || !a.display_name.trim()) {
            push(issues, { severity: "warn", code: "ACTOR_NAME_MISSING", message: `Actor ${a.id} has an empty display_name`, file: actorsPath });
          }
        }
        if (!ids.has("visitor")) {
          push(issues, { severity: "warn", code: "ACTOR_VISITOR_MISSING", message: "No 'visitor' actor found. This is allowed but most packs include it.", file: actorsPath });
        }
      }
    }
  }

  // Parse + validate scenes/flows referential integrity
  const scenesPath = pack.fileMap.has("kernel_min/scenes.json") ? "kernel_min/scenes.json" : "ux/scenes.json";
  const flowsPath = pack.fileMap.has("kernel_min/flows.json") ? "kernel_min/flows.json" : "ux/flows.json";
  const scenesFile = pack.fileMap.get(scenesPath);
  const flowsFile = pack.fileMap.get(flowsPath);
  if (scenesFile) {
    const parsed = tryParseJson<any>(asText(scenesFile));
    if (!parsed.ok) {
      push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsed.error}`, file: scenesPath });
    } else {
      const scenes = parsed.value?.scenes;
      if (!Array.isArray(scenes) || scenes.length === 0) {
        push(issues, { severity: "error", code: "SCENES_EMPTY", message: "scenes must be a non-empty array", file: scenesPath, pointer: "/scenes" });
      } else {
        const ids = new Set<string>();
        let entryCount = 0;
        for (const s of scenes) {
          if (!s || typeof s !== "object") continue;
          if (typeof s.id !== "string" || !s.id.trim()) {
            push(issues, { severity: "error", code: "SCENE_ID_INVALID", message: "scene id must be a non-empty string", file: scenesPath, pointer: "/scenes" });
          } else {
            if (ids.has(s.id)) push(issues, { severity: "error", code: "SCENE_ID_DUP", message: `Duplicate scene id: ${s.id}`, file: scenesPath });
            ids.add(s.id);
          }
          if (s.entry === true) entryCount += 1;
        }
        if (entryCount !== 1) {
          push(issues, { severity: "error", code: "ENTRY_SCENE_INVALID", message: "Exactly one scene must be marked entry:true", file: scenesPath });
        }

        if (flowsFile) {
          const parsedFlows = tryParseJson<any>(asText(flowsFile));
          if (!parsedFlows.ok) {
            push(issues, { severity: "error", code: "JSON_INVALID", message: `Invalid JSON: ${parsedFlows.error}`, file: flowsPath });
          } else {
            const flows = parsedFlows.value?.flows;
            if (!Array.isArray(flows) || flows.length === 0) {
              push(issues, { severity: "error", code: "FLOWS_EMPTY", message: "flows must be a non-empty array", file: flowsPath, pointer: "/flows" });
            } else {
              for (const f of flows) {
                const arr = f?.scenes;
                if (!Array.isArray(arr) || arr.length === 0) {
                  push(issues, { severity: "error", code: "FLOW_SCENES_EMPTY", message: "flow.scenes must be a non-empty array", file: flowsPath, pointer: "/flows" });
                } else {
                  for (const sid of arr) {
                    if (typeof sid !== "string" || !ids.has(sid)) {
                      push(issues, {
                        severity: "error",
                        code: "FLOW_REF_INVALID",
                        message: `Flow references unknown scene id: ${String(sid)}`,
                        file: flowsPath,
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Deterministic ordering (stable UI and stable exports)
  const severityRank: Record<string, number> = { error: 0, warn: 1 };
  const sorted = issues.slice().sort((a, b) => {
    const af = a.file || "";
    const bf = b.file || "";
    if (af !== bf) return af.localeCompare(bf);
    const as = severityRank[a.severity] ?? 9;
    const bs = severityRank[b.severity] ?? 9;
    if (as !== bs) return as - bs;
    const ac = a.code || "";
    const bc = b.code || "";
    if (ac !== bc) return ac.localeCompare(bc);
    const ap = a.pointer || "";
    const bp = b.pointer || "";
    if (ap !== bp) return ap.localeCompare(bp);
    const am = a.message || "";
    const bm = b.message || "";
    return am.localeCompare(bm);
  });

  const status: "pass" | "fail" = sorted.some((i) => i.severity === "error") ? "fail" : "pass";
  return {
    schema: "kindred.spec_pack_validation_report.v1",
    captured_at_utc: nowUtc(),
    status,
    issues: sorted,
  };
}
