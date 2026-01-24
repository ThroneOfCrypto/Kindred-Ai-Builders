export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { readJsonWithLimit, requireString } from "../../../../lib/server/api_guard";
import { getAiMode, chatCompletions } from "../../../../lib/server/ai_client";
import { proposalOnlySystemGuard } from "../../../../lib/server/ai_posture";
import { decodeBase64ToBytes, encodeBytesToBase64, readZipBytes, writeZipBytes, readJson, writeJson } from "../../../../lib/server/zip_utils";
import { compileTokensForExport } from "../../../../lib/token_theme";
import type { CopyBlock, LofiLayoutVariant, ProjectState } from "../../../../lib/types";

type TokenInput = ProjectState["design"]["tokens"];

type AiKind = "tokens" | "lofi_layouts" | "copy_blocks";

type LofiFile = {
  active_variant_id: string;
  variants: LofiLayoutVariant[];
};

type CopyFile = {
  schema: "kindred.content.copy_blocks.v1";
  blocks: CopyBlock[];
};

type AiMeta = {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

type IaPage = {
  id: string;
  title: string;
  route_path?: string;
};

const TOKEN_ENUMS: Record<keyof TokenInput, string[]> = {
  radius: ["sharp", "balanced", "round"],
  density: ["compact", "balanced", "airy"],
  contrast: ["balanced", "high"],
  motion: ["none", "subtle", "lively"],
  type_scale: ["small", "balanced", "large"],
  line_height: ["tight", "balanced", "relaxed"],
  focus: ["standard", "high"],
  elevation: ["flat", "balanced", "deep"],
  layout_width: ["narrow", "balanced", "wide"],
  voice: ["serious", "playful"],
  mode: ["light", "dark", "system"],
};

const SECTION_IDS = [
  "hero",
  "value_props",
  "social_proof",
  "features",
  "how_it_works",
  "pricing",
  "faq",
  "cta",
  "secondary_cta",
  "footer",
  "top_nav",
  "sidebar_nav",
  "summary_cards",
  "main_panel",
  "filters",
  "results_list",
  "gallery",
  "details",
  "steps",
  "summary",
  "payment",
  "composer",
  "feed_list",
  "docs_content",
  "content",
] as const;

const SECTION_SET = new Set<string>(SECTION_IDS as unknown as string[]);

function safeStr(x: any, maxLen = 180): string {
  const s = typeof x === "string" ? x : String(x || "");
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) : clean;
}

