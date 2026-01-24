import { unzipSync, strFromU8, strToU8 } from "fflate";
import { zipDeterministic } from "../deterministic_zip";
import { stableJsonText } from "../stable_json";

export function decodeBase64ToBytes(b64: string): Uint8Array {
  const clean = (b64 || "").trim();
  if (!clean) return new Uint8Array();
  const buf = Buffer.from(clean, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function encodeBytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function readZipBytes(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const files = unzipSync(bytes);
  for (const [path, v] of Object.entries(files)) {
    if (v instanceof Uint8Array) out.set(path, v);
  }
  return out;
}

export function writeZipBytes(files: Map<string, Uint8Array>): Uint8Array {
  const obj: Record<string, Uint8Array> = {};
  const paths = Array.from(files.keys()).sort((a, b) => a.localeCompare(b));
  for (const p of paths) obj[p] = files.get(p) as Uint8Array;
  return zipDeterministic(obj, { level: 6 });
}

export function readText(files: Map<string, Uint8Array>, path: string): string | null {
  const b = files.get(path);
  if (!b) return null;
  return strFromU8(b);
}

export function writeText(files: Map<string, Uint8Array>, path: string, text: string) {
  files.set(path, strToU8(text));
}

export function readJson<T = any>(files: Map<string, Uint8Array>, path: string): T | null {
  const t = readText(files, path);
  if (t == null) return null;
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

export function writeJson(files: Map<string, Uint8Array>, path: string, obj: any) {
  const text = stableJsonText(obj, 2);
  writeText(files, path, text);
}
