"use client";

// Guided Mode is a Director-only posture intended for non-technical users.
// It reduces navigation and surfaces a single "next best action" loop.
// Default posture: guided mode is ON for new users, but can be toggled off.

export const GUIDED_MODE_KEY = "kindred.ui_guided_mode.v1";
export const GUIDED_MODE_EVENT = "kindred_ui_guided_mode_changed";

export function readGuidedMode(): boolean {
  try {
    const raw = localStorage.getItem(GUIDED_MODE_KEY);
    if (!raw) return true; // default ON
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

export function writeGuidedMode(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(GUIDED_MODE_KEY, "1");
    else localStorage.removeItem(GUIDED_MODE_KEY);
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new CustomEvent(GUIDED_MODE_EVENT));
  } catch {
    // ignore
  }
}

export function toggleGuidedMode(): boolean {
  const next = !readGuidedMode();
  writeGuidedMode(next);
  return next;
}
