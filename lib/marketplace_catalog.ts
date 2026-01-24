import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export type SDDELibraryType =
  | "kit"
  | "overlay"
  | "palette"
  | "workflow"
  | "schema"
  | "question_bank"
  | "template";

export type MarketplaceTypeDir =
  | "kits"
  | "overlays"
  | "palettes"
  | "workflows"
  | "schemas"
  | "question_banks"
  | "templates";

export type SDDELibraryManifest = {
  sdde_library_version: string;
  name: string;
  type: SDDELibraryType;
  version: string;
  status: "experimental" | "beta" | "stable" | "deprecated";
  description?: string;
  license?: string;
  homepage?: string;
  repository?: { type: "git"; url: string; path: string };
  compatibility: {
    kernel?: { range: string };
    node?: { range: string };
    os?: string[];
    surfaces?: string[];
  };
  constraints: Record<string, unknown>;
  exports: Array<{ kind: string; path: string }>;
  evidence: {
    required_gates: string[];
    artifacts: Array<{ path: string; required: boolean; hash?: string }>;
  };
};

export type MarketplaceEntry = {
  typeDir: MarketplaceTypeDir;
  slug: string;
  basePath: string;
  manifestPath: string;
  manifest: SDDELibraryManifest;
  manifestSha256: string;
};

const TYPE_DIR_TO_LIBRARY_TYPE: Record<MarketplaceTypeDir, SDDELibraryType> = {
  kits: "kit",
  overlays: "overlay",
  palettes: "palette",
  workflows: "workflow",
  schemas: "schema",
  question_banks: "question_bank",
  templates: "template",
};

export function libraryRoot(): string {
  return path.join(process.cwd(), "library", "artifacts");
}

export function isValidTypeDir(v: string): v is MarketplaceTypeDir {
  return (
    v === "kits" ||
    v === "overlays" ||
    v === "palettes" ||
    v === "workflows" ||
    v === "schemas" ||
    v === "question_banks" ||
    v === "templates"
  );
}

export async function listTypeDirs(): Promise<MarketplaceTypeDir[]> {
  const root = libraryRoot();
  try {
    const dirs = await fs.readdir(root, { withFileTypes: true });
    return dirs
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter(isValidTypeDir)
      .sort() as MarketplaceTypeDir[];
  } catch {
    return [];
  }
}

export async function listEntries(typeDir: MarketplaceTypeDir): Promise<MarketplaceEntry[]> {
  const root = path.join(libraryRoot(), typeDir);
  let dirs: import("node:fs").Dirent[] = [];
  try {
    dirs = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const slugs = dirs.filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const entries: MarketplaceEntry[] = [];

  for (const slug of slugs) {
    const basePath = path.join(root, slug);
    const manifestPath = path.join(basePath, "sdde.library.json");
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const sha = sha256Hex(raw);
      const manifest = JSON.parse(raw) as SDDELibraryManifest;

      // Basic sanity: type must match the folder.
      const expectedType = TYPE_DIR_TO_LIBRARY_TYPE[typeDir];
      if (!manifest || manifest.type !== expectedType) {
        continue;
      }

      entries.push({ typeDir, slug, basePath, manifestPath, manifest, manifestSha256: sha });
    } catch {
      // skip unreadable entries
    }
  }

  return entries;
}

export async function getEntry(typeDir: MarketplaceTypeDir, slug: string): Promise<MarketplaceEntry | null> {
  const entries = await listEntries(typeDir);
  return entries.find((e) => e.slug === slug) ?? null;
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export type ImportPin = {
  kind: "sdde_import_pin";
  version: "0.1";
  source: { kind: "repo"; path: string };
  artifact: {
    name: string;
    type: SDDELibraryType;
    version: string;
    manifest_path: string;
    manifest_sha256: string;
  };
};

export function makeImportPin(entry: MarketplaceEntry): ImportPin {
  const relativeManifestPath = path
    .relative(process.cwd(), entry.manifestPath)
    .split(path.sep)
    .join("/");

  return {
    kind: "sdde_import_pin",
    version: "0.1",
    source: { kind: "repo", path: "./" },
    artifact: {
      name: entry.manifest.name,
      type: entry.manifest.type,
      version: entry.manifest.version,
      manifest_path: relativeManifestPath,
      manifest_sha256: entry.manifestSha256,
    },
  };
}
