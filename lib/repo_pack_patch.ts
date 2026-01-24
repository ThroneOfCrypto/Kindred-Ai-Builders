"use client";

/**
 * Repo Pack patch ops (contracts only in v1.0.1)
 *
 * Patch operations are expressed as file-level edits with preconditions.
 * They are intentionally boring and deterministic:
 * - no "run" operations
 * - no "apply this diff hunk" ambiguity
 * - add/edit/delete/move only
 */

export const REPO_PACK_PATCH_SCHEMA_ID = "kindred.repo_pack_patch.v1" as const;

export type RepoPatchOpV1 =
  | {
      op: "add";
      path: string;
      new_b64: string;
      new_sha256: string;
      new_size: number;
      is_text: boolean;
    }
  | {
      op: "delete";
      path: string;
      old_sha256: string;
      old_size: number;
    }
  | {
      op: "edit";
      path: string;
      old_sha256: string;
      old_size: number;
      new_b64: string;
      new_sha256: string;
      new_size: number;
      is_text: boolean;
    }
  | {
      op: "move";
      from_path: string;
      to_path: string;
      old_sha256: string;
      old_size: number;
    };

export type RepoPackPatchV1 = {
  schema: typeof REPO_PACK_PATCH_SCHEMA_ID;
  created_at_utc: string;
  summary: string;
  patch_text: string;
  stats: {
    added: number;
    deleted: number;
    edited: number;
    moved: number;
    unchanged: number;
  };
  ops: RepoPatchOpV1[];
  provenance?: {
    app_version?: string;
    validator_version?: string;
  };
};

export function isRepoPackPatchV1(x: any): x is RepoPackPatchV1 {
  if (!x || typeof x !== "object") return false;
  if (x.schema !== REPO_PACK_PATCH_SCHEMA_ID) return false;
  if (typeof x.created_at_utc !== "string") return false;
  if (typeof x.summary !== "string") return false;
  if (typeof x.patch_text !== "string") return false;
  if (!x.stats || typeof x.stats !== "object") return false;
  if (typeof x.stats.added !== "number") return false;
  if (typeof x.stats.deleted !== "number") return false;
  if (typeof x.stats.edited !== "number") return false;
  if (typeof x.stats.moved !== "number") return false;
  if (typeof x.stats.unchanged !== "number") return false;
  if (!Array.isArray(x.ops)) return false;
  return true;
}
