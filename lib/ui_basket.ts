"use client";

import type { DirectorUiBasketV1, ProjectState } from "./types";
import { SECTION_LIBRARY, labelForSection, type SectionId } from "./section_library";

export function ensureUiBasket(state: ProjectState): DirectorUiBasketV1 {
  const cur: any = (state as any)?.director?.ui_basket_v1;
  if (cur && cur.schema === "kindred.director_ui_basket.v1" && Array.isArray(cur.section_ids)) {
    return cur as DirectorUiBasketV1;
  }
  return {
    schema: "kindred.director_ui_basket.v1",
    section_ids: [],
  };
}

export function addToUiBasket(basket: DirectorUiBasketV1, sectionId: SectionId): DirectorUiBasketV1 {
  const next = new Set((basket.section_ids || []) as string[]);
  next.add(sectionId);
  return { ...basket, section_ids: Array.from(next.values()).sort() };
}

export function removeFromUiBasket(basket: DirectorUiBasketV1, sectionId: SectionId): DirectorUiBasketV1 {
  const next = new Set((basket.section_ids || []) as string[]);
  next.delete(sectionId);
  return { ...basket, section_ids: Array.from(next.values()).sort() };
}

function pick(ids: string[], want: string[]) {
  const set = new Set(ids);
  return want.filter((x) => set.has(x));
}

/**
 * Deterministic, no-LLM placement plan.
 * This is intentionally simple: it creates a small storyboard-like sequence from basket sections.
 */
export function planFromBasket(sectionIds: string[]) {
  const ids = Array.isArray(sectionIds) ? sectionIds : [];
  const screens: { id: string; title: string; section_ids: string[] }[] = [];

  // Screen 1: Landing / Entry
  const landingCore = pick(ids, [
    "top_nav",
    "hero",
    "value_props",
    "social_proof",
    "features",
    "how_it_works",
    "cta",
    "footer",
  ]);
  if (landingCore.length) screens.push({ id: "landing", title: "Landing", section_ids: landingCore });

  // Screen 2: Browse / Search
  const browse = pick(ids, ["sidebar_nav", "filters", "results_list", "gallery", "details", "secondary_cta", "footer"]);
  if (browse.length) screens.push({ id: "browse", title: "Browse", section_ids: browse });

  // Screen 3: Create / Compose
  const create = pick(ids, ["composer", "steps", "summary", "payment", "cta", "footer"]);
  if (create.length) screens.push({ id: "compose", title: "Compose", section_ids: create });

  // Screen 4: Docs / Knowledge
  const docs = pick(ids, ["docs_content", "content", "faq", "footer"]);
  if (docs.length) screens.push({ id: "docs", title: "Docs / Content", section_ids: docs });

  // If nothing matched, put everything on one screen in library order.
  if (screens.length === 0) {
    const order = SECTION_LIBRARY.map((x) => x.id);
    const flat = order.filter((x) => ids.includes(x));
    screens.push({ id: "single", title: "Single Screen", section_ids: flat.length ? flat : ids.slice(0, 12) });
  }

  return {
    generated_at_utc: new Date().toISOString(),
    screens,
  };
}

export function labelForBasketItem(id: string): string {
  return labelForSection(id);
}
