"use client";

import { strFromU8, strToU8, unzipSync } from "fflate";

import { compileTokensForExport } from "./token_theme";
import { zipDeterministic } from "./deterministic_zip";
import { stableJsonText } from "./stable_json";
import { APP_VERSION, VALIDATOR_VERSION, SPEC_PACK_VERSION, ZIP_MTIME_UTC } from "./version";

export type RepoZipFile = {
  path: string;
  bytes: Uint8Array;
  size: number;
};

export type RepoZip = {
  files: RepoZipFile[];
  fileMap: Map<string, RepoZipFile>;
  stripped_prefix: string | null;
};

export type BrownfieldInventoryReportV1 = {
  schema: "kindred.brownfield_inventory_pack.v1";
  captured_at_utc: string;
  basis: {
    zip_file_name: string;
    stripped_prefix: string | null;
    file_count: number;
    total_bytes: number;
  };
  framework: {
    kind: "nextjs" | "node" | "unknown";
    signals: string[];
  };
  routes: {
    kind: "nextjs_app" | "nextjs_pages" | "unknown";
    pages: { path: string; file: string }[];
    api: { path: string; file: string }[];
  };
  env: {
    names: string[];
    sources: {
      dotenv_example: string[];
      code_scan: string[];
    };
    risks: { code: string; severity: "info" | "warn" | "error"; message: string }[];
  };
  dependencies: {
    package_json_path: string | null;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  risks: { code: string; severity: "info" | "warn" | "error"; message: string; evidence?: string[] }[];
};

function isTextFile(path: string): boolean {
  return /(\.(ts|tsx|js|jsx|json|md|txt|css|scss|html|yml|yaml|toml|env|example))$/i.test(path);
}

function normNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function safeTrimPrefix(path: string, prefix: string): string {
  if (!prefix) return path;
  if (path.startsWith(prefix)) return path.slice(prefix.length);
  return path;
}

function detectSingleTopFolder(paths: string[]): string | null {
  const segs = new Set<string>();
  for (const p of paths) {
    const first = p.split("/")[0];
    if (first) segs.add(first);
  }
  if (segs.size !== 1) return null;
  const only = Array.from(segs)[0];
  // Only strip if every path actually contains a slash (i.e., looks like folder/file).
  if (!paths.every((p) => p.startsWith(only + "/"))) return null;
  return only + "/";
}

export function readRepoZip(bytes: Uint8Array): RepoZip {
  const out = unzipSync(bytes);
  const rawPaths = Object.keys(out);
  const prefix = detectSingleTopFolder(rawPaths);

  const files: RepoZipFile[] = Object.entries(out)
    .map(([path, buf]) => {
      const normalized = prefix ? safeTrimPrefix(path, prefix) : path;
      return {
        path: normalized,
        bytes: buf,
        size: buf.byteLength,
      };
    })
    .filter((f) => f.path && !f.path.endsWith("/"));

  files.sort((a, b) => a.path.localeCompare(b.path));
  const fileMap = new Map<string, RepoZipFile>();
  for (const f of files) fileMap.set(f.path, f);
  return { files, fileMap, stripped_prefix: prefix };
}

export type RepoZipReadError = {
  code: "INVALID_ZIP" | "EMPTY_ZIP";
  message: string;
};

export function tryReadRepoZip(bytes: Uint8Array): { ok: true; zip: RepoZip } | { ok: false; error: RepoZipReadError } {
  try {
    const out = unzipSync(bytes);
    const rawPaths = Object.keys(out).filter((p) => p && !p.endsWith("/"));
    if (rawPaths.length === 0) {
      return { ok: false, error: { code: "EMPTY_ZIP", message: "ZIP contains no files." } };
    }
    // Reuse readRepoZip (which normalizes top-folder prefixes and filters directories).
    const zip = readRepoZip(bytes);
    if (zip.files.length === 0) {
      return { ok: false, error: { code: "EMPTY_ZIP", message: "ZIP contains no files." } };
    }
    return { ok: true, zip };
  } catch (e: any) {
    const msg = String(e?.message || e);
    return { ok: false, error: { code: "INVALID_ZIP", message: msg || "Invalid ZIP." } };
  }
}

function readJsonFile<T>(zip: RepoZip, path: string): { ok: true; value: T } | { ok: false; error: string } {
  const f = zip.fileMap.get(path);
  if (!f) return { ok: false, error: `Missing ${path}` };
  try {
    const text = strFromU8(f.bytes);
    const obj = JSON.parse(text) as T;
    return { ok: true, value: obj };
  } catch (e: any) {
    return { ok: false, error: `Failed to parse ${path}: ${String(e?.message || e)}` };
  }
}

function findBestPackageJson(zip: RepoZip): string | null {
  if (zip.fileMap.has("package.json")) return "package.json";
  const candidates = zip.files.filter((f) => f.path.endsWith("package.json"));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.path.split("/").length - b.path.split("/").length);
  return candidates[0]?.path || null;
}

