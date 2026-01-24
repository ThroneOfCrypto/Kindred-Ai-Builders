"use client";

/**
 * Project-scoped enabled kits list.
 *
 * Why:
 * - Kits are optional extensions (templates, verify adapters).
 * - Backups should carry which kits a project depends on.
 * - Core remains kernel-neutral; kits are referenced by id only.
 */

export type EnabledKitsV1 = {
  schema: "kindred.enabled_kits.v1";
  updated_at_utc: string;
  kit_ids: string[];
};

const ENABLED_KITS_KEY_PREFIX = "kindred_enabled_kits_v1:";

function utcNow(): string {
  return new Date().toISOString();
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

export function enabledKitsKeyForProject(projectId: string): string {
  return `${ENABLED_KITS_KEY_PREFIX}${projectId}`;
}

export function loadEnabledKits(projectId: string): EnabledKitsV1 {
  try {
    const raw = localStorage.getItem(enabledKitsKeyForProject(projectId)) || "";
    if (!raw) return { schema: "kindred.enabled_kits.v1", updated_at_utc: utcNow(), kit_ids: [] };
    const parsed = safeJsonParse<any>(raw);
    if (!parsed || parsed.schema !== "kindred.enabled_kits.v1") {
      return { schema: "kindred.enabled_kits.v1", updated_at_utc: utcNow(), kit_ids: [] };
    }
    const kit_ids = Array.isArray(parsed.kit_ids) ? parsed.kit_ids.filter((x: any) => typeof x === "string" && x.trim()) : [];
    return {
      schema: "kindred.enabled_kits.v1",
      updated_at_utc: typeof parsed.updated_at_utc === "string" ? parsed.updated_at_utc : utcNow(),
      kit_ids: Array.from(new Set(kit_ids.map((s: string) => s.trim()))),
    };
  } catch {
    return { schema: "kindred.enabled_kits.v1", updated_at_utc: utcNow(), kit_ids: [] };
  }
}

export function saveEnabledKits(projectId: string, store: EnabledKitsV1) {
  const kit_ids = Array.from(new Set((store.kit_ids || []).map((s) => String(s || "").trim()).filter(Boolean)));
  const next: EnabledKitsV1 = {
    schema: "kindred.enabled_kits.v1",
    updated_at_utc: utcNow(),
    kit_ids,
  };
  try {
    localStorage.setItem(enabledKitsKeyForProject(projectId), JSON.stringify(next));
  } catch {
    // ignore
  }
  dispatch("kindred_enabled_kits_changed");
}

export function addEnabledKit(projectId: string, kitId: string): EnabledKitsV1 {
  const id = String(kitId || "").trim();
  if (!id) return loadEnabledKits(projectId);
  const prev = loadEnabledKits(projectId);
  if (prev.kit_ids.includes(id)) return prev;
  const next: EnabledKitsV1 = {
    schema: "kindred.enabled_kits.v1",
    updated_at_utc: utcNow(),
    kit_ids: [...prev.kit_ids, id],
  };
  try {
    localStorage.setItem(enabledKitsKeyForProject(projectId), JSON.stringify(next));
  } catch {
    // ignore
  }
  dispatch("kindred_enabled_kits_changed");
  return next;
}