function uniq(arr: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function clampTokens(input: any, fallback: TokenInput): TokenInput {
  const out: any = { ...fallback };
  for (const k of Object.keys(TOKEN_ENUMS) as (keyof TokenInput)[]) {
    const v = input?.[k];
    const allowed = TOKEN_ENUMS[k];
    if (typeof v === "string" && allowed.includes(v)) out[k] = v;
  }
  return out as TokenInput;
}

function defaultTokenProposals(base: TokenInput): { summary: string; rationale?: string; tokens: TokenInput }[] {
  const calm: TokenInput = { ...base, density: "airy", motion: "subtle", elevation: "flat", voice: "serious" };
  const accessible: TokenInput = { ...base, contrast: "high", focus: "high", motion: "none" };
  const bold: TokenInput = { ...base, type_scale: "large", radius: "round", elevation: "deep", voice: "playful" };
  return [
    { summary: "Tokens: calm + minimal motion", rationale: "Airy spacing and subtle motion for a calm, readable baseline.", tokens: calm },
    { summary: "Tokens: accessibility-first (high contrast + focus)", rationale: "High contrast and strong focus visibility; no motion.", tokens: accessible },
    { summary: "Tokens: bold (large type + round + depth)", rationale: "Bigger type scale with playful radius and depth.", tokens: bold },
  ];
}

async function aiTokenProposals(
  mode: "hosted" | "local",
  base: TokenInput,
  goal: string
): Promise<{ proposals: { summary: string; rationale?: string; tokens: TokenInput }[]; meta: AiMeta }> {
  const system =
    "You output STRICT JSON only. You are proposing design token refinements. " +
    "You MUST choose only from allowed enums for each field. Do not add new fields. Do not include explanations.";
  const user = JSON.stringify(
    {
      task: "Propose 3 token packages for this project. Keep it safe and coherent.",
      goal: goal || "",
      allowed_enums: TOKEN_ENUMS,
      current_tokens: base,
      output_schema: {
        proposals: [{ summary: "string", rationale: "string", tokens: { ...TOKEN_ENUMS } }],
      },
    },
    null,
    2
  );

  const r = await chatCompletions({ mode, system, user, temperature: 0.2 });
  if (!r.ok) return { proposals: [], meta: {} };

  try {
    const parsed = JSON.parse(r.text);
    const arr = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
    const out: { summary: string; rationale?: string; tokens: TokenInput }[] = [];
    for (const p of arr.slice(0, 3)) {
      const summary = safeStr(p?.summary, 140) || "Token proposal";
      const rationale = safeStr(p?.rationale, 260) || undefined;
      const tokens = clampTokens(p?.tokens, base);
      out.push({ summary, rationale, tokens });
    }
    return { proposals: out, meta: { model: r.model, usage: r.usage } };
  } catch {
    return { proposals: [], meta: { model: r.model, usage: r.usage } };
  }
}

function readIaPages(files: Map<string, Uint8Array>): IaPage[] {
  const ia = readJson<any>(files, "design/ia_tree.json");
  const pagesRaw = Array.isArray(ia?.pages) ? ia.pages : [];
  const out: IaPage[] = [];
  for (const p of pagesRaw) {
    if (!p || typeof p !== "object") continue;
    const id = safeStr((p as any).id, 80);
    if (!id) continue;
    const title = safeStr((p as any).title || id, 120) || id;
    const route_path = typeof (p as any).route_path === "string" ? safeStr((p as any).route_path, 120) : undefined;
    out.push({ id, title, route_path });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function isHomePage(p: IaPage): boolean {
  if (p.route_path === "/") return true;
  return p.id === "home" || p.id === "landing";
}

function sectionPlanFor(style: "minimal" | "marketing" | "app", page: IaPage): string[] {
  const rp = (page.route_path || "").toLowerCase();

  if (style === "minimal") {
    if (isHomePage(page)) return ["top_nav", "hero", "value_props", "cta", "footer"];
    if (rp.includes("pricing")) return ["top_nav", "pricing", "faq", "cta", "footer"];
    if (rp.includes("docs") || rp.includes("help")) return ["top_nav", "docs_content", "footer"];
    if (rp.includes("gallery")) return ["top_nav", "gallery", "footer"];
    return ["top_nav", "content", "footer"];
  }

  if (style === "marketing") {
    if (isHomePage(page)) return ["top_nav", "hero", "value_props", "social_proof", "features", "how_it_works", "pricing", "faq", "cta", "footer"];
    if (rp.includes("pricing")) return ["top_nav", "pricing", "faq", "cta", "footer"];
    if (rp.includes("docs") || rp.includes("help")) return ["top_nav", "docs_content", "footer"];
    if (rp.includes("about")) return ["top_nav", "hero", "content", "cta", "footer"];
    if (rp.includes("contact")) return ["top_nav", "content", "cta", "footer"];
    return ["top_nav", "hero", "content", "cta", "footer"];
  }

  // app
  if (isHomePage(page)) return ["top_nav", "hero", "summary_cards", "cta", "footer"];
  if (rp.includes("search") || rp.includes("browse")) return ["top_nav", "filters", "results_list", "details", "footer"];
  if (rp.includes("gallery")) return ["top_nav", "filters", "gallery", "details", "footer"];
  if (rp.includes("checkout") || rp.includes("pay")) return ["top_nav", "steps", "summary", "payment", "footer"];
  if (rp.includes("settings") || rp.includes("profile") || rp.includes("account")) return ["top_nav", "sidebar_nav", "main_panel", "footer"];
  return ["top_nav", "sidebar_nav", "main_panel", "details", "footer"];
}

function clampSections(input: any): string[] {
  const raw = Array.isArray(input) ? input : [];
  const filtered: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (!s) continue;
    if (!SECTION_SET.has(s)) continue;
    filtered.push(s);
  }
  return uniq(filtered).slice(0, 14);
}

function normalizeVariants(input: any, pages: IaPage[], fallback: LofiFile): LofiLayoutVariant[] {
  const pageIds = pages.map((p) => p.id);
  const ids = new Set<string>();

  const rawArr = Array.isArray(input) ? input : [];
  const out: LofiLayoutVariant[] = [];

  for (const v of rawArr) {
    if (!v || typeof v !== "object") continue;
    const id = safeStr((v as any).id, 40);
    if (!id) continue;
    if (ids.has(id)) continue;
    ids.add(id);

    const label = safeStr((v as any).label, 80) || id;
    const pagesRaw = (v as any).pages && typeof (v as any).pages === "object" ? (v as any).pages : {};

    const pagesMap: Record<string, { sections: string[] }> = {};
    for (const pid of pageIds) {
      const entry = (pagesRaw as any)[pid];
      const sections = clampSections(entry?.sections);
      pagesMap[pid] = { sections: sections.length > 0 ? sections : sectionPlanFor("minimal", pages.find((p) => p.id === pid) || { id: pid, title: pid }) };
    }

    out.push({ id, label, pages: pagesMap });
    if (out.length >= 3) break;
  }

  if (out.length > 0) return out;

  // fallback to existing file variants (clamped)
  const fbArr = Array.isArray(fallback?.variants) ? fallback.variants : [];
  for (const fb of fbArr.slice(0, 3)) {
    const id = safeStr((fb as any).id, 40);
    if (!id) continue;
    if (ids.has(id)) continue;
    ids.add(id);
    const label = safeStr((fb as any).label, 80) || id;
    const pagesMap: Record<string, { sections: string[] }> = {};
    for (const pid of pageIds) {
      const entry = (fb as any).pages?.[pid];
      const sections = clampSections(entry?.sections);
      pagesMap[pid] = { sections: sections.length > 0 ? sections : sectionPlanFor("minimal", pages.find((p) => p.id === pid) || { id: pid, title: pid }) };
    }
    out.push({ id, label, pages: pagesMap });
  }

  return out;
}

function defaultLofiProposals(base: LofiFile, pages: IaPage[]): { summary: string; rationale?: string; file: LofiFile }[] {
  const pageIds = pages.length > 0 ? pages.map((p) => p.id) : Object.keys(base?.variants?.[0]?.pages || {});
  const pagesNorm: IaPage[] = pages.length > 0 ? pages : pageIds.map((id) => ({ id, title: id }));

  const minimal: LofiLayoutVariant = {
    id: "minimal",
    label: "Minimal",
    pages: Object.fromEntries(pagesNorm.map((p) => [p.id, { sections: sectionPlanFor("minimal", p) }])),
  };
  const marketing: LofiLayoutVariant = {
    id: "marketing",
    label: "Marketing",
    pages: Object.fromEntries(pagesNorm.map((p) => [p.id, { sections: sectionPlanFor("marketing", p) }])),
  };
  const app: LofiLayoutVariant = {
    id: "app",
    label: "App UI",
    pages: Object.fromEntries(pagesNorm.map((p) => [p.id, { sections: sectionPlanFor("app", p) }])),
  };

  const variants: LofiLayoutVariant[] = [minimal, marketing, app];

  return [
    {
      summary: "Low-fi layout: Minimal",
      rationale: "Short page scaffolds: nav → content → footer. Homepage keeps a simple hero and CTA.",
      file: { active_variant_id: "minimal", variants },
    },
    {
      summary: "Low-fi layout: Marketing",
      rationale: "Conversion-first homepage: hero, value props, proof, features, pricing, FAQ, CTA.",
      file: { active_variant_id: "marketing", variants },
    },
    {
      summary: "Low-fi layout: App UI",
      rationale: "Product-first layouts: filters, lists, panels. Good for SaaS dashboards and tools.",
      file: { active_variant_id: "app", variants },
    },
  ];
}

async function aiLofiProposals(
  mode: "hosted" | "local",
  base: LofiFile,
  pages: IaPage[],
  goal: string
): Promise<{ proposals: { summary: string; rationale?: string; file: LofiFile }[]; meta: AiMeta }> {
  const system =
    "You output STRICT JSON only. You are proposing low-fi layout variants for wireframes. " +
    "Use ONLY the allowed section IDs. Keep lists short (<= 14). Do not invent pages.";

  const pageList = pages.map((p) => ({ id: p.id, title: p.title, route_path: p.route_path || null }));

  const user = JSON.stringify(
    {
      task: "Propose 3 low-fi layout variants. Each variant must include sections for every page.",
      goal: goal || "",
      allowed_section_ids: SECTION_IDS,
      pages: pageList,
      current_active_variant_id: base.active_variant_id,
      current_variants_preview: (base.variants || []).slice(0, 1),
      output_schema: {
        proposals: [
          {
            summary: "string",
            rationale: "string",
            file: {
              active_variant_id: "string",
              variants: [
                {
                  id: "string",
                  label: "string",
                  pages: { "<page_id>": { sections: ["<section_id>"] } },
                },
              ],
            },
          },
        ],
      },
    },
    null,
    2
  );

  const r = await chatCompletions({ mode, system, user, temperature: 0.25 });
  if (!r.ok) return { proposals: [], meta: {} };

  try {
    const parsed = JSON.parse(r.text);
    const arr = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
    const out: { summary: string; rationale?: string; file: LofiFile }[] = [];

    for (const p of arr.slice(0, 3)) {
      const summary = safeStr(p?.summary, 140) || "Low-fi layout proposal";
      const rationale = safeStr(p?.rationale, 260) || undefined;
      const fileIn = p?.file;

      const active = safeStr(fileIn?.active_variant_id, 40) || "proposal";
      const variants = normalizeVariants(fileIn?.variants, pages, base);

      let activeFinal = active;
      if (variants.length > 0 && !variants.some((v) => v.id === activeFinal)) {
        activeFinal = variants[0].id;
      }

      out.push({ summary, rationale, file: { active_variant_id: activeFinal, variants } });
    }

    return { proposals: out, meta: { model: r.model, usage: r.usage } };
  } catch {
    return { proposals: [], meta: { model: r.model, usage: r.usage } };
  }
}

function idForCopy(page_id: string, slot: string): string {
  return `${page_id}:${slot}`;
}

function defaultCopyBlocks(pages: IaPage[], brand_name: string, brief: any): CopyBlock[] {
  const brand = safeStr(brand_name, 80);
  const offer = safeStr(brief?.offer, 220);
  const problem = safeStr(brief?.problem, 220);
  const keyActions = Array.isArray(brief?.key_actions) ? brief.key_actions.map((x: any) => safeStr(x, 60)).filter((x: string) => x.length > 0) : [];
  const cta = keyActions[0] || "Get started";

  const blocks: CopyBlock[] = [];

  for (const p of pages) {
    const page_id = safeStr(p.id, 80);
    if (!page_id) continue;

    if (page_id === "home" || page_id === "landing" || p.route_path === "/") {
      blocks.push({ id: idForCopy(page_id, "hero_headline"), page_id, slot: "hero_headline", text: brand ? `Welcome to ${brand}` : "Welcome" });
      blocks.push({ id: idForCopy(page_id, "hero_subhead"), page_id, slot: "hero_subhead", text: offer || problem || "Write a one-sentence offer for your homepage." });
      blocks.push({ id: idForCopy(page_id, "primary_cta"), page_id, slot: "primary_cta", text: cta });
    }

    blocks.push({ id: idForCopy(page_id, "page_headline"), page_id, slot: "page_headline", text: safeStr(p.title || page_id, 120) || page_id });
    blocks.push({ id: idForCopy(page_id, "page_intro"), page_id, slot: "page_intro", text: "" });
  }

  blocks.sort((a, b) => {
    if (a.page_id !== b.page_id) return a.page_id.localeCompare(b.page_id);
    return a.slot.localeCompare(b.slot);
  });

  return blocks;
}

function normalizeCopyBlocks(input: any, pages: IaPage[], fallback: CopyBlock[]): CopyBlock[] {
  const pageIdSet = new Set(pages.map((p) => p.id));
  const titleById = new Map(pages.map((p) => [p.id, p.title]));

  const existingArr = Array.isArray(input) ? input : Array.isArray(input?.blocks) ? input.blocks : [];
  const map = new Map<string, CopyBlock>();

  for (const raw of existingArr) {
    if (!raw || typeof raw !== "object") continue;
    const page_id = safeStr((raw as any).page_id, 80);
    const slot = safeStr((raw as any).slot, 60);
    const text = typeof (raw as any).text === "string" ? String((raw as any).text) : "";
    if (!page_id || !slot) continue;
    if (pageIdSet.size > 0 && !pageIdSet.has(page_id)) continue;

    const id = safeStr((raw as any).id, 120) || idForCopy(page_id, slot);
    map.set(id, { id, page_id, slot, text: safeStr(text, 320) });
  }

  // Ensure defaults exist.
  for (const d of fallback) {
    if (!map.has(d.id)) map.set(d.id, d);
  }

  // Ensure page headlines exist (even if AI removed them).
  for (const p of pages) {
    const headlineId = idForCopy(p.id, "page_headline");
    if (!map.has(headlineId)) {
      map.set(headlineId, { id: headlineId, page_id: p.id, slot: "page_headline", text: safeStr(titleById.get(p.id) || p.id, 120) || p.id });
    }
  }

  const out = Array.from(map.values());
  out.sort((a, b) => {
    if (a.page_id !== b.page_id) return a.page_id.localeCompare(b.page_id);
    return a.slot.localeCompare(b.slot);
  });
  return out;
}

function applyCopyTone(blocks: CopyBlock[], pages: IaPage[], brand: string, brief: any, tone: "professional" | "warm" | "bold"): CopyBlock[] {
  const offer = safeStr(brief?.offer, 220);
  const problem = safeStr(brief?.problem, 220);
  const keyActions = Array.isArray(brief?.key_actions) ? brief.key_actions.map((x: any) => safeStr(x, 60)).filter((x: string) => x.length > 0) : [];
  const primary = keyActions[0] || "Get started";

  const titleById = new Map(pages.map((p) => [p.id, p.title]));

  function heroHeadline(): string {
    if (tone === "professional") return brand ? `${brand}` : "Welcome";
    if (tone === "warm") return brand ? `Meet ${brand}` : "Welcome";
    return brand ? `${brand}: ship faster` : "Ship faster";
  }

  function heroSubhead(): string {
    if (offer) return offer;
    if (problem) return problem;
    if (tone === "professional") return "A clear offer in one sentence.";
    if (tone === "warm") return "A clear, human offer in one sentence.";
    return "A bold offer in one sentence.";
  }

  function primaryCta(): string {
    if (tone === "professional") return primary;
    if (tone === "warm") return primary || "Let\u2019s begin";
    return primary || "Start now";
  }

  const out = blocks.map((b) => ({ ...b }));

  for (const b of out) {
    if (b.slot === "hero_headline") b.text = heroHeadline();
    if (b.slot === "hero_subhead") b.text = heroSubhead();
    if (b.slot === "primary_cta") b.text = primaryCta();

    if (b.slot === "page_intro" && !safeStr(b.text, 10)) {
      const t = safeStr(titleById.get(b.page_id) || b.page_id, 60) || b.page_id;
      if (tone === "professional") b.text = `Overview: ${t}.`;
      if (tone === "warm") b.text = `Here\u2019s what you\u2019ll find on ${t}.`;
      if (tone === "bold") b.text = `Everything you need about ${t}.`;
    }
  }

  return out;
}

function defaultCopyProposals(baseBlocks: CopyBlock[], pages: IaPage[], brand: string, brief: any): { summary: string; rationale?: string; file: CopyFile }[] {
  const fallback = baseBlocks;

  const pro = applyCopyTone(fallback, pages, brand, brief, "professional");
  const warm = applyCopyTone(fallback, pages, brand, brief, "warm");
  const bold = applyCopyTone(fallback, pages, brand, brief, "bold");

  return [
    { summary: "Copy: professional", rationale: "Neutral, direct language; good default for most products.", file: { schema: "kindred.content.copy_blocks.v1", blocks: pro } },
    { summary: "Copy: warm", rationale: "Human tone with friendly phrasing.", file: { schema: "kindred.content.copy_blocks.v1", blocks: warm } },
    { summary: "Copy: bold", rationale: "Punchier headlines and more decisive intros.", file: { schema: "kindred.content.copy_blocks.v1", blocks: bold } },
  ];
}

async function aiCopyProposals(
  mode: "hosted" | "local",
  baseBlocks: CopyBlock[],
  pages: IaPage[],
  brand: string,
  brief: any,
  goal: string
): Promise<{ proposals: { summary: string; rationale?: string; file: CopyFile }[]; meta: AiMeta }> {
  const system =
    "You output STRICT JSON only. You are proposing short website copy blocks. " +
    "Keep IDs stable, keep content safe, and keep text short. No markdown.";

  const user = JSON.stringify(
    {
      task: "Propose 3 copy variants (professional, warm, bold) for the copy blocks. Keep IDs and slots stable.",
      goal: goal || "",
      brand_name: brand,
      brief: {
        audience_description: safeStr(brief?.audience_description, 220),
        problem: safeStr(brief?.problem, 220),
        offer: safeStr(brief?.offer, 220),
        key_actions: Array.isArray(brief?.key_actions) ? brief.key_actions.slice(0, 5).map((x: any) => safeStr(x, 60)) : [],
        differentiators: Array.isArray(brief?.differentiators) ? brief.differentiators.slice(0, 5).map((x: any) => safeStr(x, 80)) : [],
      },
      pages: pages.map((p) => ({ id: p.id, title: p.title, route_path: p.route_path || null })),
      current_blocks: baseBlocks.slice(0, 120),
      output_schema: {
        proposals: [
          {
            summary: "string",
            rationale: "string",
            blocks: [{ id: "string", page_id: "string", slot: "string", text: "string" }],
          },
        ],
      },
    },
    null,
    2
  );

  const r = await chatCompletions({ mode, system, user, temperature: 0.35 });
  if (!r.ok) return { proposals: [], meta: {} };

  try {
    const parsed = JSON.parse(r.text);
    const arr = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
    const out: { summary: string; rationale?: string; file: CopyFile }[] = [];

    for (const p of arr.slice(0, 3)) {
      const summary = safeStr(p?.summary, 140) || "Copy proposal";
      const rationale = safeStr(p?.rationale, 260) || undefined;
      const blocksNorm = normalizeCopyBlocks(p?.blocks, pages, baseBlocks);
      out.push({ summary, rationale, file: { schema: "kindred.content.copy_blocks.v1", blocks: blocksNorm } });
    }

    return { proposals: out, meta: { model: r.model, usage: r.usage } };
  } catch {
    return { proposals: [], meta: { model: r.model, usage: r.usage } };
  }
}

function ensureManifestContains(files: Map<string, Uint8Array>, path: string) {
  const m = readJson<any>(files, "spec_pack_manifest.json");
  if (!m || typeof m !== "object") return;
  if (!Array.isArray(m.contents)) return;
  if (m.contents.includes(path)) return;
  m.contents.push(path);
  writeJson(files, "spec_pack_manifest.json", m);
}

export async function POST(req: Request) {
  const parsed = await readJsonWithLimit<any>(req, { maxBytes: 2_000_000 });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, hint: parsed.hint }, { status: parsed.status });
  }
  let body: any = parsed.value;


  try {
    const baseB64Res = requireString(body?.base_pack_b64, "base_pack_b64", 3_000_000);
    if (!baseB64Res.ok) return NextResponse.json({ ok: false, error: baseB64Res.error, hint: baseB64Res.hint }, { status: baseB64Res.status });
    const baseB64 = baseB64Res.value;
    const goal = String(body?.goal || "");
    const kind = String(body?.kind || "tokens") as AiKind;

    if (kind !== "tokens" && kind !== "lofi_layouts" && kind !== "copy_blocks") {
      return NextResponse.json({ ok: false, error: "Unsupported kind. Use tokens | lofi_layouts | copy_blocks." }, { status: 400 });
    }

    const baseBytes = decodeBase64ToBytes(baseB64);
    if (!baseBytes || baseBytes.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing base_pack_b64" }, { status: 400 });
    }
    if (baseBytes.length > 5_000_000) {
      return NextResponse.json({ ok: false, error: "Base pack too large (max 5MB)." }, { status: 413 });
    }

    const files = readZipBytes(baseBytes);
    const mode = getAiMode();

    if (kind === "tokens") {
      const tokens = readJson<TokenInput>(files, "design/tokens.json");
      if (!tokens) {
        return NextResponse.json({ ok: false, error: "Base pack missing design/tokens.json" }, { status: 400 });
      }

      let proposals: { summary: string; rationale?: string; tokens: TokenInput }[] = [];
      let meta: AiMeta = {};
      if (mode === "hosted" || mode === "local") {
        const r = await aiTokenProposals(mode, tokens, goal);
        proposals = r.proposals;
        meta = r.meta;
      }
      if (proposals.length === 0) proposals = defaultTokenProposals(tokens);

      const out: any[] = [];
      for (let i = 0; i < proposals.length; i += 1) {
        const p = proposals[i];
        const f = new Map(files);
        writeJson(f, "design/tokens.json", p.tokens);
        writeJson(f, "design/tokens_compiled.json", compileTokensForExport(p.tokens));
        const proposalZip = writeZipBytes(f);
        out.push({
          id: `ai_tokens_${i + 1}`,
          summary: p.summary,
          rationale: p.rationale,
          proposal_pack_b64: encodeBytesToBase64(proposalZip),
        });
      }

      return NextResponse.json({ ok: true, mode, model: meta.model, usage: meta.usage, proposals: out });
    }

    if (kind === "lofi_layouts") {
      const lofi = readJson<LofiFile>(files, "design/lofi_layouts.json");
      if (!lofi) {
        return NextResponse.json({ ok: false, error: "Base pack missing design/lofi_layouts.json" }, { status: 400 });
      }

      const pages = readIaPages(files);

      let proposals: { summary: string; rationale?: string; file: LofiFile }[] = [];
      let meta: AiMeta = {};
      if (mode === "hosted" || mode === "local") {
        const r = await aiLofiProposals(mode, lofi, pages, goal);
        proposals = r.proposals;
        meta = r.meta;
      }
      if (proposals.length === 0) proposals = defaultLofiProposals(lofi, pages);

      const out: any[] = [];
      for (let i = 0; i < proposals.length; i += 1) {
        const p = proposals[i];
        const f = new Map(files);
        writeJson(f, "design/lofi_layouts.json", p.file);
        const proposalZip = writeZipBytes(f);
        out.push({
          id: `ai_lofi_${i + 1}`,
          summary: p.summary,
          rationale: p.rationale,
          proposal_pack_b64: encodeBytesToBase64(proposalZip),
        });
      }

      return NextResponse.json({ ok: true, mode, model: meta.model, usage: meta.usage, proposals: out });
    }

    // copy_blocks
    const pages = readIaPages(files);
    const brandProfile = readJson<any>(files, "design/profile.json") || {};
    const brand = safeStr(brandProfile?.name, 80);
    const brief = readJson<any>(files, "intent/brief.json") || {};

    const existingCopyFile = readJson<CopyFile>(files, "content/copy_blocks.json");
    const baseFallbackBlocks = defaultCopyBlocks(pages, brand, brief);
    const baseBlocks = normalizeCopyBlocks(existingCopyFile?.blocks, pages, baseFallbackBlocks);

    let proposals: { summary: string; rationale?: string; file: CopyFile }[] = [];
    let meta: AiMeta = {};
    if (mode === "hosted" || mode === "local") {
      const r = await aiCopyProposals(mode, baseBlocks, pages, brand, brief, goal);
      proposals = r.proposals;
      meta = r.meta;
    }
    if (proposals.length === 0) proposals = defaultCopyProposals(baseBlocks, pages, brand, brief);

    const out: any[] = [];
    for (let i = 0; i < proposals.length; i += 1) {
      const p = proposals[i];
      const f = new Map(files);
      ensureManifestContains(f, "content/copy_blocks.json");
      writeJson(f, "content/copy_blocks.json", p.file);
      const proposalZip = writeZipBytes(f);
      out.push({
        id: `ai_copy_${i + 1}`,
        summary: p.summary,
        rationale: p.rationale,
        proposal_pack_b64: encodeBytesToBase64(proposalZip),
      });
    }

    return NextResponse.json({ ok: true, mode, model: meta.model, usage: meta.usage, proposals: out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
