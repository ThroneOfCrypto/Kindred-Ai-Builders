"use client";

export type LibrarySelectionItem = { type: string; slug: string };

const KEY = "sdde.marketplace.selection.v1";
const EVENT = "sdde_marketplace_selection_changed";

function safeParse(json: string): any {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isValidItem(x: any): x is LibrarySelectionItem {
  return x && typeof x === "object" && typeof x.type === "string" && typeof x.slug === "string";
}

function normalize(items: any): LibrarySelectionItem[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: LibrarySelectionItem[] = [];

  for (const it of items) {
    if (!isValidItem(it)) continue;
    const type = it.type.trim();
    const slug = it.slug.trim();
    if (!type || !slug) continue;
    const key = `${type}/${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type, slug });
  }

  out.sort((a, b) => `${a.type}/${a.slug}`.localeCompare(`${b.type}/${b.slug}`));
  return out;
}

export function loadSelection(): LibrarySelectionItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return [];
  return normalize(safeParse(raw));
}

export function saveSelection(items: LibrarySelectionItem[]) {
  if (typeof window === "undefined") return;
  const norm = normalize(items);
  window.localStorage.setItem(KEY, JSON.stringify(norm));
  window.dispatchEvent(new Event(EVENT));
}

export function addToSelection(item: LibrarySelectionItem) {
  const cur = loadSelection();
  const key = `${item.type}/${item.slug}`;
  if (cur.some((x) => `${x.type}/${x.slug}` === key)) return;
  cur.push({ type: item.type, slug: item.slug });
  saveSelection(cur);
}

export function removeFromSelection(item: LibrarySelectionItem) {
  const key = `${item.type}/${item.slug}`;
  const cur = loadSelection().filter((x) => `${x.type}/${x.slug}` !== key);
  saveSelection(cur);
}

export function selectionIncludes(item: LibrarySelectionItem): boolean {
  const key = `${item.type}/${item.slug}`;
  return loadSelection().some((x) => `${x.type}/${x.slug}` === key);
}

export function clearSelection() {
  saveSelection([]);
}

export function selectionEventName() {
  return EVENT;
}
