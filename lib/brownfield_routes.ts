"use client";

import { RepoPack } from "./repo_pack_io";
import { stableJsonText } from "./stable_json";

export type BrownfieldRouteV1 = {
  kind: "page" | "api";
  router: "app" | "pages";
  route: string;
  file: string;
  dynamic: boolean;
};

export type BrownfieldRouteMapV1 = {
  schema: "kindred.brownfield_route_map.v1";
  created_utc: string;
  routes: BrownfieldRouteV1[];
};

const ZIP_MTIME_UTC = "1980-01-01T00:00:00.000Z";

function isTextPageExt(p: string): boolean {
  return p.endsWith(".tsx") || p.endsWith(".ts") || p.endsWith(".jsx") || p.endsWith(".js");
}

function stripAppGroupSegments(segs: string[]): string[] {
  const out: string[] = [];
  for (const s of segs) {
    if (!s) continue;
    // route groups: (group)
    if (s.startsWith("(") && s.endsWith(")")) continue;
    // parallel route segments: @slot
    if (s.startsWith("@")) continue;
    // Next internal marker segments
    if (s === "_components" || s === "components") {
      // don't strip; components folders should not appear in routes anyway
    }
    out.push(s);
  }
  return out;
}

function routeFromSegments(segs: string[]): { route: string; dynamic: boolean } {
  const cleaned = stripAppGroupSegments(segs).filter(Boolean);
  const dynamic = cleaned.some((s) => s.includes("["));
  if (cleaned.length === 0) return { route: "/", dynamic };
  return { route: "/" + cleaned.join("/"), dynamic };
}

function normalizeRoute(r: string): string {
  if (!r.startsWith("/")) r = "/" + r;
  if (r.length > 1 && r.endsWith("/")) r = r.slice(0, -1);
  return r;
}

function sceneKeyFromRoute(route: string): string {
  const r = normalizeRoute(route);
  let base = r === "/" ? "home" : r.slice(1);
  base = base
    .replaceAll("/", "__")
    .replaceAll("...", "all")
    .replaceAll("[", "")
    .replaceAll("]", "")
    .replace(/[^A-Za-z0-9_\-]/g, "_");
  if (!base) base = "home";
  return `scene_${base}`;
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

export function brownfieldRouteMapFromRepoPack(pack: RepoPack): BrownfieldRouteMapV1 {
  const routes: BrownfieldRouteV1[] = [];

  for (const f of pack.files) {
    const p = f.path;

    // App router pages
    if (p.startsWith("app/") && p.includes("/page.") && isTextPageExt(p)) {
      const m = p.match(/^app\/(.+)\/page\.(?:t|j)sx?$/);
      const inner = m ? m[1] : "";
      const segs = inner ? inner.split("/") : [];
      const { route, dynamic } = routeFromSegments(segs);
      routes.push({ kind: "page", router: "app", route: normalizeRoute(route), file: p, dynamic });
      continue;
    }
    if (p === "app/page.tsx" || p === "app/page.jsx" || p === "app/page.js" || p === "app/page.ts") {
      routes.push({ kind: "page", router: "app", route: "/", file: p, dynamic: false });
      continue;
    }

    // App router API routes
    if (p.startsWith("app/api/") && (p.endsWith("/route.ts") || p.endsWith("/route.js"))) {
      const inner = p
        .replace(/^app\//, "")
        .replace(/\/route\.(?:t|j)sx?$/, "");
      const segs = inner.split("/").slice(1); // drop 'api'
      const { route, dynamic } = routeFromSegments(["api", ...segs]);
      routes.push({ kind: "api", router: "app", route: normalizeRoute(route), file: p, dynamic });
      continue;
    }

    // Pages router API routes
    if (p.startsWith("pages/api/") && isTextPageExt(p)) {
      const inner = p.replace(/^pages\//, "").replace(/\.(?:t|j)sx?$/, "");
      const segs = inner.split("/");
      const { route, dynamic } = routeFromSegments(segs);
      routes.push({ kind: "api", router: "pages", route: normalizeRoute(route), file: p, dynamic });
      continue;
    }

    // Pages router pages
    if (p.startsWith("pages/") && isTextPageExt(p) && !p.startsWith("pages/api/")) {
      const inner = p.replace(/^pages\//, "").replace(/\.(?:t|j)sx?$/, "");
      if (inner === "_app" || inner === "_document" || inner === "_error") continue;
      const segs = inner.split("/");
      if (segs[segs.length - 1] === "index") segs.pop();
      const { route, dynamic } = routeFromSegments(segs);
      routes.push({ kind: "page", router: "pages", route: normalizeRoute(route), file: p, dynamic });
      continue;
    }
  }

  // De-dupe on (kind, route) preferring app router entries.
  const key = (r: BrownfieldRouteV1) => `${r.kind}:${r.route}`;
  const byKey = new Map<string, BrownfieldRouteV1>();
  for (const r of routes) {
    const k = key(r);
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, r);
      continue;
    }
    // prefer app router over pages router
    if (existing.router === "pages" && r.router === "app") byKey.set(k, r);
  }

  const deduped = Array.from(byKey.values()).sort((a, b) =>
    a.kind.localeCompare(b.kind) || a.route.localeCompare(b.route) || a.file.localeCompare(b.file)
  );

  return {
    schema: "kindred.brownfield_route_map.v1",
    created_utc: ZIP_MTIME_UTC,
    routes: deduped,
  };
}

export function brownfieldRouteMapText(map: BrownfieldRouteMapV1): string {
  return stableJsonText(map, 2);
}

export function brownfieldSPELSkeletonFromRepoPack(pack: RepoPack): string {
  const map = brownfieldRouteMapFromRepoPack(pack);
  const pages = map.routes.filter((r) => r.kind === "page");

  const uniqueRoutes = Array.from(new Set(pages.map((r) => r.route))).sort((a, b) => a.localeCompare(b));

  const sceneIds = uniqueRoutes.map((r) => ({ route: r, id: sceneKeyFromRoute(r), title: titleFromRoute(r) }));
  const hasHome = sceneIds.some((s) => s.route === "/");
  const entrySceneId = hasHome ? sceneKeyFromRoute("/") : (sceneIds[0]?.id || "scene_home");

  const lines: string[] = [];
  lines.push("# Generated brownfield SPEL skeleton");
  lines.push("# Proposal-only: structural extraction (routes) with zero semantic inference.");
  lines.push("# Next: fill scenes/actors/flows intentionally, then compile and lock.");
  lines.push("");

  lines.push("palettes:");
  lines.push("  # - <palette_id>  (optional; keep empty for conservative intake)");
  lines.push("");

  lines.push("actors:");
  lines.push("  visitor:");
  lines.push("    display_name: Visitor");
  lines.push("");

  lines.push("scenes:");
  for (const s of sceneIds) {
    lines.push(`  ${s.id}:`);
    lines.push(`    title: ${JSON.stringify(s.title)}`);
    lines.push(`    entry: ${s.id === entrySceneId ? "true" : "false"}`);
    lines.push("    actors: [visitor]");
  }
  if (sceneIds.length === 0) {
    lines.push("  scene_home:");
    lines.push("    title: \"Home\"");
    lines.push("    entry: true");
    lines.push("    actors: [visitor]");
  }
  lines.push("");

  lines.push("flows:");
  lines.push("  - id: primary");
  lines.push(`    scenes: [${sceneIds.map((s) => s.id).join(", ")}]`);
  lines.push("");

  lines.push("locks:");
  lines.push("  adopted: []");
  lines.push("");

  return lines.join("\n");
}
