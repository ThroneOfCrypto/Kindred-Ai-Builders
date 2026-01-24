import type { PaletteId } from "./types";
import type { BrownfieldReportV1 } from "./brownfield_scan";
import type { BrownfieldRouteMapV1 } from "./brownfield_routes";

const ZIP_MTIME_UTC = "1980-01-01T00:00:00.000Z";

const VALID_PALETTES: PaletteId[] = [
  "identity_access",
  "communication_social",
  "content_media",
  "knowledge_learning",
  "search_navigation",
  "matching_recommendation",
  "collaboration_work",
  "commerce_value",
  "governance_policy",
  "reputation_safety",
  "game_incentives",
  "automation_workflows",
  "infrastructure_data_files",
  "connection_integration",
];

function normalizeRoute(r: string): string {
  let x = String(r || "");
  if (!x.startsWith("/")) x = "/" + x;
  if (x.length > 1 && x.endsWith("/")) x = x.slice(0, -1);
  return x;
}

function uniqSorted<T>(xs: T[]): T[] {
  return Array.from(new Set(xs as any)).sort((a: any, b: any) => String(a).localeCompare(String(b)));
}

function hasPath(routes: string[], re: RegExp): boolean {
  return routes.some((r) => re.test(r));
}

export function brownfieldInferPalettesV1(args: {
  report: BrownfieldReportV1;
  route_map: BrownfieldRouteMapV1;
}): PaletteId[] {
  const routes = (args.route_map?.routes || [])
    .filter((r) => r && r.kind === "page")
    .map((r) => normalizeRoute(r.route));

  const out: PaletteId[] = [];

  // Minimal, bias-to-safety heuristics (deterministic).
  if (routes.length > 0) out.push("search_navigation");
  if (hasPath(routes, /^\/(docs|blog|articles?)($|\/)/)) out.push("content_media");
  if (hasPath(routes, /^\/(learn|academy|kb|knowledge|help)($|\/)/)) out.push("knowledge_learning");
  if (hasPath(routes, /^\/(login|signup|sign-in|sign-up|auth|account)($|\/)/) || hasPath(routes, /^\/(admin|dashboard|settings)($|\/)/)) {
    out.push("identity_access");
  }
  if (hasPath(routes, /^\/(search|browse|explore)($|\/)/)) out.push("search_navigation");
  if (hasPath(routes, /^\/(match|recommend|suggest)($|\/)/)) out.push("matching_recommendation");
  if (hasPath(routes, /^\/(chat|messages?|notifications?)($|\/)/)) out.push("communication_social");
  if (hasPath(routes, /^\/(projects?|tasks?|work)($|\/)/)) out.push("collaboration_work");
  if (hasPath(routes, /^\/(pricing|checkout|cart|pay|subscribe|billing)($|\/)/)) out.push("commerce_value");
  if (hasPath(routes, /^\/(govern|proposals?|vote|policy|rules)($|\/)/)) out.push("governance_policy");
  if (hasPath(routes, /^\/(report|moderation|safety|trust)($|\/)/)) out.push("reputation_safety");
  if (hasPath(routes, /^\/(automation|workflows?|jobs?)($|\/)/)) out.push("automation_workflows");
  if (hasPath(routes, /^\/(files?|storage|uploads?)($|\/)/)) out.push("infrastructure_data_files");
  if (hasPath(routes, /^\/(integrations?|webhooks?|api-keys?)($|\/)/)) out.push("connection_integration");

  // If no routes or no hits, default to content+nav as a harmless baseline.
  if (out.length === 0) out.push("content_media", "search_navigation");

  // Enforce valid palette ids and stable ordering.
  const filtered = out.filter((p) => VALID_PALETTES.includes(p));
  return uniqSorted(filtered);
}

function sceneIdFromRoute(route: string): string {
  const r = normalizeRoute(route);
  if (r === "/") return "home";
  let base = r.slice(1)
    .replaceAll("/", "__")
    .replaceAll("[", "")
    .replaceAll("]", "")
    .replaceAll("...", "all")
    .replace(/[^A-Za-z0-9_\-]/g, "_");
  if (!base) base = "home";
  return base.toLowerCase();
}

