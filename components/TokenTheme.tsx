"use client";

import React, { useEffect } from "react";
import { loadState } from "../lib/state";
import { compileThemeVars, ResolvedThemeMode } from "../lib/token_theme";

function prefersDark(): boolean {
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true;
  }
}

function resolveMode(mode: "light" | "dark" | "system"): ResolvedThemeMode {
  if (mode === "system") return prefersDark() ? "dark" : "light";
  return mode;
}

function applyCssVars(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}

export function TokenTheme() {
  useEffect(() => {
    let mm: MediaQueryList | null = null;

    const apply = () => {
      const s = loadState();
      const mode = resolveMode(s.design.tokens.mode);
      const vars = compileThemeVars(s.design.tokens, mode);
      applyCssVars(vars);
      try {
        document.documentElement.dataset.theme = mode;
      } catch {
        // ignore
      }
    };

    apply();

    const onState = () => apply();

    window.addEventListener("kindred_state_changed", onState);
    window.addEventListener("storage", onState);

    try {
      mm = window.matchMedia("(prefers-color-scheme: dark)");
      mm.addEventListener("change", onState);
    } catch {
      // ignore
    }

    return () => {
      window.removeEventListener("kindred_state_changed", onState);
      window.removeEventListener("storage", onState);
      try {
        mm?.removeEventListener("change", onState);
      } catch {
        // ignore
      }
    };
  }, []);

  return null;
}
