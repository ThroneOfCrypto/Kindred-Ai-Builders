"use client";

import { strFromU8 } from "fflate";
import type { SpecPack } from "./spec_pack";
import type { PaletteId } from "./types";
import type { BrownfieldInventoryReportV1 } from "./brownfield";

export type BrownfieldDeltaRiskHintV1 = {
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  evidence?: string[];
};

export type BrownfieldDeltaRouteMappingV1 = {
  current_route: string;
  status: "kept" | "removed";
  desired_page_id?: string;
  desired_title?: string;
  suggested_desired_route?: string;
  score?: number;
  note?: string;
};

export type BrownfieldDeltaReportV1 = {
  schema: "kindred.brownfield_delta_report.v1";
  base: {
    project_id?: string;
    created_at_utc?: string;
    pack_sha256?: string;
    has_brownfield_inventory: boolean;
  };
  proposal: {
    project_id?: string;
    created_at_utc?: string;
    pack_sha256?: string;
  };
  routes: {
    current: string[];
    desired: string[];
    added: string[];
    removed: string[];
    unchanged: string[];
    mappings: BrownfieldDeltaRouteMappingV1[];
  };
  env: {
    current_names: string[];
    desired_required_env_names: string[];
    current_not_tracked_in_desired: string[];
    required_not_in_current: string[];
    suggestions_required_env_names: string[];
  };
  deps: {
    current_dependencies: string[];
  };
  risks: BrownfieldDeltaRiskHintV1[];
};

function readText(pack: SpecPack, path: string): string | null {
  const f = pack.fileMap.get(path);
  if (!f) return null;
  try {
    return strFromU8(f.bytes);
  } catch {
    return null;
  }
}