function detectFramework(zip: RepoZip, pkgPath: string | null): { kind: "nextjs" | "node" | "unknown"; signals: string[] } {
  const signals: string[] = [];
  let deps: Record<string, string> = {};
  let dev: Record<string, string> = {};

  if (pkgPath) {
    const parsed = readJsonFile<any>(zip, pkgPath);
    if (parsed.ok) {
      deps = parsed.value?.dependencies || {};
      dev = parsed.value?.devDependencies || {};
    }
  }

  if (zip.fileMap.has("next.config.js") || zip.fileMap.has("next.config.mjs") || (deps && typeof deps.next === "string")) {
    signals.push("nextjs");
    if (zip.files.some((f) => f.path.startsWith("app/"))) signals.push("app_dir");
    if (zip.files.some((f) => f.path.startsWith("pages/"))) signals.push("pages_dir");
    return { kind: "nextjs", signals };
  }

  if (pkgPath) {
    signals.push("package_json");
    return { kind: "node", signals };
  }

  return { kind: "unknown", signals };
}

function nextAppRoutes(zip: RepoZip): { pages: { path: string; file: string }[]; api: { path: string; file: string }[] } {
  const pages: { path: string; file: string }[] = [];
  const api: { path: string; file: string }[] = [];

  for (const f of zip.files) {
    const mPage = f.path.match(/^app\/(.+)\/page\.(ts|tsx|js|jsx)$/);
    if (mPage) {
      const segs = mPage[1]
        .split("/")
        .filter((s) => s && !s.startsWith("(") && !s.startsWith("@"));
      const p = "/" + segs.join("/");
      pages.push({ path: p === "/" ? "/" : p, file: f.path });
      continue;
    }
    const mRoot = f.path.match(/^app\/page\.(ts|tsx|js|jsx)$/);
    if (mRoot) {
      pages.push({ path: "/", file: f.path });
      continue;
    }

    const mApi = f.path.match(/^app\/api\/(.+)\/route\.(ts|tsx|js|jsx)$/);
    if (mApi) {
      const segs = mApi[1]
        .split("/")
        .filter((s) => s && !s.startsWith("(") && !s.startsWith("@"));
      api.push({ path: "/api/" + segs.join("/"), file: f.path });
      continue;
    }
    const mApiRoot = f.path.match(/^app\/api\/route\.(ts|tsx|js|jsx)$/);
    if (mApiRoot) {
      api.push({ path: "/api", file: f.path });
      continue;
    }
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));
  api.sort((a, b) => a.path.localeCompare(b.path));
  return { pages, api };
}

function nextPagesRoutes(zip: RepoZip): { pages: { path: string; file: string }[]; api: { path: string; file: string }[] } {
  const pages: { path: string; file: string }[] = [];
  const api: { path: string; file: string }[] = [];

  for (const f of zip.files) {
    const mApi = f.path.match(/^pages\/api\/(.+)\.(ts|tsx|js|jsx)$/);
    if (mApi) {
      const rel = mApi[1];
      api.push({ path: "/api/" + rel.replace(/index$/i, "").replace(/\/+/g, "/").replace(/\/$/, ""), file: f.path });
      continue;
    }
    const mPage = f.path.match(/^pages\/(.+)\.(ts|tsx|js|jsx)$/);
    if (mPage) {
      const rel = mPage[1];
      if (rel.startsWith("api/")) continue;
      let p = "/" + rel;
      p = p.replace(/\/index$/i, "");
      if (p === "") p = "/";
      pages.push({ path: p, file: f.path });
      continue;
    }
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));
  api.sort((a, b) => a.path.localeCompare(b.path));
  return { pages, api };
}

