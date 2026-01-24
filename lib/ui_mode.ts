export type UIMode = "director" | "operator";

export const UI_MODE_KEY = "kindred.ui_mode.v1";
export const UI_MODE_EVENT = "kindred_ui_mode_changed";

export function readUIMode(): UIMode {
  try {
    const v = (localStorage.getItem(UI_MODE_KEY) || "").trim();
    if (v === "operator" || v === "director") return v;
  } catch {
    // ignore
  }
  return "director";
}

export function writeUIMode(mode: UIMode): void {
  try {
    localStorage.setItem(UI_MODE_KEY, mode);
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent(UI_MODE_EVENT, { detail: { mode } }));
  } catch {
    try {
      window.dispatchEvent(new Event(UI_MODE_EVENT));
    } catch {
      // ignore
    }
  }
}

export function toggleUIMode(): UIMode {
  const next: UIMode = readUIMode() === "director" ? "operator" : "director";
  writeUIMode(next);
  return next;
}
