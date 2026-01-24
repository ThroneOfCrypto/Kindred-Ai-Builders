"use client";

export function ext(path: string): string {
  const i = path.lastIndexOf(".");
  if (i === -1) return "";
  return path.slice(i + 1).toLowerCase();
}

export function looksTextByExt(path: string): boolean {
  const e = ext(path);
  return (
    e === "json" ||
    e === "md" ||
    e === "txt" ||
    e === "yaml" ||
    e === "yml" ||
    e === "toml" ||
    e === "csv" ||
    e === "ts" ||
    e === "tsx" ||
    e === "js" ||
    e === "jsx" ||
    e === "css" ||
    e === "html" ||
    e === "spel" ||
    e === "xml" ||
    e === "env" ||
    e === "gitignore"
  );
}

export function looksBinaryByContent(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 2048);
  if (n === 0) return false;
  let weird = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) return true;
    const isPrintable = b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126);
    if (!isPrintable) weird += 1;
  }
  return weird / n > 0.22;
}

export function isProbablyTextFile(path: string, bytes: Uint8Array): boolean {
  if (looksTextByExt(path)) return true;
  if (looksBinaryByContent(bytes)) return false;
  return true;
}
