import Link from "next/link";

import { Panel } from "../../components/Panel";
import { listEntries, listTypeDirs, type MarketplaceTypeDir } from "../../lib/marketplace_catalog";

function titleForType(typeDir: MarketplaceTypeDir): string {
  switch (typeDir) {
    case "palettes":
      return "Palettes";
    case "workflows":
      return "Workflows";
    case "kits":
      return "Kits";
    case "overlays":
      return "Overlays";
    case "schemas":
      return "Schemas";
    case "question_banks":
      return "Question banks";
    case "templates":
      return "Templates";
    default:
      return typeDir;
  }
}

export default async function MarketplaceHome() {
  const types = await listTypeDirs();
  const rows = await Promise.all(
    types.map(async (t) => {
      const entries = await listEntries(t);
      return { typeDir: t, count: entries.length };
    })
  );

  return (
    <main className="page">
      <Panel
        title="Marketplace"
        subtitle="Shared artefacts (atoms to ecosystems) published as contracts: manifest + evidence requirements."
      >
        <p className="muted">
          This is a local-first catalogue (repo-backed). External registries are an optional kit.
        </p>

        <div className="hr" />

        {rows.length === 0 ? (
          <p className="muted">No artefacts found under <code>library/artifacts/</code>.</p>
        ) : (
          <ul className="list">
            {rows.map((r) => (
              <li key={r.typeDir} className="list_item">
                <Link href={`/marketplace/${r.typeDir}`}> {titleForType(r.typeDir)} </Link>
                <span className="muted">({r.count})</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </main>
  );
}
