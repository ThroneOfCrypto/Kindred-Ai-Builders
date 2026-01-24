import Link from "next/link";
import { loadFacetIndexServer, facetOptions } from "@/lib/facet_index";

type Bucket = { id: string; title: string };

const BUCKETS: Bucket[] = [
  { id: "kit.auth.select", title: "Auth" },
  { id: "kit.db.select", title: "Database" },
  { id: "kit.storage.select", title: "Storage" },
  { id: "kit.email.select", title: "Email" },
  { id: "kit.search.select", title: "Search" },
  { id: "kit.ops.select", title: "Ops / Environment" },
];

export default function KitsPage() {
  const facetIndex = loadFacetIndexServer();

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Integrations are optional. They are intentionally bucketed so a Director can choose infrastructure in familiar terms
          (auth, storage, email...) without turning the core into a vendor list.
        </p>
        <p className="text-xs text-muted-foreground">
          Source of truth: facet registry (compiled to <code>public/__generated/compiled_facet_index.v1.json</code> in Proof/Build).
        </p>
      </header>

      {!facetIndex ? (
        <div className="rounded-xl border p-4 text-sm">
          Missing facet index. Run Proof Gate or <code>npm run compile_facet_index</code> to generate it.
        </div>
      ) : (
        <div className="space-y-6">
          {BUCKETS.map((b) => {
            const options = facetOptions(facetIndex, b.id);
            return (
              <section key={b.id} className="rounded-2xl border p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-lg font-medium">{b.title}</h2>
                  <span className="text-xs text-muted-foreground">Optional</span>
                </div>
                {options.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No options declared.</p>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {options.map((o) => (
                      <li key={o.id} className="rounded-xl border p-3">
                        <div className="font-medium">{o.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.ref?.kind === "library_kit" ? `Integration: ${o.ref.slug}` : o.ref?.kind === "none" ? "None" : "Integration"}
                        </div>
                        {o.meta?.description ? (
                          <p className="text-xs text-muted-foreground mt-1">{o.meta.description}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <footer className="text-sm">
        <Link href="/director" className="underline">
          Back to Director
        </Link>
      </footer>
    </main>
  );
}
