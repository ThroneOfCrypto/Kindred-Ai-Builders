"use client";

import { unzipSync, strFromU8 } from "fflate";

export type SpecPackFile = {
  path: string;
  bytes: Uint8Array;
  size: number;
};

export type SpecPack = {
  files: SpecPackFile[];
  fileMap: Map<string, SpecPackFile>;
};

export type ManifestV1 = {
  schema: "kindred.spec_pack_manifest.v1";
  created_at_utc: string;
  project_id: string;
  contents: string[];
  // Optional metadata (v0.30+). Safe for older readers to ignore.
  spec_pack_version?: string;
  provenance?: {
    app_version?: string;
    validator_version?: string;
  };
};

export function readZip(bytes: Uint8Array): SpecPack {
  const out = unzipSync(bytes);
  const files: SpecPackFile[] = Object.entries(out)
    .filter(([path]) => !!path && !path.endsWith("/"))
    .map(([path, buf]) => ({
      path,
      bytes: buf,
      size: buf.byteLength,
    }));
  files.sort((a, b) => a.path.localeCompare(b.path));
  const fileMap = new Map<string, SpecPackFile>();
  for (const f of files) fileMap.set(f.path, f);
  return { files, fileMap };
}

export type ZipReadError = {
  code: "INVALID_ZIP" | "EMPTY_ZIP";
  message: string;
};

export function tryReadZip(bytes: Uint8Array): { ok: true; pack: SpecPack } | { ok: false; error: ZipReadError } {
  if (!bytes || bytes.byteLength < 4) {
    return { ok: false, error: { code: "INVALID_ZIP", message: "ZIP is empty or incomplete." } };
  }
  try {
    const pack = readZip(bytes);
    if (!pack.files || pack.files.length === 0) {
      return { ok: false, error: { code: "EMPTY_ZIP", message: "ZIP contains no files." } };
    }
    return { ok: true, pack };
  } catch (e: any) {
    return { ok: false, error: { code: "INVALID_ZIP", message: String(e?.message || e) } };
  }
}

export function looksLikeRepoZip(pack: SpecPack): boolean {
  if (pack.fileMap.has("package.json")) return true;
  if (pack.fileMap.has("next.config.js") || pack.fileMap.has("next.config.mjs")) return true;
  // Common Next.js repo paths.
  for (const p of pack.fileMap.keys()) {
    if (p.startsWith("app/") || p.startsWith("pages/")) return true;
  }
  return false;
}

export function asText(file: SpecPackFile): string {
  return strFromU8(file.bytes);
}

export function tryParseJson<T = any>(text: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export function getManifest(pack: SpecPack): { ok: true; manifest: ManifestV1 } | { ok: false; error: string } {
  const f = pack.fileMap.get("spec_pack_manifest.json");
  if (!f) return { ok: false, error: "Missing spec_pack_manifest.json" };
  const parsed = tryParseJson<ManifestV1>(asText(f));
  if (!parsed.ok) return { ok: false, error: `Manifest JSON invalid: ${parsed.error}` };
  const m = parsed.value;
  if (m?.schema !== "kindred.spec_pack_manifest.v1") return { ok: false, error: "Manifest schema mismatch" };
  if (!Array.isArray(m.contents)) return { ok: false, error: "Manifest contents must be an array" };
  return { ok: true, manifest: m };
}

export function validateManifest(pack: SpecPack): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const m = getManifest(pack);
  if (!m.ok) return { ok: false, issues: [m.error] };
  const manifest = m.manifest;

  // Check that all manifest contents exist in zip.
  for (const path of manifest.contents) {
    if (!pack.fileMap.has(path)) issues.push(`Manifest refers to missing file: ${path}`);
  }

  // Warn about extra files not in manifest.
  const listed = new Set(manifest.contents.concat(["spec_pack_manifest.json"]));
  for (const f of pack.files) {
    if (!listed.has(f.path)) issues.push(`Extra file not listed in manifest: ${f.path}`);
  }

  return { ok: issues.length === 0, issues };
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

export function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
