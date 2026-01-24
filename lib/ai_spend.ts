// Client-side only spend awareness + budget guardrails.
// Non-custodial: this is estimation and local receipts only.

export type AiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AiReceiptV1 = {
  schema: "kindred.ai_receipt.v1";
  ts_utc: string; // ISO
  route: string;
  mode: "offline" | "hosted" | "local" | "unknown";
  model?: string;
  usage?: AiUsage;
  estimated_cost_usd?: number;
  note?: string;
};

export type AiBudgetV1 = {
  schema: "kindred.ai_budget.v1";
  // Rates are $ per 1M tokens. User-set (provider truth).
  input_rate_per_1m: number;
  output_rate_per_1m: number;
  // Guardrails are USD, local-only.
  soft_cap_usd: number; // warn/confirm
  hard_cap_usd: number; // block
  // Window in days for cap calculations.
  window_days: number;
};

const LS_RECEIPTS = "sdde_ai_receipts_v1";
const LS_BUDGET = "sdde_ai_budget_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeJsonParse(s: string | null): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function asNum(x: any, fb: number): number {
  const n = typeof x === "number" ? x : parseFloat(String(x || ""));
  return Number.isFinite(n) ? n : fb;
}

export function getDefaultBudget(): AiBudgetV1 {
  return {
    schema: "kindred.ai_budget.v1",
    input_rate_per_1m: 0.8,
    output_rate_per_1m: 3.2,
    soft_cap_usd: 5,
    hard_cap_usd: 25,
    window_days: 30,
  };
}

export function loadAiBudget(): AiBudgetV1 {
  if (!isBrowser()) return getDefaultBudget();
  const raw = safeJsonParse(window.localStorage.getItem(LS_BUDGET));
  const fb = getDefaultBudget();
  if (!raw || typeof raw !== "object") return fb;
  return {
    schema: "kindred.ai_budget.v1",
    input_rate_per_1m: asNum(raw.input_rate_per_1m, fb.input_rate_per_1m),
    output_rate_per_1m: asNum(raw.output_rate_per_1m, fb.output_rate_per_1m),
    soft_cap_usd: asNum(raw.soft_cap_usd, fb.soft_cap_usd),
    hard_cap_usd: asNum(raw.hard_cap_usd, fb.hard_cap_usd),
    window_days: Math.max(1, Math.floor(asNum(raw.window_days, fb.window_days))),
  };
}

export function saveAiBudget(b: AiBudgetV1): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(LS_BUDGET, JSON.stringify(b));
  } catch {
    // ignore
  }
}

export function loadAiReceipts(): AiReceiptV1[] {
  if (!isBrowser()) return [];
  const raw = safeJsonParse(window.localStorage.getItem(LS_RECEIPTS));
  const arr = Array.isArray(raw) ? raw : [];
  const out: AiReceiptV1[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const ts_utc = typeof r.ts_utc === "string" ? r.ts_utc : "";
    const route = typeof r.route === "string" ? r.route : "";
    if (!ts_utc || !route) continue;
    out.push({
      schema: "kindred.ai_receipt.v1",
      ts_utc,
      route,
      mode: (r.mode === "offline" || r.mode === "hosted" || r.mode === "local" ? r.mode : "unknown") as any,
      model: typeof r.model === "string" ? r.model : undefined,
      usage: r.usage && typeof r.usage === "object" ? r.usage : undefined,
      estimated_cost_usd: typeof r.estimated_cost_usd === "number" ? r.estimated_cost_usd : undefined,
      note: typeof r.note === "string" ? r.note : undefined,
    });
  }
  // newest first
  out.sort((a, b) => String(b.ts_utc).localeCompare(String(a.ts_utc)));
  return out;
}

export function appendAiReceipt(r: AiReceiptV1): void {
  if (!isBrowser()) return;
  const existing = loadAiReceipts();
  const next = [r, ...existing].slice(0, 200);
  try {
    window.localStorage.setItem(LS_RECEIPTS, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearAiReceipts(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(LS_RECEIPTS);
  } catch {
    // ignore
  }
}

export function estimateUsdFromUsage(usage: AiUsage | undefined, budget: AiBudgetV1): number {
  const pt = typeof usage?.prompt_tokens === "number" ? usage!.prompt_tokens! : 0;
  const ct = typeof usage?.completion_tokens === "number" ? usage!.completion_tokens! : 0;
  const cost = (pt / 1_000_000) * budget.input_rate_per_1m + (ct / 1_000_000) * budget.output_rate_per_1m;
  return Number.isFinite(cost) ? cost : 0;
}

export function receiptsTotalUsdWithinWindow(receipts: AiReceiptV1[], windowDays: number): number {
  const now = Date.now();
  const ms = windowDays * 24 * 60 * 60 * 1000;
  let sum = 0;
  for (const r of receipts) {
    const t = Date.parse(r.ts_utc);
    if (!Number.isFinite(t)) continue;
    if (now - t > ms) continue;
    if (typeof r.estimated_cost_usd === "number") sum += r.estimated_cost_usd;
  }
  return Number.isFinite(sum) ? sum : 0;
}

export function preflightAiSpend(args: {
  estimated_usage: AiUsage;
  route: string;
}): { allow: true; estimated_cost_usd: number; window_total_usd: number; budget: AiBudgetV1 } | { allow: false; hard: boolean; reason: string; estimated_cost_usd: number; window_total_usd: number; budget: AiBudgetV1 } {
  const budget = loadAiBudget();
  const estCost = estimateUsdFromUsage(args.estimated_usage, budget);
  const receipts = loadAiReceipts();
  const windowTotal = receiptsTotalUsdWithinWindow(receipts, budget.window_days);
  const nextTotal = windowTotal + estCost;
  if (nextTotal >= budget.hard_cap_usd) {
    return {
      allow: false,
      hard: true,
      reason: `Hard cap exceeded for the last ${budget.window_days} day(s).`,
      estimated_cost_usd: estCost,
      window_total_usd: windowTotal,
      budget,
    };
  }
  if (nextTotal >= budget.soft_cap_usd) {
    return {
      allow: false,
      hard: false,
      reason: `Soft cap reached for the last ${budget.window_days} day(s).`,
      estimated_cost_usd: estCost,
      window_total_usd: windowTotal,
      budget,
    };
  }
  return { allow: true, estimated_cost_usd: estCost, window_total_usd: windowTotal, budget };
}

// Rough but deterministic: ~4 chars per token (English-ish). Used only for pre-run estimates.
export function estimateTokensFromText(text: string, maxTokens = 20000): number {
  const t = typeof text === "string" ? text : "";
  const est = Math.ceil(t.length / 4);
  return Math.max(0, Math.min(maxTokens, est));
}