function parseDotenvKeys(text: string): string[] {
  const keys: string[] = [];
  const lines = normNewlines(text).split("\n");
  for (const line of lines) {
    const raw = line.trim();
    if (!raw || raw.startsWith("#")) continue;
    const m = raw.match(/^([A-Z0-9_]+)\s*=/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

function scanEnvNamesFromCode(text: string): string[] {
  const names: string[] = [];
  const a = /process\.env\.([A-Z0-9_]+)/g;
  const b = /import\.meta\.env\.([A-Z0-9_]+)/g;
  const c = /env\[['"]([A-Z0-9_]+)['"]\]/g;
  for (const re of [a, b, c]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const n = m[1];
      if (n) names.push(n);
    }
  }
  return names;
}

function uniqSorted(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function looksLikeSecretName(name: string): boolean {
  const n = name.toUpperCase();
  return n.includes("SECRET") || n.includes("TOKEN") || n.includes("PASSWORD") || n.includes("PRIVATE") || n.endsWith("_KEY");
}

export function analyzeRepoZip(args: { zip: RepoZip; zip_file_name: string }): BrownfieldInventoryReportV1 {
  const { zip, zip_file_name } = args;
  const total = zip.files.reduce((sum, f) => sum + f.size, 0);
  const pkgPath = findBestPackageJson(zip);

  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {};
  if (pkgPath) {
    const parsed = readJsonFile<any>(zip, pkgPath);
    if (parsed.ok) {
      Object.assign(deps, parsed.value?.dependencies || {});
      Object.assign(devDeps, parsed.value?.devDependencies || {});
    }
  }

  const framework = detectFramework(zip, pkgPath);

  // Routes
  let routesKind: "nextjs_app" | "nextjs_pages" | "unknown" = "unknown";
  let routes = { pages: [] as { path: string; file: string }[], api: [] as { path: string; file: string }[] };
  if (framework.kind === "nextjs") {
    if (zip.files.some((f) => f.path.startsWith("app/"))) {
      routesKind = "nextjs_app";
      routes = nextAppRoutes(zip);
    } else if (zip.files.some((f) => f.path.startsWith("pages/"))) {
      routesKind = "nextjs_pages";
      routes = nextPagesRoutes(zip);
    }
  }

  // Env vars
  const dotenvExampleKeys: string[] = [];
  for (const candidate of [".env.example", ".env.local.example", ".env.sample", "env.example"]) {
    const f = zip.fileMap.get(candidate);
    if (!f) continue;
    if (!isTextFile(candidate)) continue;
    dotenvExampleKeys.push(...parseDotenvKeys(strFromU8(f.bytes)));
  }

  const codeScanKeys: string[] = [];
  for (const f of zip.files) {
    if (!isTextFile(f.path)) continue;
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f.path)) continue;
    const text = strFromU8(f.bytes);
    codeScanKeys.push(...scanEnvNamesFromCode(text));
  }

  const envNames = uniqSorted(dotenvExampleKeys.concat(codeScanKeys));
  const envRisks: { code: string; severity: "info" | "warn" | "error"; message: string }[] = [];
  for (const n of envNames) {
    if (n.startsWith("NEXT_PUBLIC_") && looksLikeSecretName(n)) {
      envRisks.push({
        code: "PUBLIC_ENV_LOOKS_SECRET",
        severity: "error",
        message: `${n} is public (NEXT_PUBLIC_) but looks like a secret name. Never expose secrets to the client.`,
      });
    }
  }

  const risks: { code: string; severity: "info" | "warn" | "error"; message: string; evidence?: string[] }[] = [];

  // Prisma / DATABASE_URL heuristic
  const usesPrisma = Boolean(deps["prisma"] || deps["@prisma/client"] || devDeps["prisma"] || devDeps["@prisma/client"]);
  if (usesPrisma) {
    const hasDbUrl = envNames.includes("DATABASE_URL");
    if (!hasDbUrl) {
      risks.push({
        code: "PRISMA_DATABASE_URL_MISSING",
        severity: "warn",
        message: "Prisma detected but DATABASE_URL was not found in env sources. Vercel builds will fail if Prisma initializes without it.",
        evidence: ["dependencies: prisma/@prisma-client"],
      });
    }
  }

  // Filesystem usage heuristic
  const fsEvidence: string[] = [];
  for (const f of zip.files) {
    if (!isTextFile(f.path)) continue;
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f.path)) continue;
    const text = strFromU8(f.bytes);
    if (/from\s+['"]fs(\/promises)?['"]/.test(text) || /require\(['"]fs(\/promises)?['"]\)/.test(text) || /\bfs\./.test(text)) {
      fsEvidence.push(f.path);
      if (fsEvidence.length >= 15) break;
    }
  }
  if (fsEvidence.length > 0) {
    risks.push({
      code: "FILESYSTEM_USAGE",
      severity: "warn",
      message: "Filesystem access detected in code. On Vercel, ensure it only runs server-side and does not assume writable disk at runtime.",
      evidence: fsEvidence,
    });
  }

  // Next public env hygiene
  const publicKeys = envNames.filter((n) => n.startsWith("NEXT_PUBLIC_"));
  if (publicKeys.length > 0) {
    risks.push({
      code: "PUBLIC_ENV_PRESENT",
      severity: "info",
      message: `Found ${publicKeys.length} NEXT_PUBLIC_ env vars. Verify they contain only non-sensitive values.`,
      evidence: publicKeys.slice(0, 15),
    });
  }

  // Package json missing
  if (!pkgPath) {
    risks.push({
      code: "PACKAGE_JSON_NOT_FOUND",
      severity: "warn",
      message: "No package.json found. Inventory is partial. If this is not a Node repo, add detectors for the target stack.",
    });
  }

  return {
    schema: "kindred.brownfield_inventory_pack.v1",
    // Determinism: avoid wall-clock time in derived packs.
    captured_at_utc: ZIP_MTIME_UTC,
    basis: {
      zip_file_name,
      stripped_prefix: zip.stripped_prefix,
      file_count: zip.files.length,
      total_bytes: total,
    },
    framework,
    routes: {
      kind: routesKind,
      pages: routes.pages,
      api: routes.api,
    },
    env: {
      names: envNames,
      sources: {
        dotenv_example: uniqSorted(dotenvExampleKeys),
        code_scan: uniqSorted(codeScanKeys),
      },
      risks: envRisks,
    },
    dependencies: {
      package_json_path: pkgPath,
      dependencies: deps,
      devDependencies: devDeps,
    },
    risks,
  };
}

function pretty(obj: any): string {
  return stableJsonText(obj, 2);
}

export function buildBrownfieldInventoryPackZip(report: BrownfieldInventoryReportV1): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  files["brownfield_inventory_manifest.json"] = strToU8(
    pretty({
      schema: "kindred.brownfield_inventory_manifest.v1",
      created_at_utc: report.captured_at_utc,
      contents: ["inventory/report.json"],
    })
  );
  files["inventory/report.json"] = strToU8(pretty(report));
  return zipDeterministic(files, { level: 6 });
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

// --- Brownfield → Current-State Spec Pack (for Workbench diffs) ---

export function tryReadBrownfieldInventoryPack(
  bytes: Uint8Array
):
  | { ok: true; report: BrownfieldInventoryReportV1 }
  | { ok: false; error: string } {
  try {
    const out = unzipSync(bytes);
    const reportBuf = out["inventory/report.json"];
    if (!reportBuf) return { ok: false, error: "Missing inventory/report.json" };

    const text = strFromU8(reportBuf);
    const parsed = JSON.parse(text);

    if (!parsed || parsed.schema !== "kindred.brownfield_inventory_pack.v1") {
      return { ok: false, error: "inventory/report.json has unexpected schema" };
    }

    return { ok: true, report: parsed as BrownfieldInventoryReportV1 };
  } catch (e: any) {
    return { ok: false, error: `Failed to read inventory pack: ${String(e?.message || e)}` };
  }
}

function fnv1a32(s: string): number {
  // 32-bit FNV-1a hash (deterministic, fast, sync).
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // h *= 16777619 (but keep 32-bit)
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

function shortHex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

function safeProjectIdFromReport(report: BrownfieldInventoryReportV1): string {
  const stable = JSON.stringify({
    schema: report.schema,
    framework: report.framework,
    routes: report.routes,
    env: { names: report.env.names, sources: report.env.sources },
    deps: { dependencies: report.dependencies.dependencies, devDependencies: report.dependencies.devDependencies },
  });
  const h = fnv1a32(stable);
  return `bf_${shortHex32(h)}`;
}

function titleFromPath(path: string): string {
  if (path === "/" || !path) return "Home";
  const segs = path
    .split("/")
    .filter(Boolean)
    .map((s) =>
      s
        .replace(/[\[\]\(\)\.]/g, "")
        .replace(/[-_]+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
  if (segs.length === 0) return "Page";
  return segs.join(" / ");
}

function idFromRoutePath(path: string): string {
  if (path === "/" || !path) return "home";
  const raw = path
    .replace(/^\//, "")
    .replace(/\//g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return raw || "page";
}

function uniqBy<T>(arr: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function inferPrimarySurface(report: BrownfieldInventoryReportV1): "content_site" | "web_app" | "mobile_app" | "cli_tool" | "automation" | "api_service" {
  if (report.framework.kind === "nextjs") return "web_app";
  if (Object.keys(report.dependencies.dependencies || {}).includes("next")) return "web_app";
  if (report.routes.api.length > 0 && report.routes.pages.length === 0) return "api_service";
  return "web_app";
}

export function buildCurrentStateSpecPackZip(report: BrownfieldInventoryReportV1): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  const projectId = safeProjectIdFromReport(report);
  const nameBase = (report.basis.zip_file_name || "repo").replace(/\.zip$/i, "");
  const createdAt = report.captured_at_utc || ZIP_MTIME_UTC;

  const pageRoutes = uniqBy(report.routes.pages, (p) => p.path).sort((a, b) => a.path.localeCompare(b.path));
  const iaPages = pageRoutes.length
    ? pageRoutes.map((p) => ({ id: idFromRoutePath(p.path), title: titleFromPath(p.path), route_path: p.path, scene_id: idFromRoutePath(p.path) }))
    : [{ id: "home", title: "Home", route_path: "/", scene_id: "home" }];

  // UX scenes align with IA page ids (simple 1:1 mapping).
  const scenes = iaPages.map((p, i) => ({ id: p.id, title: p.title, entry: i === 0 }));
  const flows = [{ id: "primary", scenes: scenes.map((s) => s.id) }];

  // Lofi layout uses section ids from SECTION_LIBRARY.
  const lofiPages: Record<string, { sections: string[] }> = {};
  for (const p of iaPages) {
    if (p.id === "home") lofiPages[p.id] = { sections: ["top_nav", "hero", "features", "cta", "footer"] };
    else lofiPages[p.id] = { sections: ["top_nav", "details", "footer"] };
  }

  // Required baseline files (same paths as Builder export).
  files["project/meta.json"] = strToU8(
    pretty({
      id: projectId,
      name: nameBase,
      created_at_utc: createdAt,
    })
  );
  files["intent/launch_path.json"] = strToU8(pretty({ launch_path_id: null }));
  files["intent/build_intent.json"] = strToU8(pretty({ build_intent: null }));
  files["intent/targets.json"] = strToU8(pretty({ primary_surface: inferPrimarySurface(report) }));
  files["intent/palettes.json"] = strToU8(pretty({ palettes: [] }));
  const envNames = uniqBy(report.env.names || [], (x) => String(x || "").trim().toUpperCase())
    .map((x) => String(x || "").trim())
    .filter((x) => x.length > 0)
    .sort((a, b) => a.localeCompare(b));
  files["intent/constraints.json"] = strToU8(pretty({ offline_first: false, no_payments: false, required_env_names: envNames }));
  files["intent/brief.json"] = strToU8(
    pretty({
      schema: "kindred.intent.brief.v1",
      audience_description: "",
      problem: "",
      offer: "",
      differentiators: [],
      key_actions: [],
      success_metrics: [],
      non_goals: [],
    })
  );

  files["design/profile.json"] = strToU8(pretty({ name: nameBase, tagline: "", audience: "builders", tone: "calm" }));
  files["design/references.json"] = strToU8(pretty({ references: [] }));
  const tokens = {
    radius: "balanced",
    density: "balanced",
    contrast: "balanced",
    motion: "subtle",
    type_scale: "balanced",
    line_height: "balanced",
    focus: "standard",
    elevation: "balanced",
    layout_width: "balanced",
    voice: "serious",
    mode: "system",
  } as const;
  files["design/tokens.json"] = strToU8(pretty(tokens));
  files["design/tokens_compiled.json"] = strToU8(pretty(compileTokensForExport(tokens)));
  files["design/ia_tree.json"] = strToU8(pretty({ pages: iaPages }));
  files["design/lofi_layouts.json"] = strToU8(pretty({ active_variant_id: "current", variants: [{ id: "current", label: "Current (Detected)", pages: lofiPages }] }));

  files["content/copy_blocks.json"] = strToU8(pretty({ schema: "kindred.content.copy_blocks.v1", blocks: [] }));

  files["kernel_min/actors.json"] = strToU8(pretty({ actors: [{ id: "visitor", display_name: "Visitor" }] }));
  files["ux/actors.json"] = files["kernel_min/actors.json"];
  files["kernel_min/scenes.json"] = strToU8(pretty({ scenes }));
  files["ux/scenes.json"] = files["kernel_min/scenes.json"];
  files["kernel_min/flows.json"] = strToU8(pretty({ flows }));
  files["ux/flows.json"] = files["kernel_min/flows.json"];

  // Brownfield report is carried as optional spec artefact.
  files["brownfield/inventory.json"] = strToU8(pretty({ schema: "kindred.brownfield.inventory.v1", report }));

  // Optional auditing artefacts (avoid gate warnings).
  files["dist/builder_gate_report.json"] = strToU8(
    pretty({
      schema: "kindred.builder_gate_report.v1",
      captured_at_utc: createdAt,
      status: "pass",
      issues: [],
    })
  );
  files["blueprint/hello.spel"] = strToU8(`-- Current-state placeholder SPEL (derived from brownfield inventory)\n-- project_id: ${projectId}\n`);

  // Manifest (explicit, deterministic ordering).
  const contents = [
    "project/meta.json",
    "intent/launch_path.json",
    "intent/build_intent.json",
    "intent/targets.json",
    "intent/palettes.json",
    "intent/constraints.json",
    "intent/brief.json",
    "design/profile.json",
    "design/references.json",
    "design/tokens.json",
    "design/tokens_compiled.json",
    "design/ia_tree.json",
    "design/lofi_layouts.json",
    "content/copy_blocks.json",
    "kernel_min/actors.json",
    "kernel_min/scenes.json",
    "kernel_min/flows.json",
    "ux/actors.json",
    "ux/scenes.json",
    "ux/flows.json",
    "brownfield/inventory.json",
    "dist/builder_gate_report.json",
    "blueprint/hello.spel",
  ];

  files["spec_pack_manifest.json"] = strToU8(
    pretty({
      schema: "kindred.spec_pack_manifest.v1",
      created_at_utc: createdAt,
      project_id: projectId,
      spec_pack_version: SPEC_PACK_VERSION,
      provenance: {
        app_version: APP_VERSION,
        validator_version: VALIDATOR_VERSION,
      },
      contents,
    })
  );

  return zipDeterministic(files, { level: 6 });
}
