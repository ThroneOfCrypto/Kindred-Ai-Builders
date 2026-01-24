"use client";

import { strToU8, strFromU8 } from "fflate";
import { SpecPack, SpecPackFile, getManifest, tryParseJson } from "./spec_pack";
import { zipDeterministic } from "./deterministic_zip";
import { stableJsonText } from "./stable_json";
import { APP_VERSION, VALIDATOR_VERSION, SPEC_PACK_VERSION, ZIP_MTIME_UTC } from "./version";

function nowUtc(): string {
  // Determinism: merges should not introduce wall-clock time.
  return ZIP_MTIME_UTC;
}

function pretty(obj: any): string {
  return stableJsonText(obj, 2);
}

export type MergeSource = "base" | "current" | "secondary";

export type MergeGroups = {
  tokens: MergeSource;
  layout: MergeSource;
  brand: MergeSource;
  ux: MergeSource;
  copy: MergeSource;
};

const GROUP_PATHS: Record<keyof MergeGroups, string[]> = {
  tokens: ["design/tokens.json", "design/tokens_compiled.json"],
  layout: ["design/ia_tree.json", "design/lofi_layouts.json"],
  brand: ["design/profile.json", "design/references.json", "intent/brief.json"],
  ux: ["kernel_min/actors.json", "kernel_min/scenes.json", "kernel_min/flows.json", "ux/actors.json", "ux/scenes.json", "ux/flows.json"],
  copy: ["content/copy_blocks.json"],
};

function preserveProjectId(base: SpecPack): string {
  const m = getManifest(base);
  return m.ok ? m.manifest.project_id : "project";
}

function normalizeManifestFiles(fileMap: Map<string, Uint8Array>, projectId: string) {
  const paths = Array.from(fileMap.keys()).filter((p) => p !== "spec_pack_manifest.json");
  paths.sort((a, b) => a.localeCompare(b));
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

export function buildPackFromFileMap(fileMap: Map<string, Uint8Array>, projectId: string): { pack: SpecPack; zip: Uint8Array } {
  normalizeManifestFiles(fileMap, projectId);

  const paths = Array.from(fileMap.keys());
  paths.sort((a, b) => a.localeCompare(b));

  const zipFiles: Record<string, Uint8Array> = {};
  for (const p of paths) zipFiles[p] = fileMap.get(p) as Uint8Array;
  const zip = zipDeterministic(zipFiles, { level: 6 });

  const files: SpecPackFile[] = paths.map((p) => {
    const bytes = fileMap.get(p) as Uint8Array;
    return { path: p, bytes, size: bytes.byteLength };
  });
  const pack: SpecPack = { files, fileMap: new Map(files.map((f) => [f.path, f])) };
  return { pack, zip };
}

export type MergeResult =
  | { ok: true; merged: SpecPack; mergedZip: Uint8Array; warnings: string[] }
  | { ok: false; error: string };

export function mergeProposalGroups(opts: {
  base: SpecPack;
  current: SpecPack;
  secondary: SpecPack;
  groups: MergeGroups;
}): MergeResult {
  const base = opts.base;
  const current = opts.current;
  const secondary = opts.secondary;
  const groups = opts.groups;

  const warnings: string[] = [];

  const fileMap = new Map<string, Uint8Array>();
  for (const f of base.files) fileMap.set(f.path, f.bytes);

  const sources: Record<MergeSource, SpecPack> = {
    base,
    current,
    secondary,
  };

  (Object.keys(GROUP_PATHS) as (keyof MergeGroups)[]).forEach((groupKey) => {
    const sourceKey = groups[groupKey];
    if (sourceKey === "base") return;
    const src = sources[sourceKey];
    for (const path of GROUP_PATHS[groupKey]) {
      const f = src.fileMap.get(path);
      if (!f) {
        warnings.push(`Merge: ${groupKey} asked for ${sourceKey}, but missing file: ${path}`);
        continue;
      }
      fileMap.set(path, f.bytes);
    }
  });

  const projectId = preserveProjectId(base);
  const built = buildPackFromFileMap(fileMap, projectId);
  return { ok: true, merged: built.pack, mergedZip: built.zip, warnings };
}

export function describePack(pack: SpecPack): string {
  const m = getManifest(pack);
  if (m.ok) return `project=${m.manifest.project_id} files=${pack.files.length}`;
  const mf = pack.fileMap.get("spec_pack_manifest.json");
  if (mf) {
    const parsed = tryParseJson<any>(strFromU8(mf.bytes));
    if (parsed.ok && typeof parsed.value?.project_id === "string") {
      return `project=${String(parsed.value.project_id)} files=${pack.files.length}`;
    }
  }
  return `files=${pack.files.length}`;
}
