"use client";

import { strFromU8, strToU8, unzipSync } from "fflate";

import { isProbablyTextFile } from "./file_kinds";
import { zipDeterministic } from "./deterministic_zip";
import { stableJsonText } from "./stable_json";
import { sha256Hex } from "./hash";
import { APP_VERSION, REPO_PACK_VERSION, VALIDATOR_VERSION, ZIP_MTIME_UTC } from "./version";
import { RepoPackManifestV1, RepoPackRulesV1, isRepoPackManifestV1 } from "./repo_pack";

export const REPO_PACK_MANIFEST_PATH = "repo_pack_manifest.json";
export const REPO_PACK_FILES_PREFIX = "repo/";

export type RepoPackFile = {
  path: string;
  bytes: Uint8Array;
  size: number;
  sha256: string;
  is_text: boolean;
};

export type RepoPack = {
  manifest: RepoPackManifestV1;
  files: RepoPackFile[];
  fileMap: Map<string, RepoPackFile>;
  /** SHA-256 hex of the deterministic Repo Pack ZIP bytes. */
  pack_sha256: string;
  warnings: string[];
};

export type RepoPackImportError = {
  code:
    | "INVALID_ZIP"
    | "EMPTY_ZIP"
    | "OVER_CAP_FILE_BYTES"
    | "OVER_CAP_TOTAL_BYTES"
    | "OVER_CAP_FILE_COUNT"
    | "BINARY_NOT_ALLOWED"
    | "MANIFEST_INVALID"
    | "PACK_LAYOUT_INVALID";
  message: string;
  details: string[];
};

export type VirtualRepoFile = {
  path: string;
  text?: string;
  bytes?: Uint8Array;
};

function nowUtcStable() {
  // Determinism: do not use wall-clock timestamps in exported artefacts.
  return ZIP_MTIME_UTC;
}

export function defaultRepoPackRules(): RepoPackRulesV1 {
  return {
    allow_globs: [],
    deny_globs: [
      "__MACOSX/**",
      ".DS_Store",
      "node_modules/**",
      ".next/**",
      "dist/**",
      "build/**",
      "coverage/**",
      ".git/**",
    ],
    caps: {
      max_file_count: 10000,
      max_total_bytes: 104857600,
      max_file_bytes: 5242880,
      allow_binary: false,
    },
  };
}

function normalizePath(p: string): string {
  let x = String(p || "");
  x = x.replace(/\\/g, "/");
  while (x.startsWith("./")) x = x.slice(2);
  x = x.replace(/^\/+/, "");
  // Collapse duplicate separators.
  x = x.replace(/\/+/g, "/");
  return x;
}

export function sanitizeRepoPath(raw: string): { ok: true; path: string } | { ok: false; error: string } {
  // Normalize then validate that the path is a safe, repo-relative file path.
  let x = String(raw || "");
  x = x.replace(/\u0000/g, "");
  x = x.replace(/\\/g, "/");
  x = x.trim();

  // Reject Windows drive paths (e.g. C:\ or C:/)
  if (/^[A-Za-z]:/.test(x)) return { ok: false, error: "Windows drive paths are not allowed." };

  // Reject UNC paths
  if (x.startsWith("//") || x.startsWith("\\\\")) return { ok: false, error: "UNC/absolute paths are not allowed." };

  while (x.startsWith("./")) x = x.slice(2);

  // Reject absolute paths (keep repo packs strictly relative)
  if (x.startsWith("/")) return { ok: false, error: "Absolute paths are not allowed." };

  // Collapse duplicate separators.
  x = x.replace(/\/+/g, "/");

  const parts = x.split("/");
  const out: string[] = [];
  for (const seg of parts) {
    if (!seg || seg === ".") continue;
    if (seg === "..") return { ok: false, error: "Path traversal ('..') is not allowed." };
    // Reject control chars
    if (/[\u0000-\u001F\u007F]/.test(seg)) return { ok: false, error: "Control characters are not allowed in paths." };
    out.push(seg);
  }

  const path = out.join("/");
  if (!path) return { ok: false, error: "Empty path." };
  if (path.endsWith("/")) return { ok: false, error: "Directory paths are not allowed." };
  return { ok: true, path };
}

function globToRegExp(pattern: string): RegExp {
  // Minimal glob-ish matcher:
  // - "**" matches any path segment (including "/")
  // - "*" matches any chars except "/"
  // - "?" matches a single char except "/"
  const p = normalizePath(pattern);
  let re = "^";
  if (!p.includes("/")) re += "(?:.*/)?";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    const next = i + 1 < p.length ? p[i + 1] : "";
    if (ch === "*" && next === "*") {
      // **
      re += ".*";
      i += 1;
      continue;
    }
    if (ch === "*") {
      re += "[^/]*";
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      continue;
    }
    // Escape regex special chars.
    if (".+^$(){}[]|\\".includes(ch)) re += "\\" + ch;
    else re += ch;
  }
  re += "$";
  return new RegExp(re);
}

function matchesAnyGlob(path: string, globs: string[]): boolean {
  const p = normalizePath(path);
  for (const g of globs) {
    if (!g) continue;
    try {
      const r = globToRegExp(g);
      if (r.test(p)) return true;
    } catch {
      // ignore invalid glob
    }
  }
  return false;
}

export function shouldIncludeRepoPath(path: string, rules: RepoPackRulesV1): { include: boolean; reason?: string } {
  const sp = sanitizeRepoPath(path);
  if (!sp.ok) return { include: false, reason: sp.error };
  const p = sp.path;
  if (!p || p.endsWith("/")) return { include: false, reason: "Empty path or directory entry." };
  if (rules.allow_globs && rules.allow_globs.length > 0) {
    if (!matchesAnyGlob(p, rules.allow_globs)) return { include: false, reason: "Not matched by allow_globs." };
  }
  if (rules.deny_globs && rules.deny_globs.length > 0) {
    if (matchesAnyGlob(p, rules.deny_globs)) return { include: false, reason: "Matched deny_globs." };
  }
  return { include: true };
}

function detectSingleTopFolder(paths: string[]): string {
  const segments = new Set<string>();
  for (const raw of paths) {
    const p = normalizePath(raw);
    if (!p || p.endsWith("/")) continue;
    const seg0 = p.split("/")[0] || "";
    if (!seg0) continue;
    // Ignore common junk folder that should not become the "root".
    if (seg0 === "__MACOSX") continue;
    segments.add(seg0);
  }
  if (segments.size === 1) return Array.from(segments)[0];
  return "";
}

function stripTopFolderIfPresent(path: string, top: string): string {
  const p = normalizePath(path);
  if (!top) return p;
  const prefix = top + "/";
  if (p.startsWith(prefix)) return p.slice(prefix.length);
  return p;
}

function prettyManifest(m: RepoPackManifestV1): Uint8Array {
  return strToU8(stableJsonText(m, 2));
}

function prettyTextLines(lines: string[]): Uint8Array {
  return strToU8(lines.join("\n") + "\n");
}

