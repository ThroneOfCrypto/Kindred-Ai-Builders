/**
 * API guard helpers.
 * - Strict JSON parsing with size cap (defense-in-depth; middleware also enforces).
 * - Basic type checks for request bodies.
 *
 * These helpers exist to support Publish-Ready Threshold items:
 * - U23 / V6: validate payloads and return safe errors
 * - U25: avoid leaking stack traces and sensitive config
 */

export type GuardResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string; hint?: string };

export async function readJsonWithLimit<T = any>(
  req: Request,
  opts?: { maxBytes?: number; requireContentTypeJson?: boolean }
): Promise<GuardResult<T>> {
  const maxBytes = Math.max(1_024, Math.min(2_000_000, opts?.maxBytes ?? 200_000)); // default 200KB
  const requireCT = opts?.requireContentTypeJson ?? false;

  if (requireCT) {
    const ct = String(req.headers.get("content-type") || "");
    if (!ct.toLowerCase().includes("application/json")) {
      return { ok: false, status: 415, error: "unsupported_media_type", hint: "Expected application/json" };
    }
  }

  // Read body as text with cap
  const reader = req.body?.getReader?.();
  if (!reader) {
    // Fallback: req.json() (may throw)
    try {
      const j = (await req.json()) as T;
      return { ok: true, value: j };
    } catch {
      return { ok: false, status: 400, error: "invalid_json" };
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        return { ok: false, status: 413, error: "payload_too_large", hint: `Max ${maxBytes} bytes` };
      }
      chunks.push(value);
    }
  }

  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8").decode(merged);
    const j = JSON.parse(text) as T;
    return { ok: true, value: j };
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }
}

export function requireString(v: any, name: string, maxLen = 200_000): GuardResult<string> {
  const s = typeof v === "string" ? v : "";
  if (!s) return { ok: false, status: 400, error: "invalid_request", hint: `Missing ${name}` };
  if (s.length > maxLen) return { ok: false, status: 413, error: "payload_too_large", hint: `${name} too large` };
  return { ok: true, value: s };
}

export function requireEnum<T extends string>(v: any, name: string, allowed: readonly T[]): GuardResult<T> {
  const s = typeof v === "string" ? (v as T) : ("" as T);
  if (!allowed.includes(s)) return { ok: false, status: 400, error: "invalid_request", hint: `Invalid ${name}` };
  return { ok: true, value: s };
}

export function requireObject(v: any, name: string): GuardResult<Record<string, any>> {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return { ok: false, status: 400, error: "invalid_request", hint: `Invalid ${name}` };
  }
  return { ok: true, value: v as Record<string, any> };
}
