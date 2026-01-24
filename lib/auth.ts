"use client";

export type AuthMode = "off" | "cardano_wallet" | "cardano_social";

function normalizeMode(raw: string | undefined | null): AuthMode {
  const v = (raw || "").trim();
  if (v === "cardano_wallet") return "cardano_wallet";
  if (v === "cardano_social") return "cardano_social";
  return "off";
}

/**
 * Authentication is intentionally OFF by default in v1.0.x.
 *
 * When enabled in future releases, the mode will select which provider kit
 * is active. The core kernel stays provider-neutral.
 */
export function getAuthMode(): AuthMode {
  // NEXT_PUBLIC_* is compile-time in Next.js.
  // Fallback to "off" if unset or invalid.
  const raw = (process.env.NEXT_PUBLIC_AUTH_MODE as string | undefined) || "";
  return normalizeMode(raw);
}

export function isAuthEnabled(): boolean {
  return getAuthMode() !== "off";
}

export function authModeLabel(mode: AuthMode): string {
  if (mode === "cardano_wallet") return "Cardano wallet";
  if (mode === "cardano_social") return "Cardano social wallet";
  return "Off";
}

export function authModeSummary(mode: AuthMode): string {
  if (mode === "cardano_wallet") {
    return "Planned: connect a Cardano-compatible wallet and sign a challenge to prove address ownership.";
  }
  if (mode === "cardano_social") {
    return "Planned: social login that yields a Cardano address, with the same signed-challenge model when available.";
  }
  return "v1.0.x ships without accounts or login. The core loop is offline-first and single-user.";
}
