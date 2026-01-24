"use client";

export type JsonPointerToken = string | number;

function decodeToken(raw: string): string {
  return raw.replace(/~1/g, "/").replace(/~0/g, "~");
}

function encodeToken(raw: string): string {
  return String(raw).replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Parse a JSON Pointer (RFC 6901-ish). This is intentionally tolerant:
 * - "" or null -> []
 * - missing leading "/" -> treated as "/<ptr>" for convenience
 */
export function parseJsonPointer(ptr: string | null | undefined): string[] {
  const p = String(ptr || "").trim();
  if (!p) return [];
  if (p === "/") return [""];
  const src = p.startsWith("/") ? p.slice(1) : p;
  if (!src) return [];
  return src.split("/").map(decodeToken);
}

export function joinJsonPointer(tokens: (string | number)[]): string {
  if (!tokens || tokens.length === 0) return "";
  return "/" + tokens.map((t) => encodeToken(String(t))).join("/");
}

export function getAtPointer(input: any, ptr: string | null | undefined):
  | { ok: true; value: any }
  | { ok: false; error: string } {
  const tokens = parseJsonPointer(ptr);
  let cur: any = input;
  for (const tok of tokens) {
    if (cur === null || cur === undefined) return { ok: false, error: "Pointer traverses null/undefined" };
    if (Array.isArray(cur)) {
      const idx = Number(tok);
      if (!Number.isFinite(idx) || String(idx) !== String(tok)) return { ok: false, error: "Pointer token is not a valid array index" };
      if (idx < 0 || idx >= cur.length) return { ok: false, error: "Array index out of range" };
      cur = cur[idx];
      continue;
    }
    if (typeof cur === "object") {
      if (!(tok in cur)) return { ok: false, error: `Key not found: ${tok}` };
      cur = (cur as any)[tok];
      continue;
    }
    return { ok: false, error: "Pointer traverses a primitive" };
  }
  return { ok: true, value: cur };
}
