"use client";

import type { DomainId, PaletteId } from "./types";

// Deterministic, deploy-safe manifest import.
// The manifest contains no secrets; it is part of the public blueprint.
import manifest from "../blueprint/domains/manifest.json";

export type DomainCardV1 = {
  id: DomainId;
  label: string;
  palettes: PaletteId[];
  intent: string;
  outputs: string[];
};

type ManifestV1 = {
  schema: "DOMAINS_MANIFEST_V1";
  domains: {
    id: DomainId;
    label: string;
    palettes: PaletteId[];
    intent?: string;
    outputs?: string[];
  }[];
};

export const DOMAINS_V1: DomainCardV1[] = ((manifest as any) as ManifestV1).domains.map((d) => ({
  id: d.id,
  label: String(d.label || d.id),
  palettes: Array.isArray(d.palettes) ? (d.palettes as PaletteId[]) : [],
  intent: String(d.intent || ""),
  outputs: Array.isArray(d.outputs) ? d.outputs.map((x) => String(x || "")).filter((x) => x.trim()) : [],
}));

export function labelForDomain(id: DomainId): string {
  return DOMAINS_V1.find((x) => x.id === id)?.label ?? id;
}

export function normalizeDomainIds(ids: DomainId[]): DomainId[] {
  const cleaned = (Array.isArray(ids) ? ids : [])
    .map((x) => String(x || "").trim())
    .filter((x) => x.length > 0)
    .filter((x) => /^[a-zA-Z0-9_\-.]+$/.test(x));
  const set = new Set(cleaned);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function domainsForPalettes(selected: PaletteId[]): DomainCardV1[] {
  const palettes = Array.isArray(selected) ? selected : [];
  if (palettes.length === 0) return [];
  const set = new Set(palettes);
  return DOMAINS_V1.filter((d) => (d.palettes || []).some((p) => set.has(p)));
}
