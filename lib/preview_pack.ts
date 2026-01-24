"use client";

import type { ProjectState } from "./types";
import { APP_VERSION } from "./version";
import { stableJsonText } from "./stable_json";
import { strFromU8 } from "fflate";
import type { SpecPack } from "./spec_pack";
import { getManifest, tryParseJson } from "./spec_pack";
import { sha256Hex } from "./hash";

export type PreviewPackV1 = {
  schema: "kindred.preview_pack.v1";
  app_version: string;
  created_at_utc: string;

  project: {
    id: string;
    name: string;
  };

  inputs: {
    intent_pack_sha256?: string;
    spel_seed_sha256?: string;
  };

  direction: {
    build_intent?: string;
    primary_surface?: string;
    palettes: string[];
    constraints: {
      offline_first: boolean;
      no_payments: boolean;
      required_env_names: string[];
    };
    brief: {
      audience_description: string;
      problem: string;
      offer: string;
      differentiators: string[];
      success_metrics: string[];
      non_goals: string[];
    };
  };

  storyboard: {
    actors: { id: string; display_name: string }[];
    scenes: { id: string; title: string; entry?: boolean }[];
    flows: { id: string; scenes: { id: string; title: string }[] }[];
  };

  sitemap: {
    pages: { id: string; title: string; route_path?: string; scene_id?: string }[];
  };

  look_and_feel: {
    brand: {
      name: string;
      tagline: string;
      audience: string;
      tone: string;
    };
    tokens: Record<string, string>;
    lofi_variant: {
      active_variant_id: string;
      home_sections: string[];
    };
  };

  notes: string[];
};

function sortById<T extends { id: string }>(items: T[]): T[] {
  const copy = Array.isArray(items) ? [...items] : [];
  copy.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return copy;
}

export function buildPreviewPack(state: ProjectState): PreviewPackV1 {
  const st: any = state as any;

  const actors = sortById((st.kernel_min?.actors || []).map((a: any) => ({ id: String(a.id || ""), display_name: String(a.display_name || "") })));
  const scenes = sortById((st.kernel_min?.scenes || []).map((s: any) => ({ id: String(s.id || ""), title: String(s.title || ""), entry: Boolean(s.entry) })));
  const flows = sortById((st.kernel_min?.flows || []).map((f: any) => ({ id: String(f.id || ""), scenes: (Array.isArray(f.scenes) ? f.scenes : []).map((x: any) => String(x || "")) })));

  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const flowsResolved = flows.map((f) => ({
    id: f.id,
    scenes: f.scenes
      .map((sid) => {
        const s = sceneById.get(sid);
        return s ? { id: s.id, title: s.title } : { id: sid, title: "(missing scene)" };
      }),
  }));

  const pages = (st.design?.ia?.pages || []).map((p: any) => ({
    id: String(p.id || ""),
    title: String(p.title || ""),
    route_path: typeof p.route_path === "string" ? p.route_path : undefined,
    scene_id: typeof p.scene_id === "string" ? p.scene_id : undefined,
  }));

  pages.sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));

  const activeVariantId = String(st.design?.lofi?.active_variant_id || "");
  const variants = Array.isArray(st.design?.lofi?.variants) ? st.design.lofi.variants : [];
  const activeVariant = variants.find((v: any) => String(v.id || "") === activeVariantId) || null;
  const homeSections = Array.isArray(activeVariant?.pages?.home?.sections) ? activeVariant.pages.home.sections.map((x: any) => String(x || "")) : [];

  const intentPackSha = typeof st?.director?.last_intent_pack_sha256 === "string" ? String(st.director.last_intent_pack_sha256) : undefined;
  const spelSeedSha = typeof st?.director?.last_spel_seed_sha256 === "string" ? String(st.director.last_spel_seed_sha256) : undefined;

  const tokensObj: Record<string, string> = {};
  const tokens = st.design?.tokens || {};
  for (const k of Object.keys(tokens).sort()) {
    tokensObj[k] = String(tokens[k]);
  }

  const pack: PreviewPackV1 = {
    schema: "kindred.preview_pack.v1",
    app_version: APP_VERSION,
    created_at_utc: new Date().toISOString(),
    project: { id: String(st.project?.id || ""), name: String(st.project?.name || "") },
    inputs: { intent_pack_sha256: intentPackSha, spel_seed_sha256: spelSeedSha },
    direction: {
      build_intent: typeof st.intent?.build_intent === "string" ? st.intent.build_intent : undefined,
      primary_surface: typeof st.intent?.primary_surface === "string" ? st.intent.primary_surface : undefined,
      palettes: Array.isArray(st.intent?.palettes) ? [...st.intent.palettes].map((x: any) => String(x || "")).sort() : [],
      constraints: {
        offline_first: Boolean(st.intent?.constraints?.offline_first),
        no_payments: Boolean(st.intent?.constraints?.no_payments),
        required_env_names: Array.isArray(st.intent?.constraints?.required_env_names)
          ? st.intent.constraints.required_env_names.map((x: any) => String(x || "")).sort()
          : [],
      },
      brief: {
        audience_description: String(st.intent?.brief?.audience_description || ""),
        problem: String(st.intent?.brief?.problem || ""),
        offer: String(st.intent?.brief?.offer || ""),
        differentiators: Array.isArray(st.intent?.brief?.differentiators) ? st.intent.brief.differentiators.map((x: any) => String(x || "")).filter(Boolean) : [],
        success_metrics: Array.isArray(st.intent?.brief?.success_metrics) ? st.intent.brief.success_metrics.map((x: any) => String(x || "")).filter(Boolean) : [],
        non_goals: Array.isArray(st.intent?.brief?.non_goals) ? st.intent.brief.non_goals.map((x: any) => String(x || "")).filter(Boolean) : [],
      },
    },
    storyboard: {
      actors,
      scenes,
      flows: flowsResolved,
    },
    sitemap: {
      pages,
    },
    look_and_feel: {
      brand: {
        name: String(st.design?.brand?.name || ""),
        tagline: String(st.design?.brand?.tagline || ""),
        audience: String(st.design?.brand?.audience || ""),
        tone: String(st.design?.brand?.tone || ""),
      },
      tokens: tokensObj,
      lofi_variant: {
        active_variant_id: activeVariantId,
        home_sections: homeSections,
      },
    },
    notes: Array.isArray(st.notes) ? st.notes.map((x: any) => String(x || "")).filter(Boolean) : [],
  };

  return pack;
}

