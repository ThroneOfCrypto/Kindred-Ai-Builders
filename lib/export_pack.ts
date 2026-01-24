"use client";

import { strToU8 } from "fflate";
import { ProjectState } from "./types";
import { compileTokensForExport } from "./token_theme";
import { zipDeterministic } from "./deterministic_zip";
import { stableJsonText } from "./stable_json";
import { APP_VERSION, VALIDATOR_VERSION, SPEC_PACK_VERSION, ZIP_MTIME_UTC } from "./version";
import { librariesSddlText, normalizeLibraryIds } from "./libraries_spel";
import { patternsSddlText, normalizePatternIds } from "./patterns_spel";
import { kitsSddlText, normalizeKitIds } from "./kits_spel";
import { domainsSddlText, normalizeDomainIds } from "./domains_spel";
import { normalizeIntentIntake } from "./intake";
import { getRigorConfig } from "./rigor";
import { computeDeployLaneFit } from "./deploy_lane_fit";
import { computeCapabilityPlan } from "./capability_plan";

function pretty(obj: any) {
  return stableJsonText(obj, 2);
}

export type BuildSpecPackOptions = {
  include_council_dsl?: boolean;
};

export function buildSpecPack(state: ProjectState, options?: BuildSpecPackOptions): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  const includeCouncil = options?.include_council_dsl === true;

  const contents: string[] = [
    "project/meta.json",
    "contracts/rigor.json",
    "intent/launch_path.json",
    "intent/build_intent.json",
    "intent/targets.json",
    "intent/palettes.json",
    "intent/domains.json",
    "intent/constraints.json",
    "intent/intake.json",
    "intent/selections.json",
    "intent/brief.json",
    "design/profile.json",
    "design/references.json",
    "dist/deploy_lane_fit.json",
    "dist/capability_plan.json",
    "design/tokens.json",
    "design/tokens_compiled.json",
    "design/ia_tree.json",
    "design/lofi_layouts.json",
    "content/copy_blocks.json",
    "kernel_min/actors.json",
    "ux/actors.json",
    "kernel_min/scenes.json",
    "ux/scenes.json",
    "kernel_min/flows.json",
    "ux/flows.json",
    "brownfield/inventory.json",
    "dist/builder_gate_report.json",
  ];

  if (includeCouncil) {
    contents.push("blueprint/hello.spel");
    contents.push("spel/libraries.spel");
    contents.push("spel/patterns.spel");
    contents.push("spel/kits.spel");
    contents.push("spel/domains.spel");
  }

  files["spec_pack_manifest.json"] = strToU8(
    pretty({
      schema: "kindred.spec_pack_manifest.v1",
      // Determinism: avoid export-time timestamps.
      created_at_utc: state.project.created_at_utc || ZIP_MTIME_UTC,
      project_id: state.project.id,
      spec_pack_version: SPEC_PACK_VERSION,
      provenance: {
        app_version: APP_VERSION,
        validator_version: VALIDATOR_VERSION,
        spec_pack_version: SPEC_PACK_VERSION,
      },
      contents,
    })
  );

  files["project/meta.json"] = strToU8(pretty(state.project));

  // Portable contract: rigor dial (used by gates + checklist interpretation).
  // Determinism: do not embed export-time timestamps.
  let rigorLevel: string = "safe";
  try {
    rigorLevel = getRigorConfig(state.project.id).level;
  } catch {
    rigorLevel = "safe";
  }
  files["contracts/rigor.json"] = strToU8(
    pretty({
      schema: "kindred.rigor_contract.v1",
      captured_at_utc: ZIP_MTIME_UTC,
      project_id: state.project.id,
      level: rigorLevel,
    })
  );

  files["intent/launch_path.json"] = strToU8(pretty({ launch_path_id: state.intent.launch_path_id || null }));
  files["intent/build_intent.json"] = strToU8(pretty({ build_intent: state.intent.build_intent || null }));
  files["intent/targets.json"] = strToU8(pretty({ primary_surface: state.intent.primary_surface || null }));
  files["intent/palettes.json"] = strToU8(pretty({ palettes: state.intent.palettes }));
  files["intent/domains.json"] = strToU8(pretty({ schema: "kindred.intent.domains.v1", domains: normalizeDomainIds((state.intent as any).domains || []) }));
  files["intent/constraints.json"] = strToU8(pretty(state.intent.constraints));

  const intake = normalizeIntentIntake({
    raw: (state.intent as any).intake,
    build_intent: state.intent.build_intent,
    palettes: state.intent.palettes,
    legacy_notes: "",
  });

  files["intent/intake.json"] = strToU8(pretty(intake));

  const adoptedFrom = String((state as any)?.director?.adopted_from_spec_pack_sha256 || "");
  const adoptedAt = String((state as any)?.director?.adopted_at_utc || "");
  const adoptedLibraries = (state as any)?.director?.libraries_v1?.adopted_library_ids || [];
  const adoptedPatterns = (state as any)?.director?.patterns_v1?.adopted_pattern_ids || [];
  const adoptedKits = (state as any)?.director?.kits_v1?.adopted_kit_ids || [];
  const adoptedDataBindings = (state as any)?.director?.data_bindings_v1?.adopted || { source_id: "", sink_ids: [], trigger_id: "" };

  files["intent/selections.json"] = strToU8(
    pretty({
      schema: "kindred.intent.selections.v1",
      captured_at_utc: ZIP_MTIME_UTC,
      adopted: {
        library_ids: adoptedLibraries,
        pattern_ids: adoptedPatterns,
        kit_ids: adoptedKits,
        data_bindings: adoptedDataBindings,
        adopted_from_spec_pack_sha256: adoptedFrom || null,
        adopted_at_utc: adoptedAt || null,
      },
    })
  );

  const brief = state.intent.brief || {
    audience_description: "",
    problem: "",
    offer: "",
    differentiators: [],
    key_actions: [],
    success_metrics: [],
    non_goals: [],
  };
  files["intent/brief.json"] = strToU8(
    pretty({
      schema: "kindred.intent.brief.v1",
      audience_description: String(brief.audience_description || ""),
      problem: String(brief.problem || ""),
      offer: String(brief.offer || ""),
      differentiators: Array.isArray(brief.differentiators) ? brief.differentiators : [],
      key_actions: Array.isArray(brief.key_actions) ? brief.key_actions : [],
      success_metrics: Array.isArray(brief.success_metrics) ? brief.success_metrics : [],
      non_goals: Array.isArray(brief.non_goals) ? brief.non_goals : [],
    })
  );

  files["design/profile.json"] = strToU8(pretty(state.design.brand));
  files["design/references.json"] = strToU8(pretty({ references: state.design.references }));

  // Derived signals (do not change primitives; they explain lane fit and stack needs)
  files["dist/deploy_lane_fit.json"] = strToU8(pretty(computeDeployLaneFit(state)));
  files["dist/capability_plan.json"] = strToU8(pretty(computeCapabilityPlan(state)));

  files["design/tokens.json"] = strToU8(pretty(state.design.tokens));
  files["design/tokens_compiled.json"] = strToU8(pretty(compileTokensForExport(state.design.tokens)));
  files["design/ia_tree.json"] = strToU8(pretty({ pages: state.design.ia.pages }));
  files["design/lofi_layouts.json"] = strToU8(pretty({ active_variant_id: state.design.lofi.active_variant_id, variants: state.design.lofi.variants }));
  files["content/copy_blocks.json"] = strToU8(pretty({ schema: "kindred.content.copy_blocks.v1", blocks: state.content.copy_blocks }));
  const actorsBytes = strToU8(pretty({ actors: state.kernel_min.actors }));
  files["kernel_min/actors.json"] = actorsBytes;
  files["ux/actors.json"] = actorsBytes;
  const scenesBytes = strToU8(pretty({ scenes: state.kernel_min.scenes }));
  files["kernel_min/scenes.json"] = scenesBytes;
  files["ux/scenes.json"] = scenesBytes;
  const flowsBytes = strToU8(pretty({ flows: state.kernel_min.flows }));
  files["kernel_min/flows.json"] = flowsBytes;
  files["ux/flows.json"] = flowsBytes;

  files["brownfield/inventory.json"] = strToU8(pretty({ schema: "kindred.brownfield.inventory.v1", report: null }));

  const gate = gateReport(state);
  files["dist/builder_gate_report.json"] = strToU8(pretty(gate));

  if (includeCouncil) {
    // Export a minimal SPEL slice that mirrors the state. This is for auditing and advanced users.
    files["blueprint/hello.spel"] = strToU8(spelFromState(state));

    // Libraries SPEL module is the source-of-truth for capability selection.
    const adoptedIds = normalizeLibraryIds((state as any)?.director?.libraries_v1?.adopted_library_ids || []);
    files["spel/libraries.spel"] = strToU8(librariesSddlText({ library_ids: adoptedIds }));

    // Patterns SPEL module is the source-of-truth for reusable feature selection.
    const adoptedPatterns = normalizePatternIds((state as any)?.director?.patterns_v1?.adopted_pattern_ids || []);
    files["spel/patterns.spel"] = strToU8(patternsSddlText({ pattern_ids: adoptedPatterns }));

    // Kits SPEL module is the source-of-truth for provider/product bindings.
    const adoptedKits = normalizeKitIds((state as any)?.director?.kits_v1?.adopted_kit_ids || []);
    files["spel/kits.spel"] = strToU8(kitsSddlText({ kit_ids: adoptedKits }));

    // Domains SPEL module is the source-of-truth for drill-down selections.
    const domains = normalizeDomainIds((state.intent as any).domains || []);
    files["spel/domains.spel"] = strToU8(domainsSddlText({ domain_ids: domains }));
  }

  return zipDeterministic(files, { level: 6 });
}

