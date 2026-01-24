"use client";

// Advanced Mode is an opt-in set of surfaces intended for tinkerers.
// Default posture: advanced mode is OFF.
//
// When enabled, the UI may expose Council-facing artefacts (SPEL previews, deep audits)
// and other operator-only tools. Core flows must remain fully usable with advanced OFF.

export const ADVANCED_MODE_KEY = "kindred.ui_advanced_mode.v1";
export const ADVANCED_MODE_EVENT = "kindred_ui_advanced_mode_changed";

export function readAdvancedMode(): boolean {
  try {
    const raw = localStorage.getItem(ADVANCED_MODE_KEY);
    if (!raw) return false;
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

export function writeAdvancedMode(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(ADVANCED_MODE_KEY, "1");
    else localStorage.removeItem(ADVANCED_MODE_KEY);
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new CustomEvent(ADVANCED_MODE_EVENT));
  } catch {
    // ignore
  }
}

export function toggleAdvancedMode(): boolean {
  const next = !readAdvancedMode();
  writeAdvancedMode(next);
  return next;
}
