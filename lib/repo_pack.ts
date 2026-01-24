"use client";

/**
 * Repo Pack (contracts only in v1.0.1)
 *
 * A Repo Pack is a deterministic snapshot of a repository, meant to support:
 * - import/export with stable ordering and stable zip timestamps
 * - per-file hashing and clear caps (file count/size, binary allow/deny)
 * - workbench diff/patch/adopt/lock without special casing any repo
 *
 * Implementation of import/export lands in the next cycle.
 */

export const REPO_PACK_MANIFEST_SCHEMA_ID = "kindred.repo_pack_manifest.v1" as const;

export type RepoPackFileEntryV1 = {
  /** POSIX-style path relative to repo root, using "/" separators. */
  path: string;
  /** SHA-256 hex of the file bytes. */
  sha256: string;
  /** File size in bytes. */
  size: number;
  /** True if the file is treated as text for diffing. */
  is_text: boolean;
};

export type RepoPackCapsV1 = {
  max_file_count: number;
  max_total_bytes: number;
  max_file_bytes: number;
  /** When false, binary files should be rejected at import time. */
  allow_binary: boolean;
};

export type RepoPackRulesV1 = {
  /** Allowlist patterns (glob-ish). Empty means "allow everything" (subject to deny + caps). */
  allow_globs: string[];
  /** Denylist patterns (glob-ish). */
  deny_globs: string[];
  caps: RepoPackCapsV1;
};

export type RepoPackManifestV1 = {
  schema: typeof REPO_PACK_MANIFEST_SCHEMA_ID;
  created_at_utc: string;
  /** Stable logical id (not a git hash). */
  repo_id: string;
  /** Format version (independent from app version). */
  repo_pack_version: string;
  provenance?: {
    app_version?: string;
    validator_version?: string;
  };
  rules: RepoPackRulesV1;
  totals: {
    file_count: number;
    total_bytes: number;
  };
  /** File list must be sorted by path for determinism. */
  files: RepoPackFileEntryV1[];
};

export function isRepoPackManifestV1(x: any): x is RepoPackManifestV1 {
  if (!x || typeof x !== "object") return false;
  if (x.schema !== REPO_PACK_MANIFEST_SCHEMA_ID) return false;
  if (typeof x.created_at_utc !== "string") return false;
  if (typeof x.repo_id !== "string") return false;
  if (typeof x.repo_pack_version !== "string") return false;
  if (!x.rules || typeof x.rules !== "object") return false;
  if (!Array.isArray(x.rules.allow_globs) || !Array.isArray(x.rules.deny_globs)) return false;
  if (!x.rules.caps || typeof x.rules.caps !== "object") return false;
  if (typeof x.rules.caps.max_file_count !== "number") return false;
  if (typeof x.rules.caps.max_total_bytes !== "number") return false;
  if (typeof x.rules.caps.max_file_bytes !== "number") return false;
  if (typeof x.rules.caps.allow_binary !== "boolean") return false;
  if (!x.totals || typeof x.totals !== "object") return false;
  if (typeof x.totals.file_count !== "number") return false;
  if (typeof x.totals.total_bytes !== "number") return false;
  if (!Array.isArray(x.files)) return false;
  return true;
}
