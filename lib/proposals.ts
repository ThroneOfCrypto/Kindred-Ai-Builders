"use client";

import { SpecPackPatchV1 } from "./spec_pack_patch";

export type ProposalV1 = {
  schema: "kindred.proposal.v1";
  id: string;
  created_at_utc: string;
  base_project_id?: string;
  proposal_project_id?: string;
  summary: string;
  patch: string;
  stats: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
};

export type ProposalV2 = {
  schema: "kindred.proposal.v2";
  id: string;
  created_at_utc: string;
  summary: string;
  patch: SpecPackPatchV1;
};

export type AnyProposal = ProposalV2 | ProposalV1;

const KEY_V1 = "kindred_proposals_v1";
const KEY_V2 = "kindred_proposals_v2";

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function normalizeV1(raw: any): ProposalV1 | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.schema !== "kindred.proposal.v1") return null;
  if (typeof raw.id !== "string" || typeof raw.created_at_utc !== "string") return null;
  if (typeof raw.summary !== "string" || typeof raw.patch !== "string") return null;
  const stats = raw.stats;
  if (!stats || typeof stats !== "object") return null;
  const sOk =
    typeof stats.added === "number" &&
    typeof stats.removed === "number" &&
    typeof stats.modified === "number" &&
    typeof stats.unchanged === "number";
  if (!sOk) return null;
  return {
    schema: "kindred.proposal.v1",
    id: raw.id,
    created_at_utc: raw.created_at_utc,
    base_project_id: typeof raw.base_project_id === "string" ? raw.base_project_id : undefined,
    proposal_project_id: typeof raw.proposal_project_id === "string" ? raw.proposal_project_id : undefined,
    summary: raw.summary,
    patch: raw.patch,
    stats: {
      added: stats.added,
      removed: stats.removed,
      modified: stats.modified,
      unchanged: stats.unchanged,
    },
  };
}

function normalizeV2(raw: any): ProposalV2 | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.schema !== "kindred.proposal.v2") return null;
  if (typeof raw.id !== "string" || typeof raw.created_at_utc !== "string") return null;
  if (typeof raw.summary !== "string") return null;
  const patch = raw.patch;
  if (!patch || typeof patch !== "object") return null;
  if (patch.schema !== "kindred.spec_pack_patch.v1") return null;
  if (typeof patch.created_at_utc !== "string" || typeof patch.summary !== "string" || typeof patch.patch_text !== "string") return null;
  if (!Array.isArray(patch.ops)) return null;
  const stats = patch.stats;
  if (!stats || typeof stats !== "object") return null;

  return {
    schema: "kindred.proposal.v2",
    id: raw.id,
    created_at_utc: raw.created_at_utc,
    summary: raw.summary,
    patch: patch as SpecPackPatchV1,
  };
}

function loadList(key: string): any[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const parsed = safeJsonParse<any>(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed;
}

export function loadProposals(): AnyProposal[] {
  try {
    const v2Raw = loadList(KEY_V2);
    const v1Raw = loadList(KEY_V1);

    const v2 = v2Raw.map(normalizeV2).filter((x): x is ProposalV2 => Boolean(x));
    const v1 = v1Raw.map(normalizeV1).filter((x): x is ProposalV1 => Boolean(x));

    const all: AnyProposal[] = [...v2, ...v1];
    all.sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc));
    return all;
  } catch {
    return [];
  }
}

export function saveProposal(p: AnyProposal): AnyProposal[] {
  const all = loadProposals();
  const next = [p, ...all.filter((x) => x.id !== p.id)];

  // Persist v2 separately; keep v1 legacy storage intact.
  const v2 = next.filter((x): x is ProposalV2 => x.schema === "kindred.proposal.v2");
  try {
    localStorage.setItem(KEY_V2, JSON.stringify(v2));
  } catch {
    // ignore
  }
  return next;
}

export function deleteProposal(id: string): AnyProposal[] {
  const all = loadProposals();
  const next = all.filter((p) => p.id !== id);

  const v1 = next.filter((x): x is ProposalV1 => x.schema === "kindred.proposal.v1");
  const v2 = next.filter((x): x is ProposalV2 => x.schema === "kindred.proposal.v2");

  try {
    localStorage.setItem(KEY_V1, JSON.stringify(v1));
  } catch {
    // ignore
  }
  try {
    localStorage.setItem(KEY_V2, JSON.stringify(v2));
  } catch {
    // ignore
  }
  return next;
}

export function isApplyable(p: AnyProposal): p is ProposalV2 {
  return p.schema === "kindred.proposal.v2";
}
