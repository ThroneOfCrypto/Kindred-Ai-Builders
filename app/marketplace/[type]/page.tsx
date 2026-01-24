import Link from "next/link";
import { notFound } from "next/navigation";

import { Panel } from "../../../components/Panel";
import { isValidTypeDir, listEntries, type MarketplaceTypeDir } from "../../../lib/marketplace_catalog";
import { AddToSelectionButton } from "../AddToSelectionButton";

function toLowerSafe(s: unknown): string {
  return String(s || "").toLowerCase();
}

function manifestTags(m: any): string[] {
  const tags = m?.constraints?.tags;
  if (!Array.isArray(tags)) return [];
  return tags.map((t: any) => String(t || "").trim()).filter(Boolean);
}

export default async function MarketplaceTypePage({
  params,
  searchParams,
}: {
  params: { type: string };
  searchParams?: { q?: string; status?: string; tag?: string };
}) {
  const typeDir = params.type;
  if (!isValidTypeDir(typeDir)) return notFound();

  const q = String(searchParams?.q || "").trim();
  const status = String(searchParams?.status || "").trim();
  const tag = String(searchParams?.tag || "").trim();

  const entries = await listEntries(typeDir as MarketplaceTypeDir);

  const allStatuses = Array.from(new Set(entries.map((e) => e.manifest.status))).sort();
  const allTags = Array.from(new Set(entries.flatMap((e) => manifestTags(e.manifest)))).sort((a, b) => a.localeCompare(b));

  const filtered = entries.filter((e) => {
    if (status && e.manifest.status !== status) return false;
    if (tag) {
      const tags = manifestTags(e.manifest);
      if (!tags.includes(tag)) return false;
    }
    if (q) {
      const hay = `${e.slug} ${e.manifest.name} ${e.manifest.description || ""} ${manifestTags(e.manifest).join(" ")}`;
      if (!toLowerSafe(hay).includes(toLowerSafe(q))) return false;
    }
    return true;
  });

  return (
    <main className="page">
      <Panel title={`Marketplace / ${typeDir}`} subtitle="Browse deterministic artefacts (no screenshots, no vibes).">
        <form method="get" className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Search</label>
            <input name="q" defaultValue={q} placeholder="name, slug, tag…" />
          </div>

          <div className="field" style={{ minWidth: 180 }}>
            <label>Status</label>
            <select name="status" defaultValue={status || ""}>
              <option value="">All</option>
              {allStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ minWidth: 220 }}>
            <label>Tag</label>
            <select name="tag" defaultValue={tag || ""}>
              <option value="">Any</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <button className="btn" type="submit">
            Apply
          </button>

          {(q || status || tag) ? (
            <Link className="btn secondary" href={`/marketplace/${typeDir}`}>
              Reset
            </Link>
          ) : null}
        </form>

        <div className="hr" />

        {filtered.length === 0 ? (
          <p className="muted">No entries match your filters.</p>
        ) : (
          <ul className="list">
            {filtered.map((e) => {
              const tags = manifestTags(e.manifest);
              return (
                <li key={e.slug} className="list_item">
                  <div>
                    <Link href={`/marketplace/${typeDir}/${e.slug}`}>{e.manifest.name}</Link>
                    {e.manifest.description ? <div className="muted small">{e.manifest.description}</div> : null}
                    <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                      <span className="badge">
                        <strong>Status</strong> <span>{e.manifest.status}</span>
                      </span>
                      {tags.slice(0, 6).map((t) => (
                        <Link
                          key={t}
                          className="badge"
                          href={`/marketplace/${typeDir}?tag=${encodeURIComponent(t)}${status ? `&status=${encodeURIComponent(status)}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                        >
                          <span>{t}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <AddToSelectionButton type={typeDir} slug={e.slug} />
                </li>
              );
            })}
          </ul>
        )}

        <div className="hr" />
        <p className="muted">
          Local-first source: <code>library/artifacts/{typeDir}/*</code>
        </p>
      </Panel>
    </main>
  );
}
