export type GoldenPathEvent = {
  ts_utc: string;
  event: string;
  page: string;
  details?: Record<string, any>;
};

const LS_KEY = "kindred.golden_path_events.v1";

function nowUtc() {
  return new Date().toISOString();
}

export function gpRecord(event: string, page: string, details?: Record<string, any>) {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr: GoldenPathEvent[] = raw ? JSON.parse(raw) : [];
    arr.push({ ts_utc: nowUtc(), event, page, details: details || {} });
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export function gpRead(): GoldenPathEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as GoldenPathEvent[]) : [];
  } catch {
    return [];
  }
}

export function gpClear() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

export function gpExport(version: string) {
  const events = gpRead();
  const payload = {
    schema: "kindred.golden_path_export.v1",
    exported_at_utc: nowUtc(),
    app_version: version,
    events,
  };
  return payload;
}
