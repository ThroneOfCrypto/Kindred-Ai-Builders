"use client";

import { strToU8, strFromU8 } from "fflate";
import { SpecPack, SpecPackFile, decodeBase64, encodeBase64, getManifest, tryParseJson } from "./spec_pack";
import { isProbablyTextFile } from "./file_kinds";
import { zipDeterministic } from "./deterministic_zip";
import { stableJsonText } from "./stable_json";
import { APP_VERSION, VALIDATOR_VERSION, SPEC_PACK_VERSION, ZIP_MTIME_UTC } from "./version";
import { sha256Hex } from "./hash";

export type FilePatchOp =
  | {
      op: "add";
      path: string;
      new_b64: string;
      new_sha256: string;
      new_size: number;
      is_text: boolean;
    }
  | {
      op: "remove";
      path: string;
      old_sha256: string;
      old_size: number;
    }
  | {
      op: "modify";
      path: string;
      old_sha256: string;
      new_b64: string;
      new_sha256: string;
      old_size: number;
      new_size: number;
      is_text: boolean;
    };

export type SpecPackPatchV1 = {
  schema: "kindred.spec_pack_patch.v1";
  created_at_utc: string;
  base_project_id?: string;
  proposal_project_id?: string;
  summary: string;
  patch_text: string;
  stats: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  ops: FilePatchOp[];
};

export { sha256Hex };

function nowUtc() {
  // Determinism: do not introduce wall-clock time into patches.
  return ZIP_MTIME_UTC;
}

function pretty(obj: any) {
  return stableJsonText(obj, 2);
}

function normalizeManifestFiles(fileMap: Map<string, Uint8Array>, preserveProjectId?: string) {
  const paths = Array.from(fileMap.keys()).filter((p) => p !== "spec_pack_manifest.json");
  paths.sort((a, b) => a.localeCompare(b));

  let projectId = preserveProjectId;
  const existing = fileMap.get("spec_pack_manifest.json");
  if (existing) {
    const parsed = tryParseJson<any>(strFromU8(existing));
    if (parsed.ok && parsed.value?.schema === "kindred.spec_pack_manifest.v1" && typeof parsed.value?.project_id === "string") {
      projectId = parsed.value.project_id;
    }
  }
  if (!projectId) projectId = "project";

  fileMap.set(
    "spec_pack_manifest.json",
    strToU8(
      pretty({
        schema: "kindred.spec_pack_manifest.v1",
        created_at_utc: nowUtc(),
        project_id: projectId,
        spec_pack_version: SPEC_PACK_VERSION,
        provenance: {
          app_version: APP_VERSION,
          validator_version: VALIDATOR_VERSION,
        },
        contents: paths,
      })
    )
  );
}

export async function buildPatchFromPacks(opts: {
  base: SpecPack;
  proposal: SpecPack;
  patch_text: string;
  summary: string;
  stats: SpecPackPatchV1["stats"];
}): Promise<SpecPackPatchV1> {
  const baseManifest = getManifest(opts.base);
  const propManifest = getManifest(opts.proposal);

  const baseProjectId = baseManifest.ok ? baseManifest.manifest.project_id : undefined;
  const propProjectId = propManifest.ok ? propManifest.manifest.project_id : undefined;

  const basePaths = new Set(opts.base.files.map((f) => f.path));
  const propPaths = new Set(opts.proposal.files.map((f) => f.path));
  const allPaths = Array.from(new Set<string>([...basePaths, ...propPaths]));
  allPaths.sort((a, b) => a.localeCompare(b));

  const ops: FilePatchOp[] = [];
  for (const path of allPaths) {
    const a = opts.base.fileMap.get(path) || null;
    const b = opts.proposal.fileMap.get(path) || null;

    if (a && !b) {
      const oldSha = await sha256Hex(a.bytes);
      ops.push({ op: "remove", path, old_sha256: oldSha, old_size: a.size });
      continue;
    }
    if (!a && b) {
      const newSha = await sha256Hex(b.bytes);
      ops.push({
        op: "add",
        path,
        new_b64: encodeBase64(b.bytes),
        new_sha256: newSha,
        new_size: b.size,
        is_text: isProbablyTextFile(path, b.bytes),
      });
      continue;
    }
    if (a && b) {
      // cheap fast path
      if (a.size === b.size) {
        let same = true;
        for (let i = 0; i < a.bytes.length; i++) {
          if (a.bytes[i] !== b.bytes[i]) {
            same = false;
            break;
          }
        }
        if (same) continue;
      }

      const oldSha = await sha256Hex(a.bytes);
      const newSha = await sha256Hex(b.bytes);
      ops.push({
        op: "modify",
        path,
        old_sha256: oldSha,
        new_b64: encodeBase64(b.bytes),
        new_sha256: newSha,
        old_size: a.size,
        new_size: b.size,
        is_text: isProbablyTextFile(path, a.bytes) && isProbablyTextFile(path, b.bytes),
      });
    }
  }

  return {
    schema: "kindred.spec_pack_patch.v1",
    created_at_utc: nowUtc(),
    base_project_id: baseProjectId,
    proposal_project_id: propProjectId,
    summary: opts.summary,
    patch_text: opts.patch_text,
    stats: { ...opts.stats },
    ops,
  };
}

