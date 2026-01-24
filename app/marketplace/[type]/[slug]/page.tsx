import fs from "node:fs/promises";
import path from "node:path";

import Link from "next/link";
import { notFound } from "next/navigation";

import { Panel } from "../../../../components/Panel";
import { ImportPinButton } from "../../ImportPinButton";
import { AddToSelectionButton } from "../../AddToSelectionButton";
import { getEntry, isValidTypeDir, makeImportPin, type MarketplaceTypeDir } from "../../../../lib/marketplace_catalog";

type ExportPreview = {
  kind: string;
  relPath: string;
  ok: boolean;
  note?: string;
  text?: string;
};

function safeResolveWithin(baseAbs: string, relPath: string): string | null {
  const abs = path.resolve(baseAbs, relPath);
  const base = path.resolve(baseAbs);
  const prefix = base.endsWith(path.sep) ? base : base + path.sep;
  if (abs === base) return abs;
  if (!abs.startsWith(prefix)) return null;
  return abs;
}

function isTextyPath(p: string): boolean {
  const ext = path.extname(p).toLowerCase();
  return ext === ".spel" || ext === ".json" || ext === ".md" || ext === ".txt" || ext === ".yaml" || ext === ".yml";
}

async function previewExport(basePath: string, kind: string, relPath: string): Promise<ExportPreview> {
  const abs = safeResolveWithin(basePath, relPath);
  if (!abs) return { kind, relPath, ok: false, note: "invalid path" };

  if (!isTextyPath(abs)) return { kind, relPath, ok: false, note: "binary/unsupported preview" };

  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return { kind, relPath, ok: false, note: "not a file" };

    // Hard limit to keep the page sane.
    const max = 80_000;
    const buf = await fs.readFile(abs);
    const slice = buf.length > max ? buf.subarray(0, max) : buf;

    // Cheap binary check
    for (let i = 0; i < Math.min(slice.length, 2048); i++) {
      if (slice[i] === 0) return { kind, relPath, ok: false, note: "binary" };
    }

    const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const note = buf.length > max ? `truncated (>${max} bytes)` : undefined;
    return { kind, relPath, ok: true, text, note };
  } catch {
    return { kind, relPath, ok: false, note: "missing/unreadable" };
  }
}

export default async function MarketplaceEntryPage({ params }: { params: { type: string; slug: string } }) {
  const typeDirRaw = params.type;
  if (!isValidTypeDir(typeDirRaw)) return notFound();
  const typeDir = typeDirRaw as MarketplaceTypeDir;
  const entry = await getEntry(typeDir, params.slug);
  if (!entry) return notFound();

  const pin = makeImportPin(entry);
  const apiHref = `/api/library/import-pin?type=${encodeURIComponent(typeDir)}&slug=${encodeURIComponent(entry.slug)}`;

  const previews = await Promise.all(
    (entry.manifest.exports || []).map((ex) => previewExport(entry.basePath, ex.kind, ex.path))
  );

  return (
    <main className="page">
      <Panel
        title={entry.manifest.name}
        subtitle={entry.manifest.description || `Marketplace / ${typeDir} / ${entry.slug}`}
        actions={<Link href={`/marketplace/${typeDir}`}>Back</Link>}
      >
        <div className="row row_center">
          <ImportPinButton href={apiHref} filename={`import_pin__${typeDir}__${entry.slug}.json`} />
          <AddToSelectionButton type={typeDir} slug={entry.slug} />
          <span className="muted">
            Pin: <code>{pin.artifact.manifest_sha256.slice(0, 12)}…</code>
          </span>
        </div>

        <div className="hr" />

        <h3>Exports</h3>
        <ul className="list">
          {previews.map((p) => (
            <li key={`${p.kind}:${p.relPath}`} className="list_item">
              <div>
                <div>
                  <code>{p.kind}</code> <span className="muted">→</span> <code>{p.relPath}</code>
                </div>
                {p.note ? <div className="muted small">{p.note}</div> : null}
              </div>
            </li>
          ))}
        </ul>

        {previews.some((p) => p.ok && p.text) ? (
          <>
            <div className="hr" />
            <h3>Preview</h3>
            {previews
              .filter((p) => p.ok && p.text)
              .map((p) => (
                <div key={`preview:${p.kind}:${p.relPath}`} style={{ marginBottom: 16 }}>
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    <code>{p.relPath}</code>
                  </div>
                  <pre className="codeblock">{p.text}</pre>
                </div>
              ))}
          </>
        ) : null}

        <div className="hr" />

        <h3>Manifest</h3>
        <pre className="codeblock">{JSON.stringify(entry.manifest, null, 2)}</pre>

        <h3>Evidence requirements</h3>
        <ul className="list">
          {entry.manifest.evidence?.required_gates?.map((g) => (
            <li key={g} className="list_item">
              <code>{g}</code>
            </li>
          ))}
        </ul>

        <div className="hr" />
        <p className="muted">
          Source: <code>library/artifacts/{typeDir}/{entry.slug}</code>
        </p>
      </Panel>
    </main>
  );
}
