"use client";

import { strFromU8 } from "fflate";

import { encodeBase64, decodeBase64 } from "./spec_pack";
import { sha256Hex } from "./hash";
import { isProbablyTextFile } from "./file_kinds";
import { APP_VERSION, REPO_PACK_VERSION, VALIDATOR_VERSION, ZIP_MTIME_UTC } from "./version";
import { RepoPack, RepoPackFile, exportRepoPackZip, sanitizeRepoPath, shouldIncludeRepoPath } from "./repo_pack_io";
import { RepoPackManifestV1 } from "./repo_pack";
import { RepoPackPatchV1, RepoPatchOpV1, REPO_PACK_PATCH_SCHEMA_ID } from "./repo_pack_patch";

export type RepoFileDiffKind = "added" | "deleted" | "edited" | "moved" | "unchanged";

export type RepoFileDiff =
  | {
      kind: "moved";
      from_path: string;
      to_path: string;
      oldSize: number;
      newSize: number;
      isText: boolean;
      patch: string;
    }
  | {
      kind: Exclude<RepoFileDiffKind, "moved">;
      path: string;
      oldSize: number;
      newSize: number;
      isText: boolean;
      patch: string;
    };

export type RepoPackDiff = {
  schema: "kindred.repo_pack_diff.v1";
  computed_at_utc: string;
  stats: {
    added: number;
    deleted: number;
    edited: number;
    moved: number;
    unchanged: number;
  };
  files: RepoFileDiff[];
  fullPatch: string;
};

function utcNow(): string {
  return new Date().toISOString();
}

function stableUtc(): string {
  // Determinism: patches and manifests must not encode wall-clock time.
  return ZIP_MTIME_UTC;
}

function normalizePath(p: string): string {
  let x = String(p || "");
  x = x.replace(/\\/g, "/");
  while (x.startsWith("./")) x = x.slice(2);
  x = x.replace(/^\/+/, "");
  x = x.replace(/\/+/g, "/");
  return x;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

type Op = { tag: "equal" | "insert" | "delete"; line: string };

function linesFromText(text: string): string[] {
  const stripped = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = stripped.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function backtrackMyers(a: string[], b: string[], trace: Array<number[]>, dMax: number, offset: number): Op[] {
  let x = a.length;
  let y = b.length;
  const ops: Op[] = [];

  for (let d = dMax; d > 0; d--) {
    const vPrev = trace[d - 1];
    const k = x - y;
    const kIndex = k + offset;

    let prevK: number;
    if (k === -d || (k !== d && vPrev[kIndex - 1] < vPrev[kIndex + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = vPrev[prevK + offset];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ tag: "equal", line: a[x - 1] });
      x -= 1;
      y -= 1;
    }

    if (x === prevX) {
      ops.push({ tag: "insert", line: b[y - 1] });
      y -= 1;
    } else {
      ops.push({ tag: "delete", line: a[x - 1] });
      x -= 1;
    }
  }

  while (x > 0 && y > 0) {
    ops.push({ tag: "equal", line: a[x - 1] });
    x -= 1;
    y -= 1;
  }
  while (x > 0) {
    ops.push({ tag: "delete", line: a[x - 1] });
    x -= 1;
  }
  while (y > 0) {
    ops.push({ tag: "insert", line: b[y - 1] });
    y -= 1;
  }

  ops.reverse();
  return ops;
}

function myersDiff(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Array<number>(2 * max + 1).fill(0);
  const trace: Array<number[]> = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const kIndex = k + offset;

      let x: number;
      if (k === -d) x = v[kIndex + 1];
      else if (k === d) x = v[kIndex - 1] + 1;
      else {
        const down = v[kIndex + 1];
        const right = v[kIndex - 1] + 1;
        x = down > right ? down : right;
      }

      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }

      v[kIndex] = x;
      if (x >= n && y >= m) {
        return backtrackMyers(a, b, trace, d, offset);
      }
    }
  }

  return backtrackMyers(a, b, trace, max, offset);
}

