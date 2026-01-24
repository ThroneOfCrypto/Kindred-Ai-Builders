"use client";

import type { BuildIntentId } from "./types";

export type OptionV1 = {
  id: BuildIntentId;
  label: string;
  why: string;
};

export const OPTIONS_V1: OptionV1[] = [
  { id: "website", label: "Website", why: "Pages, docs, and a clear public presence." },
  { id: "product_app", label: "Product App", why: "An interactive app with accounts, data, and flows." },
  { id: "marketplace", label: "Marketplace", why: "Listings, discovery, trust, and transactions (Kits opt-in)." },
  { id: "community", label: "Community", why: "Groups, content, membership, and moderation posture." },
  { id: "automation", label: "Automation", why: "Workflows, orchestration, and operational tooling." },
  { id: "data_api", label: "Data / API", why: "A service posture: APIs, integrations, and structured data." },
  { id: "governed_system", label: "Governed System", why: "Proposals, policy, voting, and evidence-first operations." },
];

export function labelForOption(id: BuildIntentId): string {
  return OPTIONS_V1.find((x) => x.id === id)?.label ?? id;
}