function gateReport(state: ProjectState) {
  const issues: any[] = [];
  if (!state.intent.build_intent) issues.push({ severity: "error", code: "MISSING_BUILD_INTENT", hint: "Step: Build Intent" });
  if (!state.intent.primary_surface) issues.push({ severity: "error", code: "MISSING_PRIMARY_SURFACE", hint: "Step: Primary Surface" });
  if (state.intent.palettes.length === 0) issues.push({ severity: "error", code: "MISSING_PALETTES", hint: "Step: Palettes" });
  if (!state.design.brand.name.trim()) issues.push({ severity: "error", code: "MISSING_BRAND_NAME", hint: "Step: Brief" });

  const entryCount = state.kernel_min.scenes.filter((s) => s.entry).length;
  if (entryCount !== 1) issues.push({ severity: "error", code: "ENTRY_SCENE_INVALID", hint: "Exactly one entry scene required" });

  const status = issues.length === 0 ? "pass" : "fail";
  return {
    schema: "kindred.builder_gate_report.v1",
    // Determinism: captured time isn't part of the spec; keep stable.
    captured_at_utc: ZIP_MTIME_UTC,
    status,
    issues,
  };
}

function spelFromState(state: ProjectState): string {
  // SPEL is an advanced auditing surface. Keep it deterministic and compile-friendly.
  // Palettes are stored as IDs (not display labels) so they round-trip cleanly.
  const palettes = state.intent.palettes.slice();
  const build_intent = state.intent.build_intent || "";
  const primary_surface = state.intent.primary_surface || "";
  const brand_name = (state.design.brand?.name || "").trim();
  const actors = state.kernel_min.actors;
  const scenes = state.kernel_min.scenes;
  const flows = state.kernel_min.flows;

  const actorLines = actors
    .map((a) => `  ${safeKey(a.id)}:\n    display_name: ${yamlStr(a.display_name)}`)
    .join("\n");

  const sceneLines = scenes
    .map((s) => {
      const entry = s.entry ? "\n    entry: true" : "";
      const titleLine = `\n    title: ${yamlStr(s.title || safeKey(s.id))}`;
      return `  ${safeKey(s.id)}:${titleLine}\n    actors: [${actors.map((a) => safeKey(a.id)).join(", ")}]${entry}`;
    })
    .join("\n");

  const flowLines = flows
    .map((f) => `  - id: ${safeKey(f.id)}\n    scenes: [${f.scenes.map((x) => safeKey(x)).join(", ")}]`)
    .join("\n");

  return [
    "spel_version: 1",
    `feature: ${safeKey(state.project.id)}`,
    "",
    "intent:",
    `  build_intent: ${yamlStr(build_intent || "(unset)")}`,
    `  primary_surface: ${yamlStr(primary_surface || "(unset)")}`,
    `  brand_name: ${yamlStr(brand_name || "(unset)")}`,
    "",
    "palettes:",
    ...palettes.map((p) => `  - ${yamlStr(p)}`),
    "",
    "derived_artifacts:",
    "  capability_plan:",
    "    path: dist/capability_plan.json",
    "    derived_from: [intent.brief, intent.palettes, intent.targets]",
    "  deploy_lane_fit:",
    "    path: dist/deploy_lane_fit.json",
    "    derived_from: [intent.brief, intent.palettes, intent.targets, intent.constraints]",
    "",
    "actors:",
    actorLines || "  visitor:\n    display_name: Visitor",
    "",
    "scenes:",
    sceneLines || "  home:\n    title: Home\n    entry: true\n    actors: [visitor]",
    "",
    "flows:",
    flowLines || "  - id: primary\n    scenes: [home]",
    "",
    "outputs:",
    "  wants:",
    "    - id: ship_a_slice",
    `      goal: ${yamlStr("Ship a working slice with deterministic intake.")}`,
    "",
  ].join("\n") + "\n";
}

function yamlStr(s: string): string {
  const clean = String(s).replace(/\r/g, "");
  if (clean === "" || /[:\n#]/.test(clean)) return JSON.stringify(clean);
  return clean;
}

function safeKey(s: string): string {
  return String(s).trim().replace(/[^a-zA-Z0-9_\-]/g, "_");
}

// (paletteLabel removed; palettes are emitted as IDs for round-trip compilation)