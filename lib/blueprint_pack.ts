"use client";

import type { IAItem, ProjectState } from "./types";

import { stableJsonText } from "./stable_json";
import { sha256Hex } from "./hash";
import { ZIP_MTIME_UTC, APP_VERSION } from "./version";
import { labelForSection } from "./section_library";
import { compileTokensForExport } from "./token_theme";
import { buildSpecPack } from "./export_pack";
import { normalizeLibraryIds } from "./libraries_spel";
import { normalizePatternIds } from "./patterns_spel";
import { normalizeKitIds } from "./kits_spel";

export type BlueprintSectionV1 = {
  id: string;
  label: string;
};

export type BlueprintPageVariantV1 = {
  variant_id: string;
  sections: BlueprintSectionV1[];
};

export type BlueprintPageV1 = {
  id: string;
  title: string;
  parent_id: string | null;
  route_path: string;
  scene_id: string | null;
  variants: BlueprintPageVariantV1[];
};

export type BlueprintPackV1 = {
  schema: "kindred.blueprint_pack.v1";
  version: "v1";
  created_at_utc: string;
  project: {
    project_id: string;
    name: string;
  };
  provenance: {
    app_version: string;
    spec_pack_sha256: string;
  };
  inputs: {
    primary_surface: string | null;
    palettes: string[];
    libraries: string[];
    patterns: string[];
    kits: string[];
  };
  ia: {
    pages: IAItem[];
  };
  lofi: {
    active_variant_id: string;
    variant_ids: string[];
  };
  design: {
    tokens_compiled: any;
  };
  content: {
    copy_blocks: any[];
  };
  pages: BlueprintPageV1[];
  notes: string[];
};

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

function normalizeRoutePath(maybePath: any, pageId: string): string {
  const raw = typeof maybePath === "string" ? maybePath.trim() : "";
  if (!raw) return defaultRoutePathForId(pageId);
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return path.replace(/\s+/g, "");
}

function sectionsForVariantPage(variant: any, pageId: string): string[] {
  const pages = variant && typeof variant.pages === "object" && variant.pages ? variant.pages : {};
  const node = pages[pageId];
  const raw = node && Array.isArray(node.sections) ? node.sections : null;
  if (raw && raw.length) return raw.map((x: any) => String(x || "").trim()).filter((x: string) => x.length > 0);
  // Deterministic default.
  return ["top_nav", "content", "footer"];
}