function titleFromRoute(route: string): string {
  const r = normalizeRoute(route);
  if (r === "/") return "Home";
  const segs = r
    .slice(1)
    .split("/")
    .map((s) => s.replaceAll("[", "").replaceAll("]", "").replaceAll("...", ""))
    .filter(Boolean);
  if (!segs.length) return "Untitled";
  return segs
    .join(" ")
    .replace(/[_\-]+/g, " ")
    .split(/\s+/g)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function brownfieldHeuristicInferenceV1(args: {
  report: BrownfieldReportV1;
  route_map: BrownfieldRouteMapV1;
}): { created_utc: string; palettes: PaletteId[]; spel: string; notes_md: string } {
  const palettes = brownfieldInferPalettesV1(args);

  const pages = (args.route_map?.routes || []).filter((r) => r && r.kind === "page");
  const routes = uniqSorted(pages.map((r) => normalizeRoute(r.route)));

  const sceneIds = routes.map((rt) => ({ route: rt, id: sceneIdFromRoute(rt), title: titleFromRoute(rt) }));
  const entryId = sceneIds.find((s) => s.route === "/")?.id || sceneIds[0]?.id || "home";

  const hasAdmin = routes.some((r) => /^\/(admin|dashboard|settings)($|\/)/.test(r));

  const spel: string[] = [];
  spel.push("# Brownfield inferred SPEL module (heuristic)");
  spel.push("# Proposal-only: safe defaults + structural extraction. No telepathy.");
  spel.push("");

  spel.push("palettes:");
  for (const p of palettes) spel.push(`  - ${p}`);
  spel.push("");

  spel.push("actors:");
  spel.push("  visitor:");
  spel.push("    display_name: Visitor");
  if (hasAdmin) {
    spel.push("  admin:");
    spel.push("    display_name: Admin");
  }
  spel.push("");

  spel.push("scenes:");
  if (sceneIds.length === 0) {
    spel.push("  home:");
    spel.push('    title: "Home"');
    spel.push("    entry: true");
    spel.push("    actors: [visitor]");
  } else {
    for (const s of sceneIds) {
      spel.push(`  ${s.id}:`);
      spel.push(`    title: ${JSON.stringify(s.title)}`);
      if (s.id === entryId) spel.push("    entry: true");
      spel.push(`    actors: [${hasAdmin && /^admin|dashboard|settings/.test(s.id) ? "admin" : "visitor"}]`);
    }
  }
  spel.push("");

  // Group flows by first segment for quick browsing.
  const byTop = new Map<string, string[]>();
  for (const rt of routes) {
    const r = normalizeRoute(rt);
    const top = r === "/" ? "primary" : (r.split("/")[1] || "primary");
    const arr = byTop.get(top) || [];
    arr.push(sceneIdFromRoute(r));
    byTop.set(top, arr);
  }

  spel.push("flows:");
  const flowKeys = Array.from(byTop.keys()).sort((a, b) => a.localeCompare(b));
  for (const fk of flowKeys) {
    const scenes = uniqSorted(byTop.get(fk) || []);
    spel.push(`  - id: ${fk}`);
    spel.push(`    scenes: [${scenes.join(", ")}]`);
  }
  spel.push("");

  spel.push("locks:");
  spel.push("  adopted: []");
  spel.push("");

  const notes: string[] = [];
  notes.push("# Brownfield inference notes");
  notes.push("");
  notes.push(`Created (stable): ${ZIP_MTIME_UTC}`);
  notes.push("");
  notes.push("## Inputs");
  notes.push(`- frameworks: ${(args.report.frameworks || []).join(", ") || "none detected"}`);
  notes.push(`- tooling: ${(args.report.tooling || []).join(", ") || "none detected"}`);
  notes.push(`- routes: ${routes.length}`);
  notes.push("");
  notes.push("## Signals (top)");
  const sigs = (args.report.signals || []).slice(0, 12);
  if (sigs.length === 0) notes.push("- none");
  else for (const s of sigs) notes.push(`- [${s.severity}] ${s.key}: ${s.value}`);
  notes.push("");
  notes.push("## Caveat");
  notes.push("This is structural. The intent semantics (what the product *means*) still needs a Director decision or a gated AI proposal review.");
  notes.push("");

  return {
    created_utc: ZIP_MTIME_UTC,
    palettes,
    spel: spel.join("\n"),
    notes_md: notes.join("\n"),
  };
}