function unifiedDiffForText(opts: {
  path: string;
  oldText: string;
  newText: string;
  context?: number;
}): string {
  const context = typeof opts.context === "number" ? opts.context : 3;
  const aLines = linesFromText(opts.oldText);
  const bLines = linesFromText(opts.newText);
  const ops = myersDiff(aLines, bLines);
  const hasChanges = ops.some((o) => o.tag !== "equal");
  if (!hasChanges) return "";

  // Precompute line positions at each op index.
  const oldPos: number[] = new Array(ops.length + 1);
  const newPos: number[] = new Array(ops.length + 1);
  let oLine = 1;
  let nLine = 1;
  for (let i = 0; i < ops.length; i++) {
    oldPos[i] = oLine;
    newPos[i] = nLine;
    const op = ops[i];
    if (op.tag === "equal") {
      oLine += 1;
      nLine += 1;
    } else if (op.tag === "delete") {
      oLine += 1;
    } else {
      nLine += 1;
    }
  }
  oldPos[ops.length] = oLine;
  newPos[ops.length] = nLine;

  let out = "";
  out += `diff --git a/${opts.path} b/${opts.path}\n`;
  out += `--- a/${opts.path}\n`;
  out += `+++ b/${opts.path}\n`;

  let i = 0;
  while (i < ops.length) {
    while (i < ops.length && ops[i].tag === "equal") i += 1;
    if (i >= ops.length) break;

    const hunkStart = Math.max(i - context, 0);
    let j = i;
    let lastChange = i;
    while (j < ops.length) {
      if (ops[j].tag !== "equal") lastChange = j;
      j += 1;
      if (j > lastChange + context) break;
    }

    const hunkEnd = j;
    const oldStart = oldPos[hunkStart];
    const newStart = newPos[hunkStart];
    const oldCount = oldPos[hunkEnd] - oldPos[hunkStart];
    const newCount = newPos[hunkEnd] - newPos[hunkStart];
    out += `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n`;

    for (let k = hunkStart; k < hunkEnd; k++) {
      const op = ops[k];
      const prefix = op.tag === "equal" ? " " : op.tag === "delete" ? "-" : "+";
      out += `${prefix}${op.line}\n`;
    }

    i = hunkEnd;
  }

  return out;
}

function placeholderDiff(path: string, msg: string): string {
  return `diff --git a/${path} b/${path}\n${msg}\n`;
}

async function fileSha256(f: RepoPackFile): Promise<string> {
  return await sha256Hex(f.bytes);
}

function isTextFile(f: RepoPackFile): boolean {
  return isProbablyTextFile(f.path, f.bytes);
}

function textFromBytes(bytes: Uint8Array): string {
  try {
    return strFromU8(bytes);
  } catch {
    // Fallback: best-effort UTF-8 decode.
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return "";
    }
  }
}