export function buildBlueprintPackV1(args: { state: ProjectState; spec_pack_sha256: string }): BlueprintPackV1 {
  const state = args.state;
  const specSha = String(args.spec_pack_sha256 || "").trim();

  const adoptedLibraries = normalizeLibraryIds((state as any)?.director?.libraries_v1?.adopted_library_ids || []);
  const adoptedPatterns = normalizePatternIds((state as any)?.director?.patterns_v1?.adopted_pattern_ids || []);
  const adoptedKits = normalizeKitIds((state as any)?.director?.kits_v1?.adopted_kit_ids || []);

  const palettes = Array.isArray(state.intent?.palettes) ? state.intent.palettes.slice() : [];
  const primarySurface = state.intent?.primary_surface ? String(state.intent.primary_surface) : null;

  const iaPages = Array.isArray(state.design?.ia?.pages) ? (state.design.ia.pages as IAItem[]) : [];
  const variants = Array.isArray((state as any)?.design?.lofi?.variants) ? (state as any).design.lofi.variants : [];
  const activeVariantId = String((state as any)?.design?.lofi?.active_variant_id || "balanced");

  const variantIds = variants
    .map((v: any) => String(v?.id || "").trim())
    .filter((x: string) => x.length > 0);

  const pages: BlueprintPageV1[] = iaPages.map((p) => {
    const pageId = String(p.id || "");
    const title = String(p.title || p.id || "Page");
    const route_path = normalizeRoutePath((p as any).route_path, pageId);
    const parent_id = typeof (p as any).parent_id === "string" && (p as any).parent_id.trim() ? String((p as any).parent_id) : null;
    const scene_id = typeof (p as any).scene_id === "string" && (p as any).scene_id.trim() ? String((p as any).scene_id) : null;

    const vs: BlueprintPageVariantV1[] = variantIds.map((vid) => {
      const v = variants.find((x: any) => String(x?.id || "").trim() === vid) || null;
      const sectionIds = v ? sectionsForVariantPage(v, pageId) : ["top_nav", "content", "footer"];
      const sections: BlueprintSectionV1[] = sectionIds.map((sid) => ({ id: sid, label: labelForSection(sid) }));
      return { variant_id: vid, sections };
    });

    return { id: pageId, title, parent_id, route_path, scene_id, variants: vs };
  });

  const tokensCompiled = compileTokensForExport(state.design?.tokens || {});
  const copyBlocks = Array.isArray((state as any)?.content?.copy_blocks) ? (state as any).content.copy_blocks : [];

  const pack: BlueprintPackV1 = {
    schema: "kindred.blueprint_pack.v1",
    version: "v1",
    created_at_utc: ZIP_MTIME_UTC,
    project: {
      project_id: String(state.project?.id || ""),
      name: String(state.project?.name || ""),
    },
    provenance: {
      app_version: APP_VERSION,
      spec_pack_sha256: specSha,
    },
    inputs: {
      primary_surface: primarySurface,
      palettes,
      libraries: adoptedLibraries,
      patterns: adoptedPatterns,
      kits: adoptedKits,
    },
    ia: { pages: iaPages },
    lofi: {
      active_variant_id: activeVariantId,
      variant_ids: variantIds.length ? variantIds : [activeVariantId],
    },
    design: { tokens_compiled: tokensCompiled },
    content: { copy_blocks: copyBlocks },
    pages,
    notes: [
      "UI Blueprint is a compiled, deterministic artefact.",
      "It is derived from Spec Pack state (IA + low-fi layouts + tokens + adopted Libraries/Patterns/Kits).",
      "Provider specifics must live only via Kits; the blueprint format stays kernel-neutral.",
    ],
  };

  return pack;
}

export function blueprintPackJsonText(pack: BlueprintPackV1): string {
  return stableJsonText(pack, 2);
}

export async function compileBlueprintPackFromState(args: {
  state: ProjectState;
}): Promise<
  | {
      ok: true;
      pack: BlueprintPackV1;
      jsonText: string;
      blueprint_pack_sha256: string;
      spec_pack_sha256: string;
    }
  | {
      ok: false;
      error: { message: string; details: string[] };
    }
> {
  try {
    const specZip = buildSpecPack(args.state);
    const specSha = await sha256Hex(specZip);
    const pack = buildBlueprintPackV1({ state: args.state, spec_pack_sha256: specSha });
    const jsonText = blueprintPackJsonText(pack);
    const bpSha = await sha256Hex(jsonText);
    return { ok: true, pack, jsonText, blueprint_pack_sha256: bpSha, spec_pack_sha256: specSha };
  } catch (e: any) {
    return {
      ok: false,
      error: {
        message: "Blueprint compile failed",
        details: [String(e?.message || e)],
      },
    };
  }
}

export async function compileBlueprintPackFromStateWithSpecSha(args: {
  state: ProjectState;
  spec_pack_sha256: string;
}): Promise<
  | {
      ok: true;
      pack: BlueprintPackV1;
      jsonText: string;
      blueprint_pack_sha256: string;
      spec_pack_sha256: string;
    }
  | {
      ok: false;
      error: { message: string; details: string[] };
    }
> {
  try {
    const specSha = String(args.spec_pack_sha256 || "").trim();
    const pack = buildBlueprintPackV1({ state: args.state, spec_pack_sha256: specSha });
    const jsonText = blueprintPackJsonText(pack);
    const bpSha = await sha256Hex(jsonText);
    return { ok: true, pack, jsonText, blueprint_pack_sha256: bpSha, spec_pack_sha256: specSha };
  } catch (e: any) {
    return {
      ok: false,
      error: {
        message: "Blueprint compile failed",
        details: [String(e?.message || e)],
      },
    };
  }
}
