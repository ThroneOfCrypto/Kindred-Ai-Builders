"use client";

import { SpecPack, asText } from "./spec_pack";
import { isProbablyTextFile } from "./file_kinds";

export type FileDiffKind = "added" | "removed" | "modified" | "unchanged";

export type FileDiff = {
  path: string;
  kind: FileDiffKind;
  oldSize: number;
  newSize: number;
  isText: boolean;
  patch: string; // unified diff or a short placeholder
};

export type PackDiff = {
  schema: "kindred.spec_pack_diff.v1";
  computed_at_utc: string;
  stats: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  files: FileDiff[];
  fullPatch: string;
};

function nowUtc() {
  return new Date().toISOString();
}

function isProbablyText(file: { path: string; bytes: Uint8Array }): boolean {
  return isProbablyTextFile(file.path, file.bytes);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

type Op = { tag: "equal" | "insert" | "delete"; line: string };

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
      if (k === -d) {
        x = v[kIndex + 1];
      } else if (k === d) {
        x = v[kIndex - 1] + 1;
      } else {
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

function linesFromText(text: string): string[] {
  const stripped = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Keep trailing empty line semantics by splitting, but drop the last empty element if file ends with \n
  const parts = stripped.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts;
}

function unifiedDiffForText(opts: {
  path: string;
  oldText: string;
  newText: string;
  context?: number;
  oldLabel?: string;
  newLabel?: string;
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

  const oldLabel = opts.oldLabel || `a/${opts.path}`;
  const newLabel = opts.newLabel || `b/${opts.path}`;

  let out = "";
  out += `diff --git a/${opts.path} b/${opts.path}\n`;
  out += `--- ${oldLabel}\n`;
  out += `+++ ${newLabel}\n`;

  let i = 0;
  while (i < ops.length) {
    // Find next change.
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
  return [
    `diff --git a/${path} b/${path}`,
    msg,
    "",
  ].join("\n");
}

export function diffSpecPacks(base: SpecPack, proposal: SpecPack): PackDiff {
  const basePaths = new Set(base.files.map((f) => f.path));
  const propPaths = new Set(proposal.files.map((f) => f.path));
  const allPaths = Array.from(new Set<string>([...basePaths, ...propPaths]));
  allPaths.sort((a, b) => a.localeCompare(b));

  const diffs: FileDiff[] = [];

  let added = 0;
  let removed = 0;
  let modified = 0;
  let unchanged = 0;

  for (const path of allPaths) {
    const a = base.fileMap.get(path) || null;
    const b = proposal.fileMap.get(path) || null;

    if (a && !b) {
      removed += 1;
      const isText = isProbablyText(a);
      let patch = "";
      if (isText) {
        patch = unifiedDiffForText({
          path,
          oldText: asText(a),
          newText: "",
          oldLabel: `a/${path}`,
          newLabel: "/dev/null",
        });
        if (!patch) {
          patch = placeholderDiff(path, "(file removed)\n");
        }
      } else {
        patch = placeholderDiff(path, "Binary file removed");
      }
      diffs.push({ path, kind: "removed", oldSize: a.size, newSize: 0, isText, patch });
      continue;
    }

    if (!a && b) {
      added += 1;
      const isText = isProbablyText(b);
      let patch = "";
      if (isText) {
        patch = unifiedDiffForText({
          path,
          oldText: "",
          newText: asText(b),
          oldLabel: "/dev/null",
          newLabel: `b/${path}`,
        });
        if (!patch) {
          patch = placeholderDiff(path, "(file added)\n");
        }
      } else {
        patch = placeholderDiff(path, "Binary file added");
      }
      diffs.push({ path, kind: "added", oldSize: 0, newSize: b.size, isText, patch });
      continue;
    }

    if (a && b) {
      if (bytesEqual(a.bytes, b.bytes)) {
        unchanged += 1;
        diffs.push({ path, kind: "unchanged", oldSize: a.size, newSize: b.size, isText: isProbablyText(a), patch: "" });
        continue;
      }

      modified += 1;
      const isText = isProbablyText(a) && isProbablyText(b);
      let patch = "";
      if (isText) {
        patch = unifiedDiffForText({ path, oldText: asText(a), newText: asText(b) });
        if (!patch) {
          patch = placeholderDiff(path, "(text changed but diff empty?)\n");
        }
      } else {
        patch = placeholderDiff(path, "Binary files differ");
      }

      diffs.push({ path, kind: "modified", oldSize: a.size, newSize: b.size, isText, patch });
      continue;
    }
  }

  // Build full patch output. Keep stable ordering and include only changed files.
  const changed = diffs.filter((d) => d.kind !== "unchanged");
  const fullPatch = changed
    .map((d) => {
      const patch = d.patch || "";
      return patch.trimEnd() + "\n";
    })
    .join("\n");

  return {
    schema: "kindred.spec_pack_diff.v1",
    computed_at_utc: nowUtc(),
    stats: { added, removed, modified, unchanged },
    files: diffs,
    fullPatch: fullPatch.trimEnd() + "\n",
  };
}
