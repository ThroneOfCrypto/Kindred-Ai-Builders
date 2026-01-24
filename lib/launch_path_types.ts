import type { BuildIntentId, LaunchPathId, PaletteId, PrimarySurface } from "./types";

export type LaunchPathInfo = {
  id: LaunchPathId;
  title: string;
  desc: string;
  // Deterministic mapping: Launch Path -> default template compile target.
  // Prevents drift between "starting experience" and "compiled template artifacts".
  default_template_slug: string;
  intent: {
    build_intent: BuildIntentId;
    primary_surface: PrimarySurface;
    palettes: PaletteId[];
  };
};