async function computeRepoFingerprint(files: Array<{ path: string; sha256: string; size: number; is_text: boolean }>): Promise<string> {
  // Deterministic logical fingerprint (independent of app version, zip layout, etc.).
  const lines = files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.path}\u0000${f.sha256}\u0000${f.size}\u0000${f.is_text ? 1 : 0}`);
  return await sha256Hex(prettyTextLines(lines));
}

export function isRepoPackZip(bytes: Uint8Array): boolean {
  try {
    const out = unzipSync(bytes);
    return Object.prototype.hasOwnProperty.call(out, REPO_PACK_MANIFEST_PATH);
  } catch {
    return false;
  }
}

export async function readRepoPackZip(bytes: Uint8Array): Promise<{ ok: true; pack: RepoPack } | { ok: false; error: RepoPackImportError }> {
  if (!bytes || bytes.byteLength < 4) {
    return { ok: false, error: { code: "INVALID_ZIP", message: "ZIP is empty or incomplete.", details: [] } };
  }
  let out: Record<string, Uint8Array>;
  try {
    out = unzipSync(bytes);
  } catch (e: any) {
    return { ok: false, error: { code: "INVALID_ZIP", message: String(e?.message || e), details: [] } };
  }

  const manifestBytes = out[REPO_PACK_MANIFEST_PATH];
  if (!manifestBytes) {
    return { ok: false, error: { code: "PACK_LAYOUT_INVALID", message: "Missing repo_pack_manifest.json", details: [] } };
  }

  let manifest: any = null;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch (e: any) {
    return {
      ok: false,
      error: { code: "MANIFEST_INVALID", message: `Manifest JSON invalid: ${String(e?.message || e)}`, details: [] },
    };
  }
  if (!isRepoPackManifestV1(manifest)) {
    return { ok: false, error: { code: "MANIFEST_INVALID", message: "Manifest schema mismatch or missing fields.", details: [] } };
  }

  const warnings: string[] = [];
  const files: RepoPackFile[] = [];
  const fileMap = new Map<string, RepoPackFile>();
  const seenPaths = new Set<string>();

  let computedTotalBytes = 0;

  for (const entry of manifest.files) {
    const sp = sanitizeRepoPath(entry.path);
    if (!sp.ok) {
      return {
        ok: false,
        error: {
          code: "MANIFEST_INVALID",
          message: `Manifest path invalid: ${entry.path}`,
          details: [sp.error],
        },
      };
    }
    const path = sp.path;
    if (seenPaths.has(path)) {
      return {
        ok: false,
        error: {
          code: "MANIFEST_INVALID",
          message: `Manifest contains duplicate path: ${path}`,
          details: [],
        },
      };
    }
    seenPaths.add(path);

    const storedPath = REPO_PACK_FILES_PREFIX + path;
    const fileBytes = out[storedPath] || out[path];
    if (!fileBytes) {
      warnings.push(`Manifest refers to missing file: ${path}`);
      continue;
    }
    const size = fileBytes.byteLength;
    computedTotalBytes += size;
    const computedSha = await sha256Hex(fileBytes);
    if (computedSha !== entry.sha256) {
      return {
        ok: false,
        error: {
          code: "MANIFEST_INVALID",
          message: `Manifest sha256 mismatch for ${path}`,
          details: [`expected ${entry.sha256}`, `computed ${computedSha}`],
        },
      };
    }
    const is_text = isProbablyTextFile(path, fileBytes);
    if (is_text !== entry.is_text) {
      warnings.push(
        `Manifest is_text mismatch for ${path} (manifest=${entry.is_text ? "text" : "binary"}, detected=${is_text ? "text" : "binary"})`
      );
    }
    files.push({ path, bytes: fileBytes, size, sha256: computedSha, is_text });
  }

  if (manifest.totals && typeof manifest.totals.total_bytes === "number" && manifest.totals.total_bytes !== computedTotalBytes) {
    warnings.push(`Manifest totals.total_bytes mismatch (manifest=${manifest.totals.total_bytes}, computed=${computedTotalBytes})`);
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  for (const f of files) fileMap.set(f.path, f);

  const canonicalZip = exportRepoPackZip({ manifest, files });
  const pack_sha256 = await sha256Hex(canonicalZip);

  return {
    ok: true,
    pack: {
      manifest,
      files,
      fileMap,
      pack_sha256,
      warnings,
    },
  };
}

export async function importRepoZipAsPack(opts: {
  zipBytes: Uint8Array;
  rules?: RepoPackRulesV1;
}): Promise<{ ok: true; pack: RepoPack } | { ok: false; error: RepoPackImportError }> {
  const rules = opts.rules || defaultRepoPackRules();

  if (!opts.zipBytes || opts.zipBytes.byteLength < 4) {
    return { ok: false, error: { code: "INVALID_ZIP", message: "ZIP is empty or incomplete.", details: [] } };
  }

  let out: Record<string, Uint8Array>;
  try {
    out = unzipSync(opts.zipBytes);
  } catch (e: any) {
    return { ok: false, error: { code: "INVALID_ZIP", message: String(e?.message || e), details: [] } };
  }

  const rawEntries = Object.entries(out).filter(([p]) => !!p && !p.endsWith("/"));

  const entries: Array<{ path: string; bytes: Uint8Array }> = [];
  const invalidPathSamples: string[] = [];
  let invalidPathCount = 0;

  for (const [rawPath, bytes] of rawEntries) {
    const sp = sanitizeRepoPath(rawPath);
    if (!sp.ok) {
      invalidPathCount += 1;
      if (invalidPathSamples.length < 50) invalidPathSamples.push(`${rawPath} (${sp.error})`);
      continue;
    }
    entries.push({ path: sp.path, bytes });
  }

  if (entries.length === 0) {
    return {
      ok: false,
      error: {
        code: "EMPTY_ZIP",
        message: "ZIP contains no usable files (all paths were invalid or directories).",
        details: invalidPathSamples,
      },
    };
  }

  const rawPaths = entries.map((e) => e.path);
  const top = detectSingleTopFolder(rawPaths);

  const warnings: string[] = [];
  if (invalidPathCount > 0) {
    warnings.push(`Skipped ${invalidPathCount} invalid path(s) during ZIP import. Showing up to ${invalidPathSamples.length} sample(s).`);
    for (const s of invalidPathSamples) warnings.push(`Invalid path: ${s}`);
  }

  const included: Array<{ path: string; bytes: Uint8Array }> = [];
  const excludedByRulesSamples: string[] = [];
  let excludedByRulesCount = 0;

  for (const e of entries) {
    const stripped = stripTopFolderIfPresent(e.path, top);
    const sp = sanitizeRepoPath(stripped);
    if (!sp.ok) {
      excludedByRulesCount += 1;
      if (excludedByRulesSamples.length < 50) excludedByRulesSamples.push(`${e.path} (invalid after strip: ${sp.error})`);
      continue;
    }
    const p = sp.path;
    const include = shouldIncludeRepoPath(p, rules);
    if (!include.include) {
      excludedByRulesCount += 1;
      if (excludedByRulesSamples.length < 50) excludedByRulesSamples.push(`${p} (${include.reason || "rule"})`);
      continue;
    }
    included.push({ path: p, bytes: e.bytes });
  }

  if (excludedByRulesCount > 0) {
    warnings.push(`Excluded ${excludedByRulesCount} path(s) by allow/deny rules. Showing up to ${excludedByRulesSamples.length} sample(s).`);
    for (const s of excludedByRulesSamples) warnings.push(`Excluded: ${s}`);
  }

  if (included.length === 0) {
    return { ok: false, error: { code: "EMPTY_ZIP", message: "No files remain after allow/deny rules.", details: warnings } };
  }

  // Caps (count/bytes) validation.
  const details: string[] = [];
  const oversizeFiles: string[] = [];
  let totalBytes = 0;

  if (included.length > rules.caps.max_file_count) {
    details.push(`File count ${included.length} exceeds max_file_count ${rules.caps.max_file_count}.`);
  }

  for (const f of included) {
    const size = f.bytes.byteLength;
    if (size > rules.caps.max_file_bytes) {
      oversizeFiles.push(`${f.path} (${size} bytes > ${rules.caps.max_file_bytes})`);
    }
    totalBytes += size;
  }

  if (oversizeFiles.length > 0) {
    return {
      ok: false,
      error: { code: "OVER_CAP_FILE_BYTES", message: "One or more files exceed max_file_bytes.", details: oversizeFiles },
    };
  }
  if (included.length > rules.caps.max_file_count) {
    return {
      ok: false,
      error: { code: "OVER_CAP_FILE_COUNT", message: "Repo exceeds max_file_count.", details },
    };
  }
  if (totalBytes > rules.caps.max_total_bytes) {
    return {
      ok: false,
      error: {
        code: "OVER_CAP_TOTAL_BYTES",
        message: "Repo exceeds max_total_bytes.",
        details: [`Total bytes ${totalBytes} > ${rules.caps.max_total_bytes}`],
      },
    };
  }

  // Build files (hash + text detection).
  const files: RepoPackFile[] = [];
  const binaryRejected: string[] = [];

  included.sort((a, b) => a.path.localeCompare(b.path));
  for (const f of included) {
    const is_text = isProbablyTextFile(f.path, f.bytes);
    if (!rules.caps.allow_binary && !is_text) {
      binaryRejected.push(f.path);
      continue;
    }
    const sha256 = await sha256Hex(f.bytes);
    files.push({ path: f.path, bytes: f.bytes, size: f.bytes.byteLength, sha256, is_text });
  }

  if (binaryRejected.length > 0) {
    return {
      ok: false,
      error: {
        code: "BINARY_NOT_ALLOWED",
        message: "Binary files were found but allow_binary=false.",
        details: binaryRejected,
      },
    };
  }

  const fileMap = new Map<string, RepoPackFile>();
  for (const f of files) fileMap.set(f.path, f);

  const manifestFiles = files.map((f) => ({ path: f.path, sha256: f.sha256, size: f.size, is_text: f.is_text }));
  const fingerprint = await computeRepoFingerprint(manifestFiles);
  const repo_id = `sha256:${fingerprint}`;

  const manifest: RepoPackManifestV1 = {
    schema: "kindred.repo_pack_manifest.v1" as const,
    created_at_utc: nowUtcStable(),
    repo_id,
    repo_pack_version: REPO_PACK_VERSION,
    provenance: {
      app_version: APP_VERSION,
      validator_version: VALIDATOR_VERSION,
    },
    rules,
    totals: {
      file_count: files.length,
      total_bytes: totalBytes,
    },
    files: manifestFiles,
  };

  // Deterministic export bytes (pack ZIP) and hash.
  const packZip = exportRepoPackZip({ manifest, files });
  const pack_sha256 = await sha256Hex(packZip);

  return {
    ok: true,
    pack: {
      manifest,
      files,
      fileMap,
      pack_sha256,
      warnings,
    },
  };
}

export function exportRepoPackZip(pack: { manifest: RepoPackManifestV1; files: RepoPackFile[] }): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  files[REPO_PACK_MANIFEST_PATH] = prettyManifest(pack.manifest);
  const list = pack.files.slice().sort((a, b) => a.path.localeCompare(b.path));
  for (const f of list) {
    const sp = sanitizeRepoPath(f.path);
    if (!sp.ok) throw new Error(`Invalid repo pack file path: ${String(f.path)} (${sp.error})`);
    files[REPO_PACK_FILES_PREFIX + sp.path] = f.bytes;
  }
  return zipDeterministic(files, { level: 6 });
}

/**
 * Create a Repo Pack from in-memory files (no ZIP input), using the same schema and determinism rules
 * as `importRepoZipAsPack`.
 */
export async function createRepoPackFromVirtualFiles(opts: {
  files: VirtualRepoFile[];
  rules: RepoPackRulesV1;
}): Promise<{ ok: true; pack: RepoPack; zipBytes: Uint8Array } | { ok: false; error: RepoPackImportError }> {
  const rules = opts.rules;

  const included: Array<{ path: string; bytes: Uint8Array }> = [];
  const excluded: string[] = [];

  for (const vf of opts.files) {
    const sp = sanitizeRepoPath(vf.path);
    if (!sp.ok) {
      excluded.push(String(vf.path || "(empty)") + ` (invalid path: ${sp.error})`);
      continue;
    }
    const rawPath = sp.path;
    if (!rawPath || rawPath.endsWith("/")) {
      excluded.push(String(vf.path || "(empty)") + " (invalid path)");
      continue;
    }
    const inc = shouldIncludeRepoPath(rawPath, rules);
    if (!inc.include) {
      excluded.push(`${rawPath} (excluded: ${inc.reason || "rule"})`);
      continue;
    }
    let bytes: Uint8Array;
    if (vf.bytes) bytes = vf.bytes;
    else bytes = strToU8(String(vf.text || ""));
    included.push({ path: rawPath, bytes });
  }

  // De-duplicate by last-write-wins (deterministic by input order).
  const byPath = new Map<string, Uint8Array>();
  for (const f of included) byPath.set(f.path, f.bytes);

  const paths = Array.from(byPath.keys()).sort((a, b) => a.localeCompare(b));
  if (paths.length === 0) {
    return { ok: false, error: { code: "EMPTY_ZIP", message: "No files remained after applying rules.", details: excluded.slice(0, 200) } };
  }

  if (rules.caps.max_file_count > 0 && paths.length > rules.caps.max_file_count) {
    return {
      ok: false,
      error: {
        code: "OVER_CAP_FILE_COUNT",
        message: `Repo exceeds file count cap (${rules.caps.max_file_count}).`,
        details: [`files: ${paths.length}`],
      },
    };
  }

  const files: RepoPackFile[] = [];
  let totalBytes = 0;
  const binaryRejected: string[] = [];
  const tooLarge: string[] = [];

  for (const p of paths) {
    const bytes = byPath.get(p) || new Uint8Array();
    if (rules.caps.max_file_bytes > 0 && bytes.byteLength > rules.caps.max_file_bytes) {
      tooLarge.push(`${p} (${bytes.byteLength} bytes)`);
      continue;
    }
    totalBytes += bytes.byteLength;
    if (rules.caps.max_total_bytes > 0 && totalBytes > rules.caps.max_total_bytes) {
      return {
        ok: false,
        error: {
          code: "OVER_CAP_TOTAL_BYTES",
          message: `Repo exceeds total size cap (${rules.caps.max_total_bytes} bytes).`,
          details: [`total: ${totalBytes}`],
        },
      };
    }

    const is_text = isProbablyTextFile(p, bytes);
    if (!rules.caps.allow_binary && !is_text) {
      binaryRejected.push(p);
      continue;
    }
    const sha256 = await sha256Hex(bytes);
    files.push({ path: p, bytes, size: bytes.byteLength, sha256, is_text });
  }

  if (tooLarge.length > 0) {
    return {
      ok: false,
      error: {
        code: "OVER_CAP_FILE_BYTES",
        message: `One or more files exceed max_file_bytes (${rules.caps.max_file_bytes}).`,
        details: tooLarge.slice(0, 200),
      },
    };
  }

  if (binaryRejected.length > 0) {
    return {
      ok: false,
      error: {
        code: "BINARY_NOT_ALLOWED",
        message: "Binary files were found but allow_binary=false.",
        details: binaryRejected.slice(0, 200),
      },
    };
  }

  const fileMap = new Map<string, RepoPackFile>();
  for (const f of files) fileMap.set(f.path, f);

  const manifestFiles = files.map((f) => ({ path: f.path, sha256: f.sha256, size: f.size, is_text: f.is_text }));
  const fingerprint = await computeRepoFingerprint(manifestFiles);
  const repo_id = `sha256:${fingerprint}`;

  const warnings: string[] = [];
  if (excluded.length > 0) warnings.push(`Excluded ${excluded.length} paths by rules.`);

  const manifest: RepoPackManifestV1 = {
    schema: "kindred.repo_pack_manifest.v1" as const,
    created_at_utc: nowUtcStable(),
    repo_id,
    repo_pack_version: REPO_PACK_VERSION,
    provenance: {
      app_version: APP_VERSION,
      validator_version: VALIDATOR_VERSION,
    },
    rules,
    totals: {
      file_count: files.length,
      total_bytes: totalBytes,
    },
    files: manifestFiles,
  };

  const zipBytes = exportRepoPackZip({ manifest, files });
  const pack_sha256 = await sha256Hex(zipBytes);
  const pack: RepoPack = { manifest, files, fileMap, pack_sha256, warnings };
  return { ok: true, pack, zipBytes };
}
