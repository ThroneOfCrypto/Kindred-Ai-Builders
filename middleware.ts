import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal API hardening for Kindred AI Builders (baseline).
 *
 * Goals:
 * - Provide a deterministic, zero-dependency request rate limit for /api/* routes.
 * - Block obviously oversized request bodies before route handlers run.
 *
 * Notes:
 * - This is an in-memory limiter. In serverless/edge environments it may reset between invocations.
 * - For GA, consider a durable store (Upstash/Redis) or platform-native rate limiting.
 */

type Entry = { count: number; resetAtMs: number };

// 60 requests per minute per IP (baseline; tune as needed).
const WINDOW_MS = 60_000;
const MAX_REQ_PER_WINDOW = 60;

// 1MB max request body for write methods (baseline).
const MAX_BODY_BYTES = 1_000_000;

const store: Map<string, Entry> = new Map();

function nowMs(): number {
  return Date.now();
}

function getIp(req: NextRequest): string {
  // Prefer proxy header; fall back to req.ip (may be undefined).
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || req.ip || "unknown";
}

function checkRate(ip: string): { ok: boolean; remaining: number; resetAtMs: number } {
  const t = nowMs();
  const cur = store.get(ip);

  if (!cur || t >= cur.resetAtMs) {
    const next: Entry = { count: 1, resetAtMs: t + WINDOW_MS };
    store.set(ip, next);
    return { ok: true, remaining: MAX_REQ_PER_WINDOW - 1, resetAtMs: next.resetAtMs };
  }

  cur.count += 1;
  store.set(ip, cur);

  const remaining = Math.max(0, MAX_REQ_PER_WINDOW - cur.count);
  return { ok: cur.count <= MAX_REQ_PER_WINDOW, remaining, resetAtMs: cur.resetAtMs };
}

function jsonError(status: number, body: any, headers?: Record<string, string>) {
  const res = NextResponse.json(body, { status });
  if (headers) {
    for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  }
  // Always prevent caching error responses.
  res.headers.set("cache-control", "no-store");
  applySecurityHeaders(res);
  return res;
}

function applySecurityHeaders(res: NextResponse) {
  // Baseline secure headers (Deploy Lane). Keep deterministic and conservative.
  // References: OWASP Secure Headers Project.
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("referrer-policy", "no-referrer");
  res.headers.set("x-frame-options", "DENY");
  // Minimal CSP that avoids breaking Next.js runtime while still hardening
  // against clickjacking-style embedding and base-uri shenanigans.
  // NOTE: We intentionally avoid locking down script-src in Bootstrap to
  // prevent accidental breakage from inline Next.js scripts.
  res.headers.set("content-security-policy", "frame-ancestors 'none'; base-uri 'self'");
  res.headers.set("permissions-policy", "geolocation=(), camera=(), microphone=()");
  res.headers.set("cross-origin-opener-policy", "same-origin");
  res.headers.set("cross-origin-resource-policy", "same-origin");
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname || "";

  // Defensive header sanitization.
  // A crafted "x-middleware-subrequest" header has historically been used to
  // bypass middleware execution in some Next.js versions (CVE-2025-29927 class).
  // We remove it pre-emptively to prevent user-controlled middleware hints.
  const sanitizedRequestHeaders = new Headers(req.headers);
  sanitizedRequestHeaders.delete("x-middleware-subrequest");
  sanitizedRequestHeaders.delete("x-middleware-subrequest-id");

  // Director surface: one narrative, no legacy routes.
  // Only allow AI connection + Journey. Everything else redirects.
  if (
    path.startsWith("/director") &&
    path !== "/director" &&
    !path.startsWith("/director/journey") &&
    !path.startsWith("/director/connect-ai")
    && !path.startsWith("/director/import")
    && !path.startsWith("/director/ship")
    && !path.startsWith("/director/start")
  ) {
    const url = req.nextUrl.clone();
    url.pathname = "/director/journey";
    url.searchParams.set("legacy", "1");
    const res = NextResponse.redirect(url);
    res.headers.set("cache-control", "no-store");
    applySecurityHeaders(res);
    return res;
  }

  const isApi = path.startsWith("/api/");
  const ip = getIp(req);

  const rl = isApi ? checkRate(ip) : { ok: true, remaining: MAX_REQ_PER_WINDOW, resetAtMs: nowMs() };

  // Body size guard for write methods (API only).
  if (!isApi) {
    const res = NextResponse.next({ request: { headers: sanitizedRequestHeaders } });
    res.headers.set("cache-control", "no-store");
    applySecurityHeaders(res);
    return res;
  }

  const method = (req.method || "GET").toUpperCase();
  const isWrite = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  if (isWrite) {
    const len = Number(req.headers.get("content-length") || "0");
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      return jsonError(
        413,
        { error: "payload_too_large", max_bytes: MAX_BODY_BYTES },
        { "x-kindred-max-body-bytes": String(MAX_BODY_BYTES) }
      );
    }
  }

  if (!rl.ok) {
    const retryAfterSec = Math.max(1, Math.ceil((rl.resetAtMs - nowMs()) / 1000));
    return jsonError(
      429,
      { error: "rate_limited", window_ms: WINDOW_MS, max_requests: MAX_REQ_PER_WINDOW },
      {
        "retry-after": String(retryAfterSec),
        "x-kindred-rate-limit": String(MAX_REQ_PER_WINDOW),
        "x-kindred-rate-remaining": String(rl.remaining),
      }
    );
  }

  const res = NextResponse.next({ request: { headers: sanitizedRequestHeaders } });
  res.headers.set("x-kindred-rate-limit", String(MAX_REQ_PER_WINDOW));
  res.headers.set("x-kindred-rate-remaining", String(rl.remaining));
  res.headers.set("cache-control", "no-store");
  applySecurityHeaders(res);
  return res;
}

export const config = {
  matcher: ["/api/:path*", "/director/:path*"],
};
