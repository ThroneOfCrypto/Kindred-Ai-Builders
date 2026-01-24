export type CapabilityDomainId =
  | "identity_access"
  | "content_knowledge"
  | "discovery_search"
  | "commerce_payments"
  | "workflows_automation"
  | "governance_audit"
  | "privacy_posture"
  | "scale_performance";

export type CapabilityLevel = 0 | 1 | 2 | 3;

export type CapabilityVectorV1 = {
  schema: "kindred.capability_vector.v1";
  levels: Record<CapabilityDomainId, CapabilityLevel>;
};

export const CAPABILITY_DOMAINS: {
  id: CapabilityDomainId;
  label: string;
  hint: string;
}[] = [
  {
    id: "identity_access",
    label: "Identity & Access",
    hint: "Accounts, roles, permissions, and safe defaults.",
  },
  {
    id: "content_knowledge",
    label: "Content & Knowledge",
    hint: "Pages, records, media, and structured knowledge.",
  },
  {
    id: "discovery_search",
    label: "Discovery & Search",
    hint: "Findability, filtering, ranking, and navigation.",
  },
  {
    id: "commerce_payments",
    label: "Commerce & Payments",
    hint: "Checkout, invoicing, subscriptions. Payments are always a Kit.",
  },
  {
    id: "workflows_automation",
    label: "Workflows & Automation",
    hint: "Steps, triggers, approvals, and operational flows.",
  },
  {
    id: "governance_audit",
    label: "Governance & Audit",
    hint: "Rules, proposals, evidence, and accountability.",
  },
  {
    id: "privacy_posture",
    label: "Privacy Posture",
    hint: "Non-custodial defaults, disclosure controls, and boundaries.",
  },
  {
    id: "scale_performance",
    label: "Scale & Performance",
    hint: "Latency, reliability, and growth posture.",
  },
];

export const CAPABILITY_LEVELS: { id: CapabilityLevel; label: string; hint: string }[] = [
  { id: 0, label: "Off", hint: "Not required for v1." },
  { id: 1, label: "Basic", hint: "Simple, low-risk needs." },
  { id: 2, label: "Serious", hint: "Core requirement. Expect real depth." },
  { id: 3, label: "Enterprise", hint: "High rigor. Expect strong governance/proof." },
];

export function defaultCapabilityVector(): CapabilityVectorV1 {
  // Balanced defaults: assume a director wants a credible product without over-claiming.
  return {
    schema: "kindred.capability_vector.v1",
    levels: {
      identity_access: 1,
      content_knowledge: 2,
      discovery_search: 1,
      commerce_payments: 0,
      workflows_automation: 1,
      governance_audit: 1,
      privacy_posture: 2,
      scale_performance: 1,
    },
  };
}

function clampLevel(x: unknown): CapabilityLevel {
  const n = Number(x);
  if (!Number.isFinite(n)) return 1;
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n === 2) return 2;
  return 3;
}

export function normalizeCapabilityVector(raw: unknown): CapabilityVectorV1 {
  const base = defaultCapabilityVector();
  const r: any = raw && typeof raw === "object" ? raw : {};
  const levels: any = r.levels && typeof r.levels === "object" ? r.levels : {};
  const next: Record<CapabilityDomainId, CapabilityLevel> = { ...base.levels };
  for (const d of CAPABILITY_DOMAINS) {
    next[d.id] = clampLevel(levels[d.id]);
  }
  return { schema: "kindred.capability_vector.v1", levels: next };
}

export function capabilityVectorSummary(vec: CapabilityVectorV1): string {
  const parts: string[] = [];
  for (const d of CAPABILITY_DOMAINS) {
    const v = vec.levels[d.id];
    const label = CAPABILITY_LEVELS.find((x) => x.id === v)?.label || String(v);
    parts.push(`${d.label}: ${label}`);
  }
  return parts.join(" · ");
}