export function previewPackJson(state: ProjectState): string {
  return stableJsonText(buildPreviewPack(state), 2);
}

export function previewPackSha256(state: ProjectState): string {
  return sha256Hex(previewPackJson(state));
}

export function previewHtml(state: ProjectState): string {
  const pack = buildPreviewPack(state);
  const esc = (s: string) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const lines: string[] = [];
  lines.push("<!doctype html>");
  lines.push("<html><head><meta charset=\"utf-8\">");
  lines.push("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
  lines.push(`<title>${esc(pack.project.name)} — Preview</title>`);
  lines.push("<style>");
  lines.push("body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;max-width:960px;margin:0 auto;padding:16px;line-height:1.4}");
  lines.push("h1,h2{margin:0.6em 0}");
  lines.push(".card{border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin:12px 0}");
  lines.push(".muted{color:#6b7280}");
  lines.push("code,pre{background:#f3f4f6;padding:2px 6px;border-radius:6px}");
  lines.push("pre{overflow:auto;padding:12px}");
  lines.push("</style></head><body>");
  lines.push(`<h1>${esc(pack.project.name)}</h1>`);
  lines.push(`<p class="muted">Preview pack: <code>${esc(previewPackSha256(state).slice(0,12))}</code> • ${esc(pack.created_at_utc)}</p>`);

  lines.push('<div class="card"><h2>Direction</h2>');
  lines.push(`<p><strong>Offer:</strong> ${esc(pack.direction.brief.offer || "(unspecified)")}</p>`);
  lines.push(`<p><strong>Problem:</strong> ${esc(pack.direction.brief.problem || "(unspecified)")}</p>`);
  lines.push(`<p><strong>Audience:</strong> ${esc(pack.direction.brief.audience_description || "(unspecified)")}</p>`);
  lines.push(`<p><strong>Palettes:</strong> ${esc(pack.direction.palettes.join(", ") || "(none)")}</p>`);
  lines.push("</div>");

  lines.push('<div class="card"><h2>Sitemap</h2><ul>');
  for (const p of pack.sitemap.pages) {
    const rp = p.route_path ? ` (${p.route_path})` : "";
    lines.push(`<li><strong>${esc(p.title || p.id)}</strong>${esc(rp)} <span class="muted">${esc(p.id)}</span></li>`);
  }
  lines.push("</ul></div>");

  lines.push('<div class="card"><h2>Storyboard</h2>');
  for (const f of pack.storyboard.flows) {
    lines.push(`<h3>${esc(f.id)}</h3><ol>`);
    for (const s of f.scenes) lines.push(`<li>${esc(s.title)} <span class="muted">${esc(s.id)}</span></li>`);
    lines.push("</ol>");
  }
  lines.push("</div>");

  lines.push('<div class="card"><h2>Look & Feel</h2>');
  lines.push(`<p><strong>Brand:</strong> ${esc(pack.look_and_feel.brand.name)} — ${esc(pack.look_and_feel.brand.tagline)}</p>`);
  lines.push(`<p><strong>Home sections:</strong> ${esc(pack.look_and_feel.lofi_variant.home_sections.join(", ") || "(none)")}</p>`);
  lines.push("</div>");

  lines.push("</body></html>");
  return lines.join("\n");
}

export function previewHtmlSha256(state: ProjectState): string {
  return sha256Hex(previewHtml(state));
}


export type PreviewSummaryV1 = {
  schema: "kindred.preview_summary.v1";
  project_name: string;
  offer: string;
  problem: string;
  audience: string;
  palettes: string[];
  page_count: number;
  pages: { id: string; title: string; route_path?: string }[];
  scene_count: number;
  flow_count: number;
  home_sections: string[];
};

export type PreviewSummaryDiffV1 = {
  schema: "kindred.preview_summary_diff.v1";
  changed: {
    offer: boolean;
    problem: boolean;
    audience: boolean;
    palettes: boolean;
    pages: boolean;
    storyboard: boolean;
    home_sections: boolean;
  };
  deltas: {
    page_count: { from: number; to: number };
    scene_count: { from: number; to: number };
    flow_count: { from: number; to: number };
  };
  notes: string[];
};

export function previewSummary(pack: PreviewPackV1): PreviewSummaryV1 {
  const pages = (pack.sitemap.pages || [])
    .map((p) => ({ id: String(p.id || ""), title: String(p.title || ""), route_path: (p as any).route_path ? String((p as any).route_path) : undefined }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    schema: "kindred.preview_summary.v1",
    project_name: String(pack.project.name || ""),
    offer: String(pack.direction.brief.offer || ""),
    problem: String(pack.direction.brief.problem || ""),
    audience: String(pack.direction.brief.audience_description || ""),
    palettes: Array.isArray(pack.direction.palettes) ? [...pack.direction.palettes].map(String).sort() : [],
    page_count: pages.length,
    pages,
    scene_count: Array.isArray(pack.storyboard.scenes) ? pack.storyboard.scenes.length : 0,
    flow_count: Array.isArray(pack.storyboard.flows) ? pack.storyboard.flows.length : 0,
    home_sections: Array.isArray(pack.look_and_feel.lofi_variant.home_sections)
      ? [...pack.look_and_feel.lofi_variant.home_sections].map(String)
      : [],
  };
}

function sameArray(a: string[], b: string[]): boolean {
  if (a.length != b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function diffPreviewSummaries(from: PreviewSummaryV1, to: PreviewSummaryV1): PreviewSummaryDiffV1 {
  const notes: string[] = [];

  const palettesChanged = !sameArray(from.palettes, to.palettes);
  const pagesChanged = JSON.stringify(from.pages) !== JSON.stringify(to.pages);
  const storyboardChanged = from.scene_count !== to.scene_count || from.flow_count !== to.flow_count;

  if (palettesChanged) notes.push("Palettes changed.");
  if (pagesChanged) notes.push("Sitemap changed.");
  if (storyboardChanged) notes.push("Storyboard changed.");

  return {
    schema: "kindred.preview_summary_diff.v1",
    changed: {
      offer: from.offer !== to.offer,
      problem: from.problem !== to.problem,
      audience: from.audience !== to.audience,
      palettes: palettesChanged,
      pages: pagesChanged,
      storyboard: storyboardChanged,
      home_sections: !sameArray(from.home_sections, to.home_sections),
    },
    deltas: {
      page_count: { from: from.page_count, to: to.page_count },
      scene_count: { from: from.scene_count, to: to.scene_count },
      flow_count: { from: from.flow_count, to: to.flow_count },
    },
    notes,
  };
}


function readJsonFromSpecPack<T = any>(pack: SpecPack, path: string, fallback: T): T {
  const f = pack.fileMap.get(path);
  if (!f) return fallback;
  const text = strFromU8(f.bytes);
  const parsed = tryParseJson<T>(text);
  return parsed.ok ? parsed.value : fallback;
}

function readStringish(obj: any, key: string, fallback = ""): string {
  if (typeof obj === "string") return obj;
  if (!obj || typeof obj !== "object") return fallback;
  const v = (obj as any)[key];
  return typeof v === "string" ? v : fallback;
}

export function buildPreviewPackFromSpecPack(pack: SpecPack): PreviewPackV1 {
  const man = getManifest(pack);
  const projectMeta = readJsonFromSpecPack<any>(pack, "project/meta.json", {});
  const projectId = man.ok ? String(man.manifest.project_id || "") : readStringish(projectMeta, "id", "");
  const projectName = readStringish(projectMeta, "name", "");

  const buildIntentRaw = readJsonFromSpecPack<any>(pack, "intent/build_intent.json", "");
  const buildIntent = readStringish(buildIntentRaw, "build_intent", typeof buildIntentRaw === "string" ? buildIntentRaw : "");

  const primarySurfaceRaw = readJsonFromSpecPack<any>(pack, "intent/targets.json", {});
  const primarySurface = readStringish(primarySurfaceRaw, "primary_surface", "");

  const palettesRaw = readJsonFromSpecPack<any>(pack, "intent/palettes.json", []);
  const palettes = Array.isArray(palettesRaw) ? palettesRaw.map((x) => String(x || "")).filter(Boolean).sort() : [];

  const constraintsRaw = readJsonFromSpecPack<any>(pack, "intent/constraints.json", {});
  const offlineFirst = Boolean((constraintsRaw as any)?.offline_first);
  const noPayments = Boolean((constraintsRaw as any)?.no_payments);
  const requiredEnv = Array.isArray((constraintsRaw as any)?.required_env_names)
    ? (constraintsRaw as any).required_env_names.map((x: any) => String(x || "")).filter(Boolean).sort()
    : [];

  const briefRaw = readJsonFromSpecPack<any>(pack, "intent/brief.json", {});
  const audience = readStringish(briefRaw, "audience_description", "");
  const problem = readStringish(briefRaw, "problem", "");
  const offer = readStringish(briefRaw, "offer", "");
  const diffs = Array.isArray((briefRaw as any)?.differentiators) ? (briefRaw as any).differentiators.map((x: any) => String(x || "")).filter(Boolean) : [];
  const metrics = Array.isArray((briefRaw as any)?.success_metrics) ? (briefRaw as any).success_metrics.map((x: any) => String(x || "")).filter(Boolean) : [];
  const nonGoals = Array.isArray((briefRaw as any)?.non_goals) ? (briefRaw as any).non_goals.map((x: any) => String(x || "")).filter(Boolean) : [];

  const actorsRaw = readJsonFromSpecPack<any[]>(pack, "kernel_min/actors.json", readJsonFromSpecPack<any[]>(pack, "ux/actors.json", []));

  const actors = actorsRaw
    .map((a: any) => ({ id: String(a?.id || ""), display_name: String(a?.display_name || "") }))
    .filter((a) => a.id);
  actors.sort((a, b) => a.id.localeCompare(b.id));

  const scenesRaw = readJsonFromSpecPack<any[]>(pack, "kernel_min/scenes.json", readJsonFromSpecPack<any[]>(pack, "ux/scenes.json", []));

  const scenes = scenesRaw
    .map((s: any) => ({ id: String(s?.id || ""), title: String(s?.title || ""), entry: Boolean(s?.entry) }))
    .filter((s) => s.id);
  scenes.sort((a, b) => a.id.localeCompare(b.id));

  const flowsRaw = readJsonFromSpecPack<any[]>(pack, "kernel_min/flows.json", readJsonFromSpecPack<any[]>(pack, "ux/flows.json", []))
    .map((f: any) => ({ id: String(f?.id || ""), scenes: Array.isArray(f?.scenes) ? f.scenes.map((x: any) => String(x || "")).filter(Boolean) : [] }))
    .filter((f) => f.id);
  flowsRaw.sort((a, b) => a.id.localeCompare(b.id));

  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const flows = flowsRaw.map((f) => ({
    id: f.id,
    scenes: f.scenes.map((sid) => {
      const s = sceneById.get(sid);
      return s ? { id: s.id, title: s.title } : { id: sid, title: "(missing scene)" };
    }),
  }));

  const iaRaw = readJsonFromSpecPack<any>(pack, "design/ia_tree.json", {});
  const pagesArr = Array.isArray((iaRaw as any)?.pages) ? (iaRaw as any).pages : [];
  const pages = pagesArr
    .map((p: any) => ({
      id: String(p?.id || ""),
      title: String(p?.title || ""),
      route_path: typeof p?.route_path === "string" ? p.route_path : undefined,
      scene_id: typeof p?.scene_id === "string" ? p.scene_id : undefined,
    }))
    .filter((p: any) => p.id);
  pages.sort((a: any, b: any) => a.id.localeCompare(b.id));

  const profileRaw = readJsonFromSpecPack<any>(pack, "design/profile.json", {});
  const brand = (profileRaw as any)?.brand || profileRaw || {};
  const brandName = readStringish(brand, "name", "");
  const brandTagline = readStringish(brand, "tagline", "");
  const brandAudience = readStringish(brand, "audience", "");
  const brandTone = readStringish(brand, "tone", "");

  const tokensRaw = readJsonFromSpecPack<any>(pack, "design/tokens.json", {});
  const tokensObj: Record<string, string> = {};
  if (tokensRaw && typeof tokensRaw === "object" && !Array.isArray(tokensRaw)) {
    for (const k of Object.keys(tokensRaw).sort()) tokensObj[k] = String((tokensRaw as any)[k]);
  }

  const lofiRaw = readJsonFromSpecPack<any>(pack, "design/lofi_layouts.json", {});
  const activeVariantId = readStringish(lofiRaw, "active_variant_id", "");
  const variants = Array.isArray((lofiRaw as any)?.variants) ? (lofiRaw as any).variants : [];
  const activeVariant = variants.find((v: any) => String(v?.id || "") === activeVariantId) || null;
  const homeSections = Array.isArray(activeVariant?.pages?.home?.sections) ? activeVariant.pages.home.sections.map((x: any) => String(x || "")).filter(Boolean) : [];

  const packOut: PreviewPackV1 = {
    schema: "kindred.preview_pack.v1",
    app_version: APP_VERSION,
    created_at_utc: new Date().toISOString(),
    project: { id: projectId || "(unknown)", name: projectName || "(unknown project)" },
    inputs: {},
    direction: {
      build_intent: buildIntent || undefined,
      primary_surface: primarySurface || undefined,
      palettes,
      constraints: {
        offline_first: offlineFirst,
        no_payments: noPayments,
        required_env_names: requiredEnv,
      },
      brief: {
        audience_description: audience,
        problem,
        offer,
        differentiators: diffs,
        success_metrics: metrics,
        non_goals: nonGoals,
      },
    },
    storyboard: { actors, scenes, flows },
    sitemap: { pages },
    look_and_feel: {
      brand: { name: brandName, tagline: brandTagline, audience: brandAudience, tone: brandTone },
      tokens: tokensObj,
      lofi_variant: { active_variant_id: activeVariantId, home_sections: homeSections },
    },
    notes: [],
  };

  return packOut;
}
