import { zipSync } from "fflate";
import { ZIP_MTIME_UTC } from "./version";

// ZIP timestamps are DOS-based; fflate defaults to "now" which breaks determinism.
export const DETERMINISTIC_ZIP_MTIME = new Date(ZIP_MTIME_UTC);

export function zipDeterministic(files: Record<string, Uint8Array>, opts?: { level?: number }): Uint8Array {
  const level = typeof opts?.level === "number" ? opts.level : 6;
  const paths = Object.keys(files).sort((a, b) => a.localeCompare(b));
  const sorted: Record<string, Uint8Array> = {};
  for (const p of paths) sorted[p] = files[p];
  return zipSync(sorted as any, { level, mtime: DETERMINISTIC_ZIP_MTIME } as any);
}
