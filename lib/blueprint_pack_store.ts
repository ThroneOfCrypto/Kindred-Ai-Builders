"use client";

import { idbDel, idbGet, idbSet } from "./idb_kv";
import { sha256Hex } from "./hash";

// ---------------------------------------------------------------------------
// Blueprint Pack storage (IndexedDB) + small metadata (localStorage).
//
// Why:
// - Blueprint JSON can grow beyond safe localStorage quotas.
// - We want durable offline storage for the latest compiled Blueprint Pack.
//
// Notes:
// - Blueprint Pack is a DERIVED artefact (compiled). Canonical truth remains
//   the adopted Spec Pack + locked governance records.
// - We store the JSON text in IndexedDB and only keep compact UX metadata in
//   localStorage.
// ---------------------------------------------------------------------------

export type BlueprintPackStoreMetaV1 = {
  schema: "kindred.blueprint_pack_store_meta.v1";
  project_id: string;
  blueprint_pack_sha256: string;
  spec_pack_sha256: string;
  stored_at_utc: string;
  // Optional informational timestamp (not part of deterministic packs).
  generated_at_utc?: string;
  bytes?: number;
};

const IDB_PREFIX = "kindred_blueprint_pack_json_v1:";
const LS_META_PREFIX = "kindred_blueprint_pack_meta_v1:";

function utcNow(): string {
  return new Date().toISOString();
}

function lsGet(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function lsDel(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
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

export function blueprintPackJsonKey(projectId: string): string {
  return `${IDB_PREFIX}${projectId}`;
}

export function blueprintPackMetaKey(projectId: string): string {
  return `${LS_META_PREFIX}${projectId}`;
}

export function getBlueprintPackMeta(projectId: string): BlueprintPackStoreMetaV1 | null {
  const raw = lsGet(blueprintPackMetaKey(projectId));
  if (!raw) return null;
  const parsed = safeJsonParse<any>(raw);
  if (!parsed || parsed.schema !== "kindred.blueprint_pack_store_meta.v1") return null;
  if (String(parsed.project_id || "") !== String(projectId || "")) return null;
  return parsed as BlueprintPackStoreMetaV1;
}

export async function getLatestBlueprintPackJson(projectId: string): Promise<string | null> {
  const v = await idbGet<any>(blueprintPackJsonKey(projectId));
  if (!v) return null;
  if (typeof v === "string") return v;
  return null;
}

export async function setLatestBlueprintPack(args: {
  project_id: string;
  jsonText: string;
  blueprint_pack_sha256?: string;
  spec_pack_sha256?: string;
  generated_at_utc?: string;
}): Promise<BlueprintPackStoreMetaV1 | null> {
  const projectId = String(args.project_id || "").trim();
  const jsonText = String(args.jsonText || "");
  if (!projectId) return null;
  if (!jsonText) return null;

  const specSha = String(args.spec_pack_sha256 || "").trim();
  const bpSha = String(args.blueprint_pack_sha256 || "").trim() || (await sha256Hex(jsonText));

  const ok = await idbSet<string>(blueprintPackJsonKey(projectId), jsonText);
  if (!ok) return null;

  const meta: BlueprintPackStoreMetaV1 = {
    schema: "kindred.blueprint_pack_store_meta.v1",
    project_id: projectId,
    blueprint_pack_sha256: bpSha,
    spec_pack_sha256: specSha,
    stored_at_utc: utcNow(),
    generated_at_utc: args.generated_at_utc,
    bytes: new TextEncoder().encode(jsonText).byteLength,
  };

  lsSet(blueprintPackMetaKey(projectId), JSON.stringify(meta));
  dispatch("kindred_blueprint_pack_changed");
  return meta;
}

export async function clearLatestBlueprintPack(projectId: string): Promise<void> {
  const pid = String(projectId || "").trim();
  if (!pid) return;
  await idbDel(blueprintPackJsonKey(pid));
  lsDel(blueprintPackMetaKey(pid));
  dispatch("kindred_blueprint_pack_changed");
}