export type ApplyPatchResult =
  | {
      ok: true;
      mergedZip: Uint8Array;
      mergedPack: SpecPack;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      details: string[];
    };

export async function applyPatchToPack(base: SpecPack, patch: SpecPackPatchV1): Promise<ApplyPatchResult> {
  const details: string[] = [];
  const warnings: string[] = [];

  const fileMap = new Map<string, Uint8Array>();
  for (const f of base.files) fileMap.set(f.path, f.bytes);

  for (const op of patch.ops) {
    if (op.op === "add") {
      if (fileMap.has(op.path)) {
        details.push(`ADD would overwrite existing file: ${op.path}`);
        continue;
      }
      const bytes = decodeBase64(op.new_b64);
      const sha = await sha256Hex(bytes);
      if (sha !== op.new_sha256) {
        details.push(`ADD sha mismatch for ${op.path}`);
        continue;
      }
      fileMap.set(op.path, bytes);
      continue;
    }

    if (op.op === "remove") {
      const existing = fileMap.get(op.path);
      if (!existing) {
        warnings.push(`REMOVE missing file (already absent): ${op.path}`);
        continue;
      }
      const sha = await sha256Hex(existing);
      if (sha !== op.old_sha256) {
        details.push(`REMOVE precondition failed for ${op.path} (base file sha mismatch)`);
        continue;
      }
      fileMap.delete(op.path);
      continue;
    }

    if (op.op === "modify") {
      const existing = fileMap.get(op.path);
      if (!existing) {
        details.push(`MODIFY missing base file: ${op.path}`);
        continue;
      }
      const oldSha = await sha256Hex(existing);
      if (oldSha !== op.old_sha256) {
        details.push(`MODIFY precondition failed for ${op.path} (base file sha mismatch)`);
        continue;
      }
      const bytes = decodeBase64(op.new_b64);
      const newSha = await sha256Hex(bytes);
      if (newSha !== op.new_sha256) {
        details.push(`MODIFY sha mismatch for ${op.path}`);
        continue;
      }
      fileMap.set(op.path, bytes);
      continue;
    }
  }

  if (details.length > 0) {
    return {
      ok: false,
      error: "Patch could not be applied cleanly.",
      details,
    };
  }

  // Normalize manifest so the output pack is self-consistent.
  const baseManifest = getManifest(base);
  const preserveProjectId = baseManifest.ok ? baseManifest.manifest.project_id : undefined;
  normalizeManifestFiles(fileMap, preserveProjectId);

  const zipFiles: Record<string, Uint8Array> = {};
  const paths = Array.from(fileMap.keys());
  paths.sort((a, b) => a.localeCompare(b));
  for (const p of paths) zipFiles[p] = fileMap.get(p) as Uint8Array;

  const mergedZip = zipDeterministic(zipFiles, { level: 6 });
  const mergedPack = {
    files: paths.map((p) => {
      const bytes = fileMap.get(p) as Uint8Array;
      return { path: p, bytes, size: bytes.byteLength } as SpecPackFile;
    }),
    fileMap: new Map(paths.map((p) => [p, { path: p, bytes: fileMap.get(p) as Uint8Array, size: (fileMap.get(p) as Uint8Array).byteLength } as SpecPackFile])),
  } as SpecPack;

  return { ok: true, mergedZip, mergedPack, warnings };
}
