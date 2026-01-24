"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompiledFacetIndexV1 } from "./facet_index_shared";
import { facetOptions } from "./facet_index_shared";

const GENERATED_PATH = "/__generated/compiled_facet_index.v1.json";

export async function loadFacetIndexClient(): Promise<CompiledFacetIndexV1 | null> {
  try {
    const res = await fetch(GENERATED_PATH, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    if (!j || j.schema !== "kindred.compiled_facet_index.v1") return null;
    return j as CompiledFacetIndexV1;
  } catch {
    return null;
  }
}

export function useFacetIndex() {
  const [index, setIndex] = useState<CompiledFacetIndexV1 | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "missing">("idle");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    loadFacetIndexClient().then((j) => {
      if (!alive) return;
      if (j) {
        setIndex(j);
        setStatus("ok");
      } else {
        setIndex(null);
        setStatus("missing");
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return { index, status } as const;
}

export { facetOptions };
