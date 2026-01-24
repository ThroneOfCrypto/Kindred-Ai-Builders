import fs from "node:fs";
import path from "node:path";
import type { CompiledFacetIndexV1 } from "./facet_index_shared";
import { facetOptions } from "./facet_index_shared";

function readJsonIfExists<T>(absPath: string): T | null {
  try {
    if (!fs.existsSync(absPath)) return null;
    const raw = fs.readFileSync(absPath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Server-side loader:
 * - Prefers generated public/__generated/compiled_facet_index.v1.json (produced by Proof/Build)
 * - Falls back to blueprint/taxonomy/facet_registry.v1.json ONLY in development when generated file is missing
 */
export function loadFacetIndexServer(): CompiledFacetIndexV1 | null {
  const generatedAbs = path.join(process.cwd(), "public", "__generated", "compiled_facet_index.v1.json");
  const compiled = readJsonIfExists<CompiledFacetIndexV1>(generatedAbs);
  if (compiled && compiled.schema === "kindred.compiled_facet_index.v1") return compiled;

  // Runtime surfaces must not source options from the raw facet registry in production.
  // That is how you get "Settings Panel Hell": compiler-only facets leaking into runtime.
  if (process.env.NODE_ENV === "production") return null;

  // Minimal fallback: surface facet registry options (without library meta resolution).
  const frAbs = path.join(process.cwd(), "blueprint", "taxonomy", "facet_registry.v1.json");
  const fr = readJsonIfExists<any>(frAbs);
  if (!fr || fr.schema !== "kindred.facet_registry.v1") return null;

  return {
    schema: "kindred.compiled_facet_index.v1",
    generated_at_utc: new Date().toISOString(),
    facets: (Array.isArray(fr.facets) ? fr.facets : [])
      .filter((f: any) => f && typeof f === "object" && String(f.visibility || "") === "runtime")
      .map((f: any) => ({
      id: String(f.id || ""),
      owner_module_family: String(f.owner_module_family || ""),
      options: (Array.isArray(f.options) ? f.options : []).map((o: any) => ({
        id: String(o.id || ""),
        label: String(o.label || ""),
        ref: o.ref && typeof o.ref === "object" ? o.ref : { kind: "none" },
        meta: null,
      })),
    })),
  };
}

export { facetOptions };
