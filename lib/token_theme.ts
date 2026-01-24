import { ProjectState } from "./types";
import { ZIP_MTIME_UTC } from "./version";

export type ResolvedThemeMode = "light" | "dark";

export type CssVarMap = Record<string, string>;

export type CompiledTokensV1 = {
  schema: "kindred.design.tokens_compiled.v1";
  compiled_at_utc: string;
  input: ProjectState["design"]["tokens"];
  themes: {
    light: {
      mode: "light";
      css_vars: CssVarMap;
    };
    dark: {
      mode: "dark";
      css_vars: CssVarMap;
    };
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function px(n: number): string {
  return `${Math.round(n)}px`;
}

function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const aa = clamp(a, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${aa})`;
}

function baseVarsForMode(mode: ResolvedThemeMode, contrast: "balanced" | "high"): CssVarMap {
  if (mode === "light") {
    const border = contrast === "high" ? "#4b556d" : "#cbd5e1";
    const muted = contrast === "high" ? "#2a3344" : "#475569";
    return {
      "--bg": "#f6f7fb",
      "--panel": "#ffffff",
      "--panel-2": "#f1f5f9",
      "--text": "#0f172a",
      "--muted": muted,
      "--border": border,
      "--primary": "#2563eb",
      "--primary-2": "#1d4ed8",
      "--danger": "#dc2626",
      "--ok": "#0f766e",
    };
  }

  // dark
  const border = contrast === "high" ? "#4b5a86" : "#2b3558";
  const muted = contrast === "high" ? "#c4cbe0" : "#a8b0c6";
  return {
    "--bg": "#0b0d12",
    "--panel": "#111525",
    "--panel-2": "#161b2f",
    "--text": "#e9ecf5",
    "--muted": muted,
    "--border": border,
    "--primary": "#6ea8fe",
    "--primary-2": "#3f7df2",
    "--danger": "#ff6b6b",
    "--ok": "#2dd4bf",
  };
}

function radiusVars(radius: ProjectState["design"]["tokens"]["radius"]): CssVarMap {
  const map: Record<string, number> = { sharp: 10, balanced: 14, round: 18 };
  return { "--radius": px(map[radius] ?? 14) };
}

function densityVars(density: ProjectState["design"]["tokens"]["density"]): CssVarMap {
  if (density === "compact") {
    return {
      "--space-1": px(6),
      "--space-2": px(10),
      "--space-3": px(14),
      "--space-4": px(20),
    };
  }
  if (density === "airy") {
    return {
      "--space-1": px(10),
      "--space-2": px(14),
      "--space-3": px(18),
      "--space-4": px(28),
    };
  }
  return {
    "--space-1": px(8),
    "--space-2": px(12),
    "--space-3": px(16),
    "--space-4": px(24),
  };
}

function typeVars(scale: ProjectState["design"]["tokens"]["type_scale"], line: ProjectState["design"]["tokens"]["line_height"]): CssVarMap {
  const base = scale === "small" ? 14 : scale === "large" ? 18 : 16;
  const lh = line === "tight" ? 1.4 : line === "relaxed" ? 1.8 : 1.6;
  return {
    "--font-base": px(base),
    "--line-height": String(lh),
  };
}

function focusVars(focus: ProjectState["design"]["tokens"]["focus"], primary: string): CssVarMap {
  const size = focus === "high" ? 4 : 3;
  return {
    "--focus-ring-size": px(size),
    "--focus-ring-color": rgba(primary, 0.18),
    "--focus-border-color": rgba(primary, 0.7),
  };
}

function elevationVars(e: ProjectState["design"]["tokens"]["elevation"]): CssVarMap {
  if (e === "flat") {
    return {
      "--shadow-panel": "0 0 0 rgba(0,0,0,0)",
      "--shadow-float": "0 6px 18px rgba(0,0,0,0.18)",
    };
  }
  if (e === "deep") {
    return {
      "--shadow-panel": "0 14px 50px rgba(0,0,0,0.48)",
      "--shadow-float": "0 18px 60px rgba(0,0,0,0.52)",
    };
  }
  return {
    "--shadow-panel": "0 10px 30px rgba(0,0,0,0.35)",
    "--shadow-float": "0 12px 40px rgba(0,0,0,0.4)",
  };
}

function layoutWidthVars(w: ProjectState["design"]["tokens"]["layout_width"]): CssVarMap {
  const pxWidth = w === "narrow" ? 960 : w === "wide" ? 1280 : 1100;
  return { "--max": px(pxWidth) };
}

function motionVars(m: ProjectState["design"]["tokens"]["motion"]): CssVarMap {
  if (m === "none") {
    return {
      "--motion-fast": "0ms",
      "--motion-slow": "0ms",
    };
  }
  if (m === "lively") {
    return {
      "--motion-fast": "140ms",
      "--motion-slow": "240ms",
    };
  }
  // subtle
  return {
    "--motion-fast": "120ms",
    "--motion-slow": "200ms",
  };
}

function voiceVars(v: ProjectState["design"]["tokens"]["voice"]): CssVarMap {
  // Voice is mostly semantic; for now it only nudges accent a touch.
  if (v === "playful") {
    return { "--primary": "#8b5cf6", "--primary-2": "#7c3aed" };
  }
  return {};
}

export function compileThemeVars(input: ProjectState["design"]["tokens"], mode: ResolvedThemeMode): CssVarMap {
  const base = baseVarsForMode(mode, input.contrast);
  const primary = (voiceVars(input.voice)["--primary"] as string | undefined) || base["--primary"];
  return {
    ...base,
    ...voiceVars(input.voice),
    ...radiusVars(input.radius),
    ...densityVars(input.density),
    ...typeVars(input.type_scale, input.line_height),
    ...focusVars(input.focus, primary),
    ...elevationVars(input.elevation),
    ...layoutWidthVars(input.layout_width),
    ...motionVars(input.motion),
  };
}

export function compileTokensForExport(input: ProjectState["design"]["tokens"]): CompiledTokensV1 {
  return {
    schema: "kindred.design.tokens_compiled.v1",
    // Determinism: avoid export-time timestamps.
    compiled_at_utc: ZIP_MTIME_UTC,
    input,
    themes: {
      light: { mode: "light", css_vars: compileThemeVars(input, "light") },
      dark: { mode: "dark", css_vars: compileThemeVars(input, "dark") },
    },
  };
}
