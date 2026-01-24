"use client";

import type { PaletteId } from "./types";

// Note: imported statically for deterministic, stdlib-friendly UI.
// This file is deploy-safe; the manifest contains no secrets.
import manifest from "../blueprint/palettes/manifest.json";

export type PaletteCardV1 = {
  id: PaletteId;
  label: string;
  why: string;
};

type ManifestV1 = {
  schema: "PALETTES_MANIFEST_V1";
  palettes: { id: PaletteId; label: string; why: string }[];
};

export const PALETTES_V1: PaletteCardV1[] = (manifest as ManifestV1).palettes;

export function labelForPalette(id: PaletteId): string {
  return PALETTES_V1.find((x) => x.id === id)?.label ?? id;
}
