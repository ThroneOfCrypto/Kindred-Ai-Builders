import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { getEntry, isValidTypeDir, type MarketplaceTypeDir } from "../../../../lib/marketplace_catalog";
import { APP_VERSION } from "../../../../lib/version";

export const runtime = "nodejs";

type ReqItem = { type: string; slug: string };

type LockExport = {
  kind: string;
  source_path: string;
  target_path?: string;
};

type LockEntry = {
  type_dir: string;
  slug: string;
  name: string;
  version: string;
  manifest_relpath: string;
  manifest_sha256: string;
  exports: LockExport[];
};

type LibraryLockV1 = {
  schema: "sdde.library_lock.v1";
  created_at_utc: string;
  app_version: string;
  entries: LockEntry[];
};

function sha256Hex(buf: Uint8Array): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function defaultTarget(kind: string, slug: string): string | undefined {
  if (kind === "tokenset") return `blueprint/palettes/${slug}.tokens.json`;
  if (kind === "workflow") return `tools/workflows/${slug}.workflow.json`;
  if (kind === "schema") return `spel/schemas/${slug}.schema.json`;
  return undefined;
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const items: ReqItem[] = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) {
    const empty: LibraryLockV1 = { schema: "sdde.library_lock.v1", created_at_utc: new Date().toISOString(), app_version: APP_VERSION, entries: [] };
    return NextResponse.json({ ok: true, lock: empty });
  }

  const out: LockEntry[] = [];
  for (const it of items) {
    const typeRaw = String(it?.type || "");
    const slug = String(it?.slug || "");
    if (!typeRaw || !slug) continue;
    if (!isValidTypeDir(typeRaw)) continue;
    const type_dir = typeRaw as MarketplaceTypeDir;

    const entry = await getEntry(type_dir, slug);
    if (!entry) continue;

    const manifestRel = path.posix.join("library", "artifacts", type_dir, slug, "sdde.library.json");
    const manifestAbs = path.join(process.cwd(), manifestRel);
    const manifestBytes = await fs.readFile(manifestAbs);
    const manifest_sha256 = sha256Hex(manifestBytes);

    const exports: LockExport[] = (entry.manifest.exports || []).map((ex: any) => {
      const kind = String(ex?.kind || "code");
      const source_path = String(ex?.path || "");
      const target_path = defaultTarget(kind, slug);
      return { kind, source_path, ...(target_path ? { target_path } : {}) };
    });

    out.push({
      type_dir,
      slug,
      name: String(entry.manifest.name || `${type_dir}/${slug}`),
      version: String(entry.manifest.version || "0.0.0"),
      manifest_relpath: manifestRel,
      manifest_sha256,
      exports,
    });
  }

  out.sort((a, b) => `${a.type_dir}/${a.slug}`.localeCompare(`${b.type_dir}/${b.slug}`));

  const lock: LibraryLockV1 = {
    schema: "sdde.library_lock.v1",
    created_at_utc: new Date().toISOString(),
    app_version: APP_VERSION,
    entries: out,
  };

  return NextResponse.json({ ok: true, lock });
}
