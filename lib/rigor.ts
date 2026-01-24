"use client";

// ---------------------------------------------------------------------------
// Rigor dial v1
//
// Purpose:
// - Let a beginner stay on "safe" defaults while enabling stricter bars.
// - Never changes artefacts automatically.
// - Only affects how we interpret PASS/WARN/FAIL in guided rails.
// ---------------------------------------------------------------------------

export type RigorLevelV1 = "safe" | "strict" | "audit";

export type RigorConfigV1 = {
  schema: "kindred.rigor_config.v1";
  level: RigorLevelV1;
  updated_at_utc: string;
};

const KEY_PREFIX = "kindred_rigor_v1:";

function keyForProject(projectId: string): string {
  return `${KEY_PREFIX}${String(projectId || "").trim() || "default"}`;
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

export function defaultRigorConfig(): RigorConfigV1 {
  return {
    schema: "kindred.rigor_config.v1",
    level: "safe",
    updated_at_utc: new Date().toISOString(),
  };
}

export function getRigorConfig(projectId: string): RigorConfigV1 {
  const pid = String(projectId || "").trim() || "default";
  try {
    const raw = localStorage.getItem(keyForProject(pid));
    if (!raw) return defaultRigorConfig();
    const parsed = safeJsonParse<any>(raw);
    if (!parsed || parsed.schema !== "kindred.rigor_config.v1") return defaultRigorConfig();
    const level = String(parsed.level || "").trim();
    if (level !== "safe" && level !== "strict" && level !== "audit") return defaultRigorConfig();
    return {
      schema: "kindred.rigor_config.v1",
      level: level as RigorLevelV1,
      updated_at_utc: typeof parsed.updated_at_utc === "string" ? parsed.updated_at_utc : new Date().toISOString(),
    };
  } catch {
    return defaultRigorConfig();
  }
}

export function setRigorLevel(projectId: string, level: RigorLevelV1): RigorConfigV1 {
  const pid = String(projectId || "").trim() || "default";
  const next: RigorConfigV1 = {
    schema: "kindred.rigor_config.v1",
    level,
    updated_at_utc: new Date().toISOString(),
  };
  try {
    localStorage.setItem(keyForProject(pid), JSON.stringify(next));
  } catch {
    // ignore
  }
  dispatch("kindred_rigor_changed");
  return next;
}

export type Tri = "pass" | "warn" | "fail";

/**
 * Interpret a Tri value under the rigor dial.
 *
 * Safe: warnings remain warnings.
 * Strict/Audit: warnings are treated as failures (the bar is higher).
 */
export function coerceTriByRigor(tri: Tri, rigor: RigorLevelV1): Tri {
  if (rigor === "safe") return tri;
  if (tri === "warn") return "fail";
  return tri;
}