function readJson(pack: SpecPack, path: string): any | null {
  const t = readText(pack, path);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function uniqSorted(arr: string[]): string[] {
  const out = Array.from(
    new Set(
      (arr || [])
        .map((x) => String(x || "").trim())
        .filter((x) => x.length > 0)
    )
  );
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function normalizeRoutePath(p: string): string {
  let s = String(p || "").trim();
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/+$/g, "");
  if (s === "") s = "/";
  return s;
}

function routeSegments(route: string): string[] {
  const s = normalizeRoutePath(route);
  return s
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function routeSimilarity(a: string, b: string): number {
  const aa = routeSegments(a);
  const bb = routeSegments(b);
  if (aa.length === 0 && bb.length === 0) return 1;
  if (aa.length === 0 || bb.length === 0) return 0;

  const setA = new Set(aa);
  const setB = new Set(bb);
  const inter = Array.from(setA).filter((x) => setB.has(x)).length;
  const union = new Set([...aa, ...bb]).size;
  const jaccard = union === 0 ? 0 : inter / union;

  let prefix = 0;
  for (let i = 0; i < Math.min(aa.length, bb.length); i += 1) {
    if (aa[i] === bb[i]) prefix += 1;
    else break;
  }
  const prefixScore = prefix / Math.max(aa.length, bb.length);

  const tailA = aa[aa.length - 1];
  const tailB = bb[bb.length - 1];
  const tailScore = tailA && tailB && tailA === tailB ? 1 : 0;

  // Weighted to prefer common prefixes and same leaf.
  return 0.55 * prefixScore + 0.35 * jaccard + 0.10 * tailScore;
}

function bestRouteSuggestion(current: string, desiredRoutes: string[]): { route: string; score: number } | null {
  let best: { route: string; score: number } | null = null;
  for (const r of desiredRoutes) {
    const score = routeSimilarity(current, r);
    if (!best || score > best.score) best = { route: r, score };
  }
  return best;
}

function readIaRoutes(pack: SpecPack): Array<{ id?: string; title?: string; route_path: string }> {
  const ia = readJson(pack, "design/ia_tree.json");
  const pages = Array.isArray(ia?.pages) ? ia.pages : [];
  const out: Array<{ id?: string; title?: string; route_path: string }> = [];
  for (const p of pages) {
    const id = typeof p?.id === "string" ? p.id : undefined;
    const title = typeof p?.title === "string" ? p.title : undefined;
    const route_path = typeof p?.route_path === "string" && p.route_path.trim() ? normalizeRoutePath(p.route_path) : id ? normalizeRoutePath("/" + id) : "/";
    out.push({ id, title, route_path });
  }
  // de-dupe by route_path
  const map = new Map<string, { id?: string; title?: string; route_path: string }>();
  for (const r of out) {
    if (!map.has(r.route_path)) map.set(r.route_path, r);
  }
  return Array.from(map.values()).sort((a, b) => a.route_path.localeCompare(b.route_path));
}

function readConstraints(pack: SpecPack): { offline_first?: boolean; no_payments?: boolean; required_env_names: string[] } {
  const c = readJson(pack, "intent/constraints.json") || {};
  const required_env_names = Array.isArray(c?.required_env_names) ? uniqSorted(c.required_env_names) : [];
  return {
    offline_first: typeof c?.offline_first === "boolean" ? c.offline_first : undefined,
    no_payments: typeof c?.no_payments === "boolean" ? c.no_payments : undefined,
    required_env_names,
  };
}

function readPalettes(pack: SpecPack): PaletteId[] {
  const p = readJson(pack, "intent/palettes.json");
  const arr = Array.isArray(p?.palettes) ? p.palettes : [];
  return arr
    .map((x: any) => String(x || "").trim())
    .filter((x: string) => x.length > 0) as PaletteId[];
}

function readBrownfieldReport(pack: SpecPack): BrownfieldInventoryReportV1 | null {
  const inv = readJson(pack, "brownfield/inventory.json");
  const report = inv && typeof inv === "object" ? inv.report : null;
  if (!report || typeof report !== "object") return null;
  return report as BrownfieldInventoryReportV1;
}

function appendRisk(risks: BrownfieldDeltaRiskHintV1[], hint: BrownfieldDeltaRiskHintV1): void {
  // De-dupe by (code,message)
  const key = `${hint.code}::${hint.message}`;
  const seen = new Set(risks.map((x) => `${x.code}::${x.message}`));
  if (seen.has(key)) return;
  risks.push(hint);
}

export function computeBrownfieldDeltaReport(args: {
  basePack: SpecPack;
  proposalPack: SpecPack;
  baseMeta?: { project_id?: string; created_at_utc?: string } | null;
  proposalMeta?: { project_id?: string; created_at_utc?: string } | null;
  basePackSha256?: string | null;
  proposalPackSha256?: string | null;
}): BrownfieldDeltaReportV1 {
  const baseIa = readIaRoutes(args.basePack);
  const proposalIa = readIaRoutes(args.proposalPack);

  const currentRoutes = baseIa.map((x) => x.route_path);
  const desiredRoutes = proposalIa.map((x) => x.route_path);

  const setCurrent = new Set(currentRoutes);
  const setDesired = new Set(desiredRoutes);

  const added = desiredRoutes.filter((r) => !setCurrent.has(r));
  const removed = currentRoutes.filter((r) => !setDesired.has(r));
  const unchanged = desiredRoutes.filter((r) => setCurrent.has(r));

  const mappings: BrownfieldDeltaRouteMappingV1[] = [];
  const desiredByRoute = new Map<string, { id?: string; title?: string }>();
  for (const d of proposalIa) {
    desiredByRoute.set(d.route_path, { id: d.id, title: d.title });
  }

  for (const r of currentRoutes) {
    const exact = desiredByRoute.get(r);
    if (exact) {
      mappings.push({
        current_route: r,
        status: "kept",
        desired_page_id: exact.id,
        desired_title: exact.title,
      });
      continue;
    }
    const best = bestRouteSuggestion(r, desiredRoutes);
    const suggested = best && best.score >= 0.25 ? best.route : undefined;
    const sugMeta = suggested ? desiredByRoute.get(suggested) : undefined;
    mappings.push({
      current_route: r,
      status: "removed",
      suggested_desired_route: suggested,
      desired_page_id: sugMeta?.id,
      desired_title: sugMeta?.title,
      score: best ? Math.round(best.score * 1000) / 1000 : undefined,
      note: suggested ? "Suggested closest desired route by path similarity." : "No close match found in desired IA.",
    });
  }

  const baseConstraints = readConstraints(args.basePack);
  const proposalConstraints = readConstraints(args.proposalPack);

  const baseReport = readBrownfieldReport(args.basePack);

  // Prefer the base pack's constraints.required_env_names (current-state spec pack includes it).
  const currentEnvNames = baseConstraints.required_env_names.length > 0
    ? baseConstraints.required_env_names
    : baseReport
      ? uniqSorted(baseReport.env?.names || [])
      : [];

  const desiredRequiredEnv = proposalConstraints.required_env_names;

  const setCurEnv = new Set(currentEnvNames);
  const setReqEnv = new Set(desiredRequiredEnv);

  const currentNotTrackedInDesired = currentEnvNames.filter((n) => !setReqEnv.has(n));
  const requiredNotInCurrent = desiredRequiredEnv.filter((n) => !setCurEnv.has(n));

  const suggestionsRequiredEnvNames = desiredRequiredEnv.length === 0 && currentEnvNames.length > 0 ? currentEnvNames : [];

  const risks: BrownfieldDeltaRiskHintV1[] = [];

  if (removed.length > 0) {
    appendRisk(risks, {
      severity: "warn",
      code: "ROUTES_REMOVED",
      message: `${removed.length} current routes are missing from the desired IA. Review redirects, deep links, and navigation.`,
      evidence: removed.slice(0, 10),
    });
  }

  if (added.length > 0) {
    appendRisk(risks, {
      severity: "info",
      code: "ROUTES_ADDED",
      message: `${added.length} new routes exist in the desired IA that are not in the current route map (new surface area).`,
      evidence: added.slice(0, 10),
    });
  }

  const churn = removed.length + added.length;
  const denom = Math.max(1, Math.max(currentRoutes.length, desiredRoutes.length));
  const churnRatio = churn / denom;
  if (churnRatio >= 0.4 && churn >= 4) {
    appendRisk(risks, {
      severity: "warn",
      code: "ROUTE_CHURN_HIGH",
      message: `Route churn is high (${Math.round(churnRatio * 100)}% of the larger route set). Consider staging changes and using redirects.`,
    });
  }

  if (currentEnvNames.length > 0 && desiredRequiredEnv.length === 0) {
    appendRisk(risks, {
      severity: "warn",
      code: "ENV_REQUIREMENTS_UNSET",
      message: `Current-state env names exist (${currentEnvNames.length}), but desired constraints do not list required env var names. Add required_env_names to intent/constraints.json.`,
    });
  }

  if (requiredNotInCurrent.length > 0) {
    appendRisk(risks, {
      severity: "warn",
      code: "REQUIRED_ENV_NOT_IN_CURRENT",
      message: `${requiredNotInCurrent.length} required env var names in desired constraints are not present in the current env name list (new infra / config).`,
      evidence: requiredNotInCurrent.slice(0, 10),
    });
  }

  // Bring forward base brownfield risks (still relevant context).
  if (baseReport) {
    for (const r of baseReport.risks || []) {
      appendRisk(risks, {
        severity: r.severity,
        code: `BF_${r.code}`,
        message: r.message,
        evidence: r.evidence,
      });
    }
    for (const r of baseReport.env?.risks || []) {
      appendRisk(risks, {
        severity: r.severity,
        code: `BF_ENV_${r.code}`,
        message: r.message,
      });
    }
  }

  // Dependency → risk hints (light heuristics).
  const deps = baseReport?.dependencies?.dependencies || {};
  const depNames = uniqSorted(Object.keys(deps));
  const desiredPalettes = readPalettes(args.proposalPack);

  const usesPrisma = depNames.includes("prisma") || depNames.includes("@prisma/client");
  if (usesPrisma && proposalConstraints.offline_first === true) {
    appendRisk(risks, {
      severity: "warn",
      code: "OFFLINE_FIRST_WITH_SERVER_DB",
      message: `Desired constraints are offline-first, but current dependencies include Prisma. Verify the offline-first boundary and ensure the product still works with degraded connectivity.`,
      evidence: ["prisma"],
    });
  }

  if (usesPrisma && desiredPalettes.includes("commerce_value" as PaletteId)) {
    appendRisk(risks, {
      severity: "warn",
      code: "PRISMA_COMMERCE_RISK",
      message: `Commerce changes with Prisma often require schema/migration discipline. Plan migrations and seed data before shipping.`,
      evidence: ["prisma", "commerce_value"],
    });
  }

  const hasPaymentsDeps = depNames.some((n) => ["stripe", "@stripe/stripe-js", "@stripe/react-stripe-js", "paypal"].includes(n));
  if (hasPaymentsDeps && proposalConstraints.no_payments === true) {
    appendRisk(risks, {
      severity: "warn",
      code: "PAYMENTS_DISABLED_BUT_DEPS_PRESENT",
      message: `Desired constraints disallow payments, but current dependencies include a payments library. Confirm intent and remove/contain payment flows.`,
    });
  }

  // Ensure stable ordering for display/download.
  const risksSorted = [...risks].sort((a, b) => {
    const s = (x: BrownfieldDeltaRiskHintV1) => (x.severity === "error" ? 0 : x.severity === "warn" ? 1 : 2);
    const ds = s(a) - s(b);
    if (ds !== 0) return ds;
    const c = a.code.localeCompare(b.code);
    if (c !== 0) return c;
    return a.message.localeCompare(b.message);
  });

  return {
    schema: "kindred.brownfield_delta_report.v1",
    base: {
      project_id: args.baseMeta?.project_id,
      created_at_utc: args.baseMeta?.created_at_utc,
      pack_sha256: args.basePackSha256 || undefined,
      has_brownfield_inventory: !!baseReport,
    },
    proposal: {
      project_id: args.proposalMeta?.project_id,
      created_at_utc: args.proposalMeta?.created_at_utc,
      pack_sha256: args.proposalPackSha256 || undefined,
    },
    routes: {
      current: [...currentRoutes],
      desired: [...desiredRoutes],
      added: [...added],
      removed: [...removed],
      unchanged: [...unchanged],
      mappings,
    },
    env: {
      current_names: [...currentEnvNames],
      desired_required_env_names: [...desiredRequiredEnv],
      current_not_tracked_in_desired: [...currentNotTrackedInDesired],
      required_not_in_current: [...requiredNotInCurrent],
      suggestions_required_env_names: [...suggestionsRequiredEnvNames],
    },
    deps: {
      current_dependencies: depNames,
    },
    risks: risksSorted,
  };
}