async function computeRepoFingerprint(files: Array<{ path: string; sha256: string; size: number; is_text: boolean }>): Promise<string> {
  const lines = files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.path}\u0000${f.sha256}\u0000${f.size}\u0000${f.is_text ? 1 : 0}`);
  const text = lines.join("\n") + "\n";
  return await sha256Hex(new TextEncoder().encode(text));
}

export async function diffRepoPacks(base: RepoPack, proposal: RepoPack): Promise<RepoPackDiff> {
  const basePaths = new Set<string>(base.files.map((f) => f.path));
  const propPaths = new Set<string>(proposal.files.map((f) => f.path));
  const removed = Array.from(basePaths).filter((p) => !propPaths.has(p));
  const added = Array.from(propPaths).filter((p) => !basePaths.has(p));
  removed.sort((a, b) => a.localeCompare(b));
  added.sort((a, b) => a.localeCompare(b));

  // Move detection: pair removed+added with identical content.
  const removedByKey = new Map<string, string[]>();
  for (const p of removed) {
    const f = base.fileMap.get(p);
    if (!f) continue;
    const sha = await fileSha256(f);
    const key = `${sha}:${f.size}`;
    const list = removedByKey.get(key) || [];
    list.push(p);
    removedByKey.set(key, list);
  }

  const addedByKey = new Map<string, string[]>();
  for (const p of added) {
    const f = proposal.fileMap.get(p);
    if (!f) continue;
    const sha = await fileSha256(f);
    const key = `${sha}:${f.size}`;
    const list = addedByKey.get(key) || [];
    list.push(p);
    addedByKey.set(key, list);
  }

  const movedPairs: Array<{ from_path: string; to_path: string; sha256: string; size: number }> = [];
  for (const [key, fromList] of removedByKey.entries()) {
    const toList = addedByKey.get(key) || [];
    if (toList.length === 0) continue;
    fromList.sort((a, b) => a.localeCompare(b));
    toList.sort((a, b) => a.localeCompare(b));
    const n = Math.min(fromList.length, toList.length);
    const [sha, sizeStr] = key.split(":");
    const size = Number(sizeStr || 0);
    for (let i = 0; i < n; i++) {
      movedPairs.push({ from_path: fromList[i], to_path: toList[i], sha256: sha, size });
    }
  }
  movedPairs.sort((a, b) => (a.from_path + "\u0000" + a.to_path).localeCompare(b.from_path + "\u0000" + b.to_path));

  const movedFrom = new Set(movedPairs.map((m) => m.from_path));
  const movedTo = new Set(movedPairs.map((m) => m.to_path));

  const removedFinal = removed.filter((p) => !movedFrom.has(p));
  const addedFinal = added.filter((p) => !movedTo.has(p));

  const shared = Array.from(basePaths).filter((p) => propPaths.has(p));
  shared.sort((a, b) => a.localeCompare(b));

  const diffs: RepoFileDiff[] = [];
  let stats = { added: 0, deleted: 0, edited: 0, moved: 0, unchanged: 0 };
  let fullPatch = "";

  for (const m of movedPairs) {
    const f = base.fileMap.get(m.from_path);
    const isText = f ? isTextFile(f) : true;
    const patch = `diff --git a/${m.from_path} b/${m.to_path}\nrename from ${m.from_path}\nrename to ${m.to_path}\n`;
    diffs.push({ kind: "moved", from_path: m.from_path, to_path: m.to_path, oldSize: m.size, newSize: m.size, isText, patch });
    fullPatch += patch;
    stats.moved += 1;
  }

  for (const p of removedFinal) {
    const f = base.fileMap.get(p);
    const oldSize = f ? f.size : 0;
    const isText = f ? isTextFile(f) : true;
    const patch = placeholderDiff(p, `deleted file (size ${oldSize})`);
    diffs.push({ kind: "deleted", path: p, oldSize, newSize: 0, isText, patch });
    fullPatch += patch;
    stats.deleted += 1;
  }

  for (const p of addedFinal) {
    const f = proposal.fileMap.get(p);
    const newSize = f ? f.size : 0;
    const isText = f ? isTextFile(f) : true;
    const patch = placeholderDiff(p, `added file (size ${newSize})`);
    diffs.push({ kind: "added", path: p, oldSize: 0, newSize, isText, patch });
    fullPatch += patch;
    stats.added += 1;
  }

  for (const p of shared) {
    const a = base.fileMap.get(p);
    const b = proposal.fileMap.get(p);
    if (!a || !b) continue;
    if (bytesEqual(a.bytes, b.bytes)) {
      diffs.push({ kind: "unchanged", path: p, oldSize: a.size, newSize: b.size, isText: isTextFile(a), patch: "" });
      stats.unchanged += 1;
      continue;
    }
    const isText = isTextFile(a) && isTextFile(b);
    let patch = "";
    if (isText) {
      patch = unifiedDiffForText({ path: p, oldText: textFromBytes(a.bytes), newText: textFromBytes(b.bytes), context: 3 });
      if (!patch) patch = placeholderDiff(p, "edited file (text)");
    } else {
      patch = placeholderDiff(p, `edited file (binary or non-text) old ${a.size} new ${b.size}`);
    }
    diffs.push({ kind: "edited", path: p, oldSize: a.size, newSize: b.size, isText, patch });
    fullPatch += patch;
    stats.edited += 1;
  }

  diffs.sort((x, y) => {
    const ax = x.kind === "moved" ? `${x.from_path}→${x.to_path}` : x.path;
    const ay = y.kind === "moved" ? `${y.from_path}→${y.to_path}` : y.path;
    return ax.localeCompare(ay);
  });

  return {
    schema: "kindred.repo_pack_diff.v1",
    computed_at_utc: utcNow(),
    stats,
    files: diffs,
    fullPatch,
  };
}

export async function buildRepoPackPatchFromPacks(opts: {
  base: RepoPack;
  proposal: RepoPack;
  summary: string;
  patch_text: string;
}): Promise<RepoPackPatchV1> {
  const diff = await diffRepoPacks(opts.base, opts.proposal);

  const ops: RepoPatchOpV1[] = [];
  for (const d of diff.files) {
    if (d.kind === "unchanged") continue;
    if (d.kind === "moved") {
      const f = opts.base.fileMap.get(d.from_path);
      if (!f) continue;
      const sha = await fileSha256(f);
      ops.push({ op: "move", from_path: normalizePath(d.from_path), to_path: normalizePath(d.to_path), old_sha256: sha, old_size: f.size });
      continue;
    }
    if (d.kind === "deleted") {
      const f = opts.base.fileMap.get(d.path);
      if (!f) continue;
      const sha = await fileSha256(f);
      ops.push({ op: "delete", path: normalizePath(d.path), old_sha256: sha, old_size: f.size });
      continue;
    }
    if (d.kind === "added") {
      const f = opts.proposal.fileMap.get(d.path);
      if (!f) continue;
      const sha = await fileSha256(f);
      ops.push({
        op: "add",
        path: normalizePath(d.path),
        new_b64: encodeBase64(f.bytes),
        new_sha256: sha,
        new_size: f.size,
        is_text: isTextFile(f),
      });
      continue;
    }
    if (d.kind === "edited") {
      const a = opts.base.fileMap.get(d.path);
      const b = opts.proposal.fileMap.get(d.path);
      if (!a || !b) continue;
      const oldSha = await fileSha256(a);
      const newSha = await fileSha256(b);
      ops.push({
        op: "edit",
        path: normalizePath(d.path),
        old_sha256: oldSha,
        old_size: a.size,
        new_b64: encodeBase64(b.bytes),
        new_sha256: newSha,
        new_size: b.size,
        is_text: isTextFile(a) && isTextFile(b),
      });
      continue;
    }
  }

  return {
    schema: REPO_PACK_PATCH_SCHEMA_ID,
    created_at_utc: stableUtc(),
    summary: opts.summary,
    patch_text: opts.patch_text,
    stats: { ...diff.stats },
    ops,
    provenance: {
      app_version: APP_VERSION,
      validator_version: VALIDATOR_VERSION,
    },
  };
}

export type ApplyRepoPatchResult =
  | { ok: true; mergedZip: Uint8Array; mergedPack: RepoPack; warnings: string[] }
  | { ok: false; error: string; details: string[] };

export async function applyRepoPatchToPack(base: RepoPack, patch: RepoPackPatchV1): Promise<ApplyRepoPatchResult> {
  const details: string[] = [];
  const warnings: string[] = [];

  // Base is expected to be canonical, but defend anyway.
  const fileMap = new Map<string, Uint8Array>();
  for (const f of base.files) {
    const sp = sanitizeRepoPath(f.path);
    if (!sp.ok) {
      return { ok: false, error: "Base Repo Pack contains an invalid path.", details: [`${f.path} (${sp.error})`] };
    }
    fileMap.set(sp.path, f.bytes);
  }

  const sanitizeOrDetail = (raw: string, ctx: string): string | null => {
    const sp = sanitizeRepoPath(raw);
    if (!sp.ok) {
      details.push(`${ctx}: invalid path "${raw}" (${sp.error})`);
      return null;
    }
    return sp.path;
  };

  // Apply patch ops with strict path + sha preconditions.
  for (const op of patch.ops) {
    if (op.op === "add") {
      const path = sanitizeOrDetail(op.path, "ADD");
      if (!path) continue;
      if (fileMap.has(path)) {
        details.push(`ADD would overwrite existing file: ${path}`);
        continue;
      }
      const bytes = decodeBase64(op.new_b64);
      const sha = await sha256Hex(bytes);
      if (sha !== op.new_sha256) {
        details.push(`ADD sha mismatch for ${path}`);
        continue;
      }
      fileMap.set(path, bytes);
      continue;
    }

    if (op.op === "delete") {
      const path = sanitizeOrDetail(op.path, "DELETE");
      if (!path) continue;
      const existing = fileMap.get(path);
      if (!existing) {
        warnings.push(`DELETE missing file (already absent): ${path}`);
        continue;
      }
      const sha = await sha256Hex(existing);
      if (sha !== op.old_sha256) {
        details.push(`DELETE precondition failed for ${path} (base file sha mismatch)`);
        continue;
      }
      fileMap.delete(path);
      continue;
    }

    if (op.op === "edit") {
      const path = sanitizeOrDetail(op.path, "EDIT");
      if (!path) continue;
      const existing = fileMap.get(path);
      if (!existing) {
        details.push(`EDIT missing base file: ${path}`);
        continue;
      }
      const oldSha = await sha256Hex(existing);
      if (oldSha !== op.old_sha256) {
        details.push(`EDIT precondition failed for ${path} (base file sha mismatch)`);
        continue;
      }
      const bytes = decodeBase64(op.new_b64);
      const newSha = await sha256Hex(bytes);
      if (newSha !== op.new_sha256) {
        details.push(`EDIT sha mismatch for ${path}`);
        continue;
      }
      fileMap.set(path, bytes);
      continue;
    }

    if (op.op === "move") {
      const from = sanitizeOrDetail(op.from_path, "MOVE.from_path");
      const to = sanitizeOrDetail(op.to_path, "MOVE.to_path");
      if (!from || !to) continue;
      const existing = fileMap.get(from);
      if (!existing) {
        details.push(`MOVE missing base file: ${from}`);
        continue;
      }
      if (fileMap.has(to)) {
        details.push(`MOVE would overwrite existing file: ${to}`);
        continue;
      }
      const sha = await sha256Hex(existing);
      if (sha !== op.old_sha256) {
        details.push(`MOVE precondition failed for ${from} (base file sha mismatch)`);
        continue;
      }
      fileMap.delete(from);
      fileMap.set(to, existing);
      continue;
    }
  }

  if (details.length > 0) {
    return { ok: false, error: "Patch could not be applied cleanly.", details };
  }

  const rules = base.manifest.rules;

  // Enforce allow/deny + caps on the post-patch map.
  const paths = Array.from(fileMap.keys()).filter(Boolean).sort((a, b) => a.localeCompare(b));

  if (rules.caps.max_file_count > 0 && paths.length > rules.caps.max_file_count) {
    return {
      ok: false,
      error: "Repo exceeds max_file_count after patch.",
      details: [`File count ${paths.length} > ${rules.caps.max_file_count}`],
    };
  }

  const disallowedPaths: string[] = [];
  const tooLarge: string[] = [];
  const binaryRejected: string[] = [];
  const files: RepoPackFile[] = [];
  const manifestFiles: RepoPackManifestV1["files"] = [];

  let totalBytes = 0;

  for (const p of paths) {
    const include = shouldIncludeRepoPath(p, rules);
    if (!include.include) {
      disallowedPaths.push(`${p} (${include.reason || "rule"})`);
      continue;
    }

    const bytes = fileMap.get(p) as Uint8Array;
    const size = bytes.byteLength;

    if (rules.caps.max_file_bytes > 0 && size > rules.caps.max_file_bytes) {
      tooLarge.push(`${p} (${size} bytes > ${rules.caps.max_file_bytes})`);
      continue;
    }

    const is_text = isProbablyTextFile(p, bytes);
    if (!rules.caps.allow_binary && !is_text) {
      binaryRejected.push(p);
      continue;
    }
    totalBytes += size;
    const sha = await sha256Hex(bytes);
    files.push({ path: p, bytes, size, sha256: sha, is_text });
    manifestFiles.push({ path: p, sha256: sha, size, is_text });
  }

  if (disallowedPaths.length > 0) {
    return {
      ok: false,
      error: "Patch introduces files that violate allow/deny rules.",
      details: disallowedPaths.slice(0, 200),
    };
  }

  if (tooLarge.length > 0) {
    return {
      ok: false,
      error: "Patch introduces files that exceed max_file_bytes.",
      details: tooLarge.slice(0, 200),
    };
  }

  if (totalBytes > rules.caps.max_total_bytes) {
    return {
      ok: false,
      error: "Repo exceeds max_total_bytes after patch.",
      details: [`Total bytes ${totalBytes} > ${rules.caps.max_total_bytes}`],
    };
  }

  if (binaryRejected.length > 0) {
    return {
      ok: false,
      error: "Binary files found but allow_binary=false.",
      details: binaryRejected.slice(0, 200),
    };
  }

  const fingerprint = await computeRepoFingerprint(manifestFiles);
  const repo_id = `sha256:${fingerprint}`;

  const manifest: RepoPackManifestV1 = {
    schema: "kindred.repo_pack_manifest.v1" as const,
    created_at_utc: stableUtc(),
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

  const mergedZip = exportRepoPackZip({ manifest, files });
  const pack_sha256 = await sha256Hex(mergedZip);
  const fileMapOut = new Map<string, RepoPackFile>();
  for (const f of files) fileMapOut.set(f.path, f);

  return {
    ok: true,
    mergedZip,
    mergedPack: { manifest, files, fileMap: fileMapOut, pack_sha256, warnings: [] },
    warnings,
  };
}