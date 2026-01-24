export type FacetIndexOptionRef = {
  kind: string;
  slug?: string;
  path?: string;
  palette_id?: string;
  [k: string]: any;
};

export type FacetIndexOptionMeta = {
  title: string;
  description: string;
  tags: string[];
} | null;

export type CompiledFacetIndexV1 = {
  schema: "kindred.compiled_facet_index.v1";
  // Time belongs in receipts/logs; keep optional for backwards compatibility.
  generated_at_utc?: string;
  facets: Array<{
    id: string;
    owner_module_family: string;
    options: Array<{
      id: string;
      label: string;
      ref: FacetIndexOptionRef;
      meta: FacetIndexOptionMeta;
    }>;
  }>;
};

export function facetOptions(index: CompiledFacetIndexV1, facetId: string) {
  return index.facets.find((f) => f.id === facetId)?.options ?? [];
}

export function facetOptionById(index: CompiledFacetIndexV1, facetId: string, optionId: string) {
  return facetOptions(index, facetId).find((o) => o.id === optionId) ?? null;
}
