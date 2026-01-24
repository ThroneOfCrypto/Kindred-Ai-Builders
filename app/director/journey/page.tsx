"use client";

import React, {useEffect, useMemo, useRef, useState} from "react";
import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { LocalNetworkAccessHelp, isLikelyLocalNetworkAccessBlock } from "../_components/local_network_access_help";

// Director Journey v1
// - Director-first: plain language only.
// - One narrative path.
// - No internal jargon (no "kits", "capabilities", "periodic", etc.).

type Seriousness = "prototype" | "real" | "critical";
type BuildGoal = "sell" | "organise" | "teach" | "share" | "match" | "manage" | "automate" | "govern";
type Sector =
  | "retail"
  | "community"
  | "real_estate"
  | "health"
  | "finance"
  | "media"
  | "education"
  | "saas"
  | "other";

type Audience = "public" | "members" | "internal" | "clients";
type Outcome = "browse" | "create" | "buy" | "book" | "message" | "track";
type Surface = "website" | "app" | "internal";
type Team = "solo" | "small_team" | "org";
type Integrations = "none" | "later" | "yes";
type Speed = "days" | "weeks" | "months";

type Sensitive = "money" | "private_data" | "identity" | "moderation";

type BriefSeed = {
  goal: BuildGoal;
  sector?: Sector;
  seriousness: Seriousness;
  one_sentence?: string;
};

type BriefPack = {
  audience: Audience;
  outcome: Outcome;
  must_have: string[];
  can_wait: string[];
  accounts: boolean;
  sensitive: Sensitive[];
  feel: "calm" | "playful" | "premium" | "utilitarian";
  surface: Surface;
  team: Team;
  integrations: Integrations;
  speed: Speed;
  success: string[];
  must_not?: string;
  unusual_flag?: boolean;
  unusual?: string;
  constraints?: string;
  creative_push?: "safe" | "balanced" | "bold";
  // conditional answers
  payments_states?: "yes"; // forced if money
  receipts_history?: "yes"; // forced if money
  refunds_undo?: boolean; // only if money
  reports?: boolean; // if moderation
  appeals?: boolean; // if moderation
  separation_of_duties?: boolean; // optional if moderation
  integration_resilience?: "yes"; // forced if integrations yes
  receives_webhooks?: boolean; // if integrations yes
  track_uptime_errors?: "yes"; // forced if critical
  safe_under_traffic?: "yes"; // forced if critical
};

type ProposalScope = "starter" | "standard" | "ambitious";
type Proposal = {
  id: string;
  name: string;
  scope: ProposalScope;
  summary: string;
  features: string[];
  risks_handled: string[];
  complexity: "simple" | "medium" | "high";
  timeline: string;
};

type Vibe = "calm" | "playful" | "premium" | "utilitarian";
type StylePack = {
  vibe: Vibe;
  typography: "classic" | "modern" | "bold";
  shape: "rounded" | "flat" | "soft" | "sharp";
  palette: "light" | "dark" | "warm" | "cool";
};

// Project Assets (Director-safe)
// - Vercel stores ONLY metadata + hashes + slot mapping.
// - Connector stores bytes locally and verifies hashes.
type AssetKind = "image" | "logo";
type AssetSource = "url" | "upload" | "ai";

type AssetSlot = {
  slot_id: string;
  kind: AssetKind;
  label?: string;
  help?: string;
  aspect_ratio: string; // e.g. "1:1", "16:9"
  min_size: string; // human text, e.g. "512x512"
  required: boolean;
};

type AssetChoice = {
  slot_id: string;
  source: AssetSource;
  asset_id?: string;
  sha256?: string;
  bytes?: number;
  mime?: string;
  // source-specific metadata
  url?: string;
  filename?: string;
  prompt?: string;
  style_hints?: string[];
  created_at: string;
};

type AssetManifestV1 = {
  v: 1;
  for_proposal_id?: string;
  brand_creation_enabled: boolean;
  slots: AssetSlot[];
  choices: Record<string, AssetChoice>;
};

type InspirationLabel = "like" | "dislike" | "must_match" | "avoid";
type InspirationItem = {
  id: string;
  kind: "link" | "upload";
  label: InspirationLabel;
  url?: string;
  filename?: string;
  size_bytes?: number;
  sha256?: string;
  reason_chips: string[];
  notes?: string;
  added_at: string;
};

type TasteVector = {
  // Deterministic, editable summary derived from Inspiration Vault + tags.
  chips: string[];
  confidence: "low" | "medium" | "high";
};

type ProposalBasisSummary = {
  goal: BuildGoal;
  sector?: Sector;
  seriousness: Seriousness;
  creative_push: "safe" | "balanced" | "bold";
  inspiration_count: number;
  tags_count: number;
  taste_confidence: "low" | "medium" | "high";
  taste_locked: boolean;
  brownfield: boolean;
  // Small, human-readable highlights used for “What changed” explanations.
  highlights: string[];
};

type ShipPackBasisSummary = {
  goal: BuildGoal;
  sector?: Sector;
  seriousness: Seriousness;
  creative_push: "safe" | "balanced" | "bold";
  inspiration_count: number;
  tags_count: number;
  taste_confidence: "low" | "medium" | "high";
  taste_locked: boolean;
  style_locked: boolean;
  selected_proposal_id: string;
  selected_proposal_name?: string;
  ai_brand_id?: string | null;
  ai_model_id?: string | null;
  // Small, human-readable highlights used for “What changed since lock” explanations.
  highlights: string[];
};

type JourneyState = {
  v: 1;
  step: number;
  brief_section?: 0 | 1 | 2;
  seed: BriefSeed;
  brief?: BriefPack;
  inspiration?: InspirationItem[];
  taste_vector?: TasteVector;
  taste_locked?: boolean;
  proposals?: Proposal[];
  // Previous proposal set (escape hatch for fickle Directors).
  proposals_prev?: Proposal[];
  proposals_prev_basis_hash?: string;
  proposals_prev_basis_summary?: ProposalBasisSummary;
  proposals_prev_generated_at?: string;
  // Change detection for “stale options” when the Director edits inputs after proposals were generated.
  proposals_basis_hash?: string;
  proposals_basis_summary?: ProposalBasisSummary;
  proposals_generated_at?: string;
  proposals_regenerating?: boolean;
  proposals_regen_requested_at?: string;
  proposals_regen_error?: string;
  proposals_regen_error_code?: string;
  proposals_regen_retry_after_ms?: number;
  selected_proposal_id?: string;
  refined_features?: string[];
  // Optional “extra improvements” the Director can add without deep technical decisions.
  upgrades?: string[];
  // Project assets: logo + images. Deterministic slots + chosen sources.
  asset_manifest?: AssetManifestV1;
  style?: StylePack;
  style_locked?: boolean;
  tags?: string[];
  // Explicit "lock" for fickle Directors. Drafts can still be exported, but only with acknowledgement.
  ship_pack_locked?: boolean;
  ship_pack_locked_at?: string | null;
  ship_pack_locked_basis_hash?: string;
  ship_pack_locked_basis_summary?: ShipPackBasisSummary;
};

const STORAGE_KEY = "kindred.director_journey.v1";
const AI_KEY_V1 = "kindred.ai.connection.v1";
const AI_KEY_V2 = "kindred.ai.connection.v2";
const AI_OPTOUT_KEY = "kindred.ai.opt_out.v1";
const BF_KEY = "kindred.brownfield.v1";

type AiConnection = {
  v: 1;
  mode: "local_connector" | "local_ollama";
  connector_url?: string;
  ollama_url?: string;
  primary_provider?: string; // back-compat
  preferred_engine?: "fast" | "reasoning" | "coding";
  preferred_provider_id?: string;
  pairing_code?: string;
  connected: boolean;
  updated_at: string;
};

type BrownfieldState = {
  v: 1;
  git_url?: string;
  local_root?: string;
  inventory?: {
    artifacts?: {
      route_map?: any;
      spel_skeleton?: string;
      report_md?: string;
    };
  };
  updated_at: string;
};

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

async function postJson(url: string, body: any, pairingCode?: string, extraHeaders?: Record<string, string>): Promise<any> {
  const ctrl = new AbortController();
  // Local connector calls should fail fast (keeps the Director out of spinner hell).
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      ...( { targetAddressSpace: "loopback" } as any ),
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(pairingCode ? { "x-kindred-pairing": String(pairingCode) } : {}),
        ...(extraHeaders ? extraHeaders : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const rid = res.headers.get('x-kindred-request-id');
    const j = await res.json().catch(async () => {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: "connector_bad_response", details: [txt || `HTTP ${res.status}`] };
    });
    if (rid && j && typeof j === 'object') { (j as any).request_id = rid; }
    if (!res.ok) {
      const err = { ok: false, error: j?.error || `http_${res.status}`, details: Array.isArray(j?.details) ? j.details : [], request_id: rid || undefined } as any;
      if (res.status && !err.details.includes(`HTTP ${res.status}`)) err.details.unshift(`HTTP ${res.status}`);
      return err;
    }
    return j;
  } catch (e: any) {
    clearTimeout(t);
    const raw = String(e?.message || e || "");
    const isTimeout = String(e?.name || "").includes("Abort");
    const details: string[] = [];

    if (isTimeout) {
      details.push("The connector did not respond in time.");
      details.push("Confirm it is running and not busy, then try again.");
      return { ok: false, error: "timeout", details };
    }

    details.push("Could not reach the local connector.");
    if (/private network|Access-Control-Allow-Private-Network|blocked|failed to fetch/i.test(raw)) {
      details.push("Your browser may be blocking local network requests (PNA / Local Network Access)." );
      details.push("If prompted, allow Local Network Access." );
    }
    details.push("Confirm the connector is running on this computer and the pairing code is correct." );
    return { ok: false, error: "network_error", details };
  }
}

async function postFormData(url: string, form: FormData, pairingCode?: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      ...( { targetAddressSpace: "loopback" } as any ),
      method: "POST",
      headers: {
        ...(pairingCode ? { "x-kindred-pairing": String(pairingCode) } : {}),
      },
      body: form,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const rid = res.headers.get('x-kindred-request-id');
    const j = await res.json().catch(async () => {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: "connector_bad_response", details: [txt || `HTTP ${res.status}`] };
    });
    if (rid && j && typeof j === 'object') { (j as any).request_id = rid; }
    if (!res.ok) {
      const err = { ok: false, error: j?.error || `http_${res.status}`, details: Array.isArray(j?.details) ? j.details : [], request_id: rid || undefined } as any;
      if (res.status && !err.details.includes(`HTTP ${res.status}`)) err.details.unshift(`HTTP ${res.status}`);
      return err;
    }
    return j;
  } catch (e: any) {
    clearTimeout(t);
    const raw = String(e?.message || e || "");
    const isTimeout = String(e?.name || "").includes("Abort");
    const details: string[] = [];

    if (isTimeout) {
      details.push("The connector did not respond in time.");
      details.push("Confirm it is running and not busy, then try again.");
      return { ok: false, error: "timeout", details };
    }

    details.push("Could not reach the local connector.");
    if (/private network|Access-Control-Allow-Private-Network|blocked|failed to fetch/i.test(raw)) {
      details.push("Your browser may be blocking local network requests (PNA / Local Network Access)." );
      details.push("If prompted, allow Local Network Access." );
    }
    details.push("Confirm the connector is running on this computer and the pairing code is correct." );
    return { ok: false, error: "network_error", details };
  }
}

function formatConnectorFail(r: any): string {
  const err = String(r?.error || "unknown");
  const rid = String((r as any)?.request_id || "").trim();
  const suf = rid ? ` [req:${rid.slice(0, 8)}]` : "";
  // Friendly security / URL fetch errors (assets)
  if (err === "https_required") return "asset_url_blocked (https required)" + suf;
  if (err === "userinfo_not_allowed") return "asset_url_blocked (user info not allowed)" + suf;
  if (err === "port_not_allowed") return "asset_url_blocked (port not allowed)" + suf;
  if (err === "url_too_long") return "asset_url_blocked (url too long)" + suf;
  if (err === "ssrf_blocked_host") return "asset_url_blocked (host not allowed)" + suf;
  if (err === "ssrf_obfuscated_ip") return "asset_url_blocked (obfuscated IP)" + suf;
  if (err === "ssrf_private_ip") return "asset_url_blocked (private IP)" + suf;
  if (err === "dns_lookup_failed") return "asset_url_blocked (dns lookup failed)" + suf;
  if (err === "bad_redirect") return "asset_url_failed (bad redirect)" + suf;
  if (err === "redirect_limit") return "asset_url_failed (too many redirects)" + suf;
  if (err === "timeout") return "asset_url_failed (timeout)" + suf;
  if (err === "content_type_not_allowed") return "asset_url_failed (not an image)" + suf;
  if (err === "asset_too_large") return "asset_url_failed (image too large)" + suf;
  if (err === "read_failed") return "asset_url_failed (download failed)" + suf;
  // High-leverage structured errors.
  if (err === "asset_missing") {
    const slot = String((r as any)?.slot_id || "").trim();
    return (slot ? `asset_missing (slot: ${slot})` : "asset_missing") + suf;
  }
  if (err === "asset_hash_mismatch") {
    const slot = String((r as any)?.slot_id || "").trim();
    return (slot ? `asset_hash_mismatch (slot: ${slot})` : "asset_hash_mismatch") + suf;
  }
  if (err === "ship_pack_receipt_mismatch") {
    const failures = Array.isArray((r as any)?.failures) ? (r as any).failures : [];
    const snippet = failures
      .slice(0, 3)
      .map((x: any) => {
        const file = x && typeof x === "object" ? String((x as any).file || "") : "";
        const why = x && typeof x === "object" ? String((x as any).error || "") : "";
        if (file && why) return `${file}:${why}`;
        try {
          return JSON.stringify(x).slice(0, 120);
        } catch {
          return String(x);
        }
      })
      .join(", ");
    const count = failures.length ? ` (${failures.length} issue${failures.length === 1 ? "" : "s"}` + (snippet ? `: ${snippet})` : ")") : "";
    return `ship_pack_receipt_mismatch${count}` + suf;
  }
  if (err === "busy") return "connector_busy (another operation is in progress)" + suf;
  if (err === "rate_limited") {
    const ms = Number(r?.retry_after_ms || 0);
    const s = ms > 0 ? Math.ceil(ms / 1000) : 0;
    return (s ? `rate_limited (try again in ~${s}s)` : "rate_limited") + suf;
  }
  if (err === "pairing_rate_limited") {
    const ms = Number(r?.retry_after_ms || 0);
    const s = ms > 0 ? Math.ceil(ms / 1000) : 0;
    return (s ? `pairing_rate_limited (wait ~${s}s then try again)` : "pairing_rate_limited") + suf;
  }
  if (err === "payload_too_large") {
    const max = Number(r?.max_bytes || 0);
    return (max ? `payload_too_large (max ~${max} bytes)` : "payload_too_large") + suf;
  }
  const details = Array.isArray(r?.details) ? r.details.filter(Boolean).map((x: any) => String(x)) : [];
  // Some connector endpoints return 'failures' instead of 'details'.
  const failures = !details.length && Array.isArray((r as any)?.failures)
    ? (r as any).failures.filter(Boolean).map((x: any) => String(x))
    : [];
  const more = details.length ? details : failures;
  if (!more.length) return err + suf;
  return `${err} — ${more.slice(0, 6).join(" ")}` + suf;
}

function uniq(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const k = String(x || "").trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function normalizeRepoName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  // GitHub repo names are fairly permissive, but a safe slug avoids “why did export fail?” moments.
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return { ok: false, reason: "Enter a repo name." };
  let name = s
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+/, "")
    .replace(/[-_.]+$/, "");
  if (!name) return { ok: false, reason: "Repo name must contain letters or numbers." };
  if (name.length > 100) name = name.slice(0, 100).replace(/[-_.]+$/, "");
  return { ok: true, name };
}

function containsAny(list: string[], needles: string[]): boolean {
  const s = new Set(list.map((x) => String(x || "").toLowerCase()));
  for (const n of needles) if (s.has(n.toLowerCase())) return true;
  return false;
}

function diffList(a: string[], b: string[]): { added: string[]; removed: string[] } {
  const A = new Set(a);
  const B = new Set(b);
  const added: string[] = [];
  const removed: string[] = [];
  for (const x of b) if (!A.has(x)) added.push(x);
  for (const x of a) if (!B.has(x)) removed.push(x);
  return { added, removed };
}

function defaultFeelForSector(sector?: Sector): BriefPack["feel"] {
  switch (sector) {
    case "finance":
      return "premium";
    case "health":
      return "calm";
    case "education":
      return "calm";
    case "real_estate":
      return "premium";
    case "media":
      return "playful";
    case "saas":
      return "utilitarian";
    case "retail":
      return "playful";
    case "community":
      return "playful";
    default:
      return "calm";
  }
}


function enforceSafetyFeatures(features: string[], b: BriefPack): string[] {
  const enforced = new Set<string>(features);
  // Money is expressed as commitments/transfers (not "billing").
  if (b.sensitive.includes("money") || enforced.has("Commitments") || enforced.has("Checkout")) {
    enforced.add("Receipts & history");
    enforced.add("Pending/Confirmed/Failed");
  }
  if (b.sensitive.includes("moderation") || enforced.has("Moderation")) {
    enforced.add("Reports");
    if (b.appeals) enforced.add("Appeals");
  }
  if (b.integrations === "yes" || enforced.has("Integrations")) {
    enforced.add("Integration reliability");
    if (b.receives_webhooks) enforced.add("Webhooks");
  }
  if (b.track_uptime_errors === "yes") enforced.add("Uptime & errors");
  return Array.from(enforced);
}

function isCoreApproved(refined: string[], b: BriefPack, seriousness: Seriousness): { ok: boolean; fix: string | null } {
  const s = new Set(refined);
  if (b.sensitive.includes("money")) {
    if (!s.has("Receipts & history") || !s.has("Pending/Confirmed/Failed")) {
      return { ok: false, fix: "Add the commitment safety states (pending / confirmed / failed) and receipts." };
    }
  }
  if (b.integrations === "yes" && b.receives_webhooks) {
    if (!s.has("Integration reliability")) {
      return { ok: false, fix: "Add reliability for integrations (retries + safe failure handling)." };
    }
  }
  if (seriousness === "critical") {
    if (!s.has("Uptime & errors")) {
      return { ok: false, fix: "Add uptime & error monitoring for a critical build." };
    }
  }
  return { ok: true, fix: null };
}

type SmartUpgrade = { id: string; label: string; why: string; cost: "small" | "medium" | "large" };

function suggestUpgrades(b: BriefPack, seriousness: Seriousness): SmartUpgrade[] {
  const ups: SmartUpgrade[] = [];
  ups.push({ id: "onboarding", label: "Onboarding checklist", why: "Helps people succeed on their first visit.", cost: "small" });
  ups.push({ id: "export", label: "Export data", why: "Lets you leave or migrate later without pain.", cost: "small" });
  ups.push({ id: "analytics", label: "Basic analytics", why: "Shows what’s working without guessing.", cost: "small" });

  if (b.accounts) ups.push({ id: "passwordless", label: "Passwordless login", why: "Fewer lockouts and support messages.", cost: "medium" });
  if (b.sensitive.includes("money")) ups.push({ id: "refunds", label: "Refunds & dispute notes", why: "Prevents chaos when commitments go wrong.", cost: "medium" });
  if (b.sensitive.includes("moderation")) ups.push({ id: "appeals", label: "Appeals queue", why: "Stops moderation from becoming a trust crisis.", cost: "medium" });
  if (b.integrations === "yes") ups.push({ id: "integration_status", label: "Integration status page", why: "You can see failures quickly and recover.", cost: "small" });
  if (seriousness === "critical") ups.push({ id: "status_page", label: "Status page (public)", why: "Turns outages into communication, not panic.", cost: "medium" });

  return ups.slice(0, 7);
}


function buildRisks(b: BriefPack, seriousness: Seriousness): string[] {
  const risks: string[] = [];
  if (b.sensitive.includes("money")) risks.push("Handles commitments safely");
  if (b.sensitive.includes("moderation")) risks.push("Includes moderation & appeals");
  if (b.integrations === "yes") risks.push("Works with integrations even when they fail");
  if (seriousness === "critical") risks.push("Monitors uptime & errors");
  return uniq(risks);
}

function inferBuildBlocks(b: BriefPack, seriousness: Seriousness): string[] {
  const blocks: string[] = [];
  if (b.accounts) blocks.push("User accounts");
  blocks.push("Database");
  if (b.outcome === "browse" || containsAny(b.must_have, ["search", "catalog", "listings"])) blocks.push("Search");
  if (b.integrations === "yes") blocks.push("Integration reliability");
  if (b.sensitive.includes("money")) {
    blocks.push("Receipts & history");
    blocks.push("Commitment safety states");
  }
  if (b.sensitive.includes("moderation")) blocks.push("Admin tools (moderation)");
  if (seriousness === "critical") {
    blocks.push("Uptime & error monitoring");
    blocks.push("Performance under load");
  }
  // Always helpful for real shipping
  if (b.team !== "solo") blocks.push("Team roles & access");
  return uniq(blocks);
}


function makeProposals(seed: BriefSeed, brief: BriefPack): Proposal[] {
  const creative = brief.creative_push || "balanced";

  const baseFeatures = uniq([
    ...brief.must_have,
    brief.accounts ? "Accounts" : "No accounts",
    brief.integrations === "yes"
      ? "Integrations"
      : brief.integrations === "later"
        ? "Integrations later"
        : "No integrations",
    brief.sensitive.includes("moderation") ? "Moderation" : "",
    brief.sensitive.includes("money") ? "Commitments" : "",
  ]);

  const risks = buildRisks(brief, seed.seriousness);

  const safeAdds = creative === "safe" ? [] : ["Notifications"];
  const boldAdds = creative === "bold" ? ["Referral link", "Simple automations", "Audit history"] : [];
  const sectorBias =
    seed.sector === "real_estate" ? ["Listings", "Search"] : seed.sector === "community" ? ["Messages"] : seed.sector === "finance" ? ["Receipts & history"] : [];

  const starterFeatures = uniq(baseFeatures.concat(sectorBias).filter((f) => !["Integrations", "Commitments"].includes(f)));
  const standardFeatures = uniq(baseFeatures.concat(sectorBias, safeAdds, seed.seriousness === "critical" ? ["Uptime & errors"] : []));
  const ambitiousFeatures = uniq(
    baseFeatures.concat(sectorBias, safeAdds, boldAdds, [
      "Admin area",
      "Audit history",
      brief.sensitive.includes("moderation") ? "Appeals" : "",
      brief.integrations !== "none" ? "Webhooks" : "",
    ])
  );

  const starter: Proposal = {
    id: "starter",
    name: "Starter",
    scope: "starter",
    summary: "A focused day‑1 build: the core outcome, the minimum pages, and safe defaults.",
    features: enforceSafetyFeatures(starterFeatures, brief),
    risks_handled: risks.filter((r) => r !== "Works with integrations even when they fail"),
    complexity: "simple",
    timeline: seed.seriousness === "prototype" ? "Days" : "Weeks",
  };

  const standard: Proposal = {
    id: "standard",
    name: "Standard",
    scope: "standard",
    summary: "A practical product build: core features plus the safety pieces people forget until it’s painful.",
    features: enforceSafetyFeatures(standardFeatures, brief),
    risks_handled: risks,
    complexity: "medium",
    timeline: seed.seriousness === "prototype" ? "Weeks" : "Weeks to months",
  };

  const ambitious: Proposal = {
    id: "ambitious",
    name: "Ambitious",
    scope: "ambitious",
    summary: "A fuller build with stronger operations, admin tools, and growth‑ready structure.",
    features: enforceSafetyFeatures(ambitiousFeatures, brief),
    risks_handled: uniq(risks.concat(["Keeps good history for decisions"])),
    complexity: "high",
    timeline: "Months",
  };

  return [starter, standard, ambitious];
}

function proposalTradeoffs(p: Proposal, seed: BriefSeed, brief: BriefPack): string[] {
  const out: string[] = [];
  if (p.scope === "starter") {
    out.push("Tradeoff: fewer pages and edge cases covered");
    out.push("Tradeoff: may need a second build step once you learn what users actually do");
  } else if (p.scope === "standard") {
    out.push("Tradeoff: slightly longer build time, but fewer painful surprises later");
    out.push("Tradeoff: more moving parts to test and verify");
  } else {
    out.push("Tradeoff: slower to ship, higher build and verification cost");
    out.push("Tradeoff: more decisions to make up front");
  }

  if (brief.integrations === "yes" && p.scope === "starter") {
    out.push("Note: integrations are deferred here to keep day‑1 simple");
  }
  if (seed.seriousness === "critical" && p.scope !== "ambitious") {
    out.push("Note: critical products often benefit from stronger monitoring and admin controls");
  }
  return out;
}

function proposalStrengths(p: Proposal, seed: BriefSeed, brief: BriefPack): string[] {
  const out: string[] = [];
  if (p.scope === "starter") {
    out.push("Ships fastest");
    out.push("Keeps scope tight");
  } else if (p.scope === "standard") {
    out.push("Best balance");
    out.push("Includes safety pieces people forget");
  } else {
    out.push("Covers more edge cases");
    out.push("Stronger admin and operations");
  }
  if ((p.risks_handled || []).length) out.push("Handles key risks");
  return out;
}

function defaultState(): JourneyState {

  return {
    v: 1,
    step: 0,
    brief_section: 0,
    tags: [],
    inspiration: [],
    taste_vector: { chips: [], confidence: "low" },
    taste_locked: false,
    proposals_regenerating: false,
    seed: {
      goal: "sell",
      seriousness: "prototype",
    },
  };
}

function inferAssetSlots(seed: BriefSeed, brief: BriefPack, scope: ProposalScope | "unknown"): AssetSlot[] {
  const out: AssetSlot[] = [];

  // Always: primary logo + hero image.
  out.push({
    slot_id: "logo_primary",
    kind: "logo",
    label: "Logo",
    help: "Square works best. Transparent PNG is ideal.",
    aspect_ratio: "1:1",
    min_size: "256x256",
    required: true,
  });

  out.push({
    slot_id: "hero_image",
    kind: "image",
    label: "Hero image",
    help: "Main banner image above the fold.",
    aspect_ratio: "16:9",
    min_size: "1200x675",
    required: true,
  });

  const ambitious = scope === "ambitious";

  // Gallery slots: deterministic, but influenced by proposal scope and outcome.
  if (brief.outcome === "browse" || brief.outcome === "buy" || brief.outcome === "book") {
    out.push({
      slot_id: "gallery_1",
      kind: "image",
      label: "Gallery image 1",
      help: "Use a strong representative image (product, place, or concept).",
      aspect_ratio: "4:3",
      min_size: "1024x768",
      required: false,
    });
    out.push({
      slot_id: "gallery_2",
      kind: "image",
      label: "Gallery image 2",
      help: "A supporting image to add variety.",
      aspect_ratio: "4:3",
      min_size: "1024x768",
      required: false,
    });

  }

  // Extra slots when the proposal is ambitious OR the outcome implies richer visuals.
  if (brief.outcome === "buy" || brief.outcome === "book" || ambitious) {
    out.push({
      slot_id: "gallery_3",
      kind: "image",
      label: "Gallery image 3",
      help: "Square image works well for cards / tiles.",
      aspect_ratio: "1:1",
      min_size: "768x768",
      required: false,
    });
  }

  if (ambitious) {
    out.push({
      slot_id: "gallery_4",
      kind: "image",
      label: "Gallery image 4",
      help: "Optional extra visual variety.",
      aspect_ratio: "4:3",
      min_size: "1024x768",
      required: false,
    });
  }

  // Optional avatar for social / dashboard-heavy outcomes.
  if (brief.outcome == "message" || brief.outcome == "track" || seed.goal == "manage") {
    out.push({
      slot_id: "testimonial_avatar_1",
      kind: "image",
      label: "Testimonial avatar",
      help: "A face/logo icon used in testimonials or activity feeds.",
      aspect_ratio: "1:1",
      min_size: "256x256",
      required: false,
    });
  }

  return out;
}

function ensureAssetManifest(
  cur: AssetManifestV1 | undefined,
  seed: BriefSeed,
  brief: BriefPack,
  selected: Proposal | null
): AssetManifestV1 {
  const scope: ProposalScope | "unknown" = selected?.scope || "unknown";
  const for_proposal_id = selected?.id || undefined;
  const slots = inferAssetSlots(seed, brief, scope);

  // Keep choices only for slot_ids that still exist.
  const slotIds = new Set(slots.map((s) => s.slot_id));
  const keepChoices: Record<string, AssetChoice> = {};
  const choices = (cur && cur.choices && typeof cur.choices === "object") ? cur.choices : {};

  for (const [k, v] of Object.entries(choices)) {
    if (!slotIds.has(k)) continue;
    if (!v || typeof v !== "object") continue;
    keepChoices[k] = v as AssetChoice;
  }

  return {
    v: 1,
    for_proposal_id,
    brand_creation_enabled: Boolean(cur?.brand_creation_enabled),
    slots,
    choices: keepChoices,
  };
}


function suggestAssetPrompt(slot: AssetSlot, seed: BriefSeed, brief: BriefPack): string {
  const sector = seed.sector ? String(seed.sector).replaceAll("_", " ") : "";
  const base = String(seed.one_sentence || "").trim();
  const label = slot.label || slot.slot_id.replaceAll("_", " ");
  if (slot.kind === "logo") {
    return `Minimal geometric logo for a ${sector || "modern"} ${seed.goal} project. Clean, scalable, high contrast. Avoid complex details.`;
  }
  if (base) {
    return `Clean ${label} image for: ${base}. Modern, uncluttered, professional.`;
  }
  return `Clean ${label} image. Modern, uncluttered, professional.`;
}

function summarizeMissingRequiredAssets(manifest: AssetManifestV1 | null | undefined): { missing_ids: string[]; missing_labels: string[] } {
  if (!manifest || !Array.isArray(manifest.slots)) return { missing_ids: [], missing_labels: [] };
  const missing_ids: string[] = [];
  const missing_labels: string[] = [];
  const choices = (manifest.choices && typeof manifest.choices === "object") ? manifest.choices : {};

  for (const slot of manifest.slots) {
    if (!slot || typeof slot !== "object") continue;
    if (!slot.required) continue;
    const id = String((slot as any).slot_id || "");
    if (!id) continue;
    const c = (choices as any)[id];
    const ok = Boolean(c && typeof c === "object" && String(c.sha256 || "") && Number(c.bytes || 0) > 0);
    if (!ok) {
      missing_ids.push(id);
      missing_labels.push(String((slot as any).label || id));
    }
  }

  return { missing_ids, missing_labels };
}

function saveState(s: JourneyState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function loadState(): JourneyState | null {
  const raw = safeJsonParse<JourneyState>(typeof window === "undefined" ? null : localStorage.getItem(STORAGE_KEY));
  if (!raw) return null;
  if (raw.v !== 1) return null;
  return raw;
}

function downloadTextFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function prettySavedAgo(ts: number | null): string {
  if (!ts) return "";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function suggestTagsFromText(input: string): string[] {
  const t = String(input || "").toLowerCase();
  const out: string[] = [];
  const rules: Array<[RegExp, string]> = [
    [/\bpremium\b|luxury|high[- ]end/i, "premium"],
    [/\bsleek\b|clean lines|minimal/i, "sleek"],
    [/\bquiet\b|calm|subtle/i, "quiet"],
    [/\bairy\b|spacious|breathing room/i, "airy"],
    [/\bdense\b|information[- ]rich|terminal/i, "dense"],
    [/\bbold\b|punchy|strong/i, "bold"],
    [/\bplayful\b|fun|whimsical/i, "playful"],
    [/\butilitarian\b|functional|plain/i, "utilitarian"],
    [/\bdark\b|dark mode|night/i, "dark"],
    [/\blight\b|light mode/i, "light"],
    [/\blow motion\b|no motion|reduce motion/i, "low-motion"],
    [/\bhigh contrast\b|contrast/i, "high-contrast"],
    [/\brounded\b|soft corners/i, "rounded"],
    [/\bsharp\b|square|hard edges/i, "sharp"],
    [/\binternal tool\b|admin|dashboard/i, "internal-tool"],
    [/\bmarketing\b|landing page|promo/i, "marketing"],
  ];
  for (const [re, tag] of rules) {
    if (re.test(t) && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 10);
}

const INSPIRATION_REASON_CHIPS = [
  "Clean",
  "Premium",
  "Bold",
  "Quiet",
  "Dense",
  "Airy",
  "Sharp",
  "Rounded",
  "Dark",
  "Bright",
  "Playful",
  "Serious",
  "High contrast",
  "Low motion",
];

function normalizeUserTag(raw: string): string | null {
  const t = String(raw || "").trim().toLowerCase();
  if (!t) return null;
  // Replace spaces/underscores with hyphens and drop invalid chars.
  let s = t.replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "");
  s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (!s) return null;
  if (s.length > 32) s = s.slice(0, 32);
  if (s.length < 2) return null;
  return s;
}

function confidenceFromSignals(totalWeight: number): "low" | "medium" | "high" {
  if (totalWeight >= 10) return "high";
  if (totalWeight >= 5) return "medium";
  return "low";
}

function computeTasteVector(items: InspirationItem[] | undefined, tags: string[] | undefined): TasteVector {
  const list = Array.isArray(items) ? items : [];
  const tagList = Array.isArray(tags) ? tags : [];

  const weights: Record<InspirationLabel, number> = {
    like: 1,
    must_match: 3,
    dislike: -2,
    avoid: -4,
  };

  const score: Record<string, number> = {};
  let total = 0;

  for (const it of list) {
    const w = weights[it.label] ?? 0;
    total += Math.abs(w);
    for (const chip of it.reason_chips || []) {
      const key = String(chip).trim();
      if (!key) continue;
      score[key] = (score[key] || 0) + w;
    }
  }

  // Tags can gently reinforce taste without overriding explicit inspiration.
  for (const t of tagList) {
    const key = String(t).trim();
    if (!key) continue;
    score[key] = (score[key] || 0) + 1;
    total += 1;
  }

  const ranked = Object.entries(score)
    .filter(([_, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k]) => k)
    .slice(0, 10);

  return {
    chips: ranked,
    confidence: confidenceFromSignals(total),
  };
}

// Deterministic change detection helpers (not cryptographic).
// We use this to detect “your options are stale” when the Director changes inputs.
function stableStringify(value: any): string {
  const seen = new WeakSet();
  const walk = (v: any): any => {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") return v;
    if (t === "bigint") return String(v);
    if (t === "function") return undefined;
    if (Array.isArray(v)) return v.map(walk);
    if (t === "object") {
      if (seen.has(v)) return undefined;
      seen.add(v);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) {
        const vv = walk((v as any)[k]);
        if (vv === undefined) continue;
        out[k] = vv;
      }
      return out;
    }
    return undefined;
  };
  return JSON.stringify(walk(value));
}

function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619 (with 32-bit overflow)
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function proposalBasisHash(args: {
  seed: BriefSeed;
  brief: BriefPack;
  inspiration_vault: InspirationItem[];
  taste_vector: TasteVector;
  taste_locked: boolean;
  tags: string[];
  brownfield_git_url?: string | null;
}): string {
  const s = stableStringify(args);
  return `b_${fnv1a32Hex(s)}`;
}

function shipPackBasisHash(args: {
  seed: BriefSeed;
  brief: BriefPack;
  selected_proposal_id: string;
  inspiration_vault: InspirationItem[];
  taste_vector: TasteVector;
  taste_locked: boolean;
  tags: string[];
  asset_manifest: AssetManifestV1 | null;
  style_locked: boolean;
  ai_selection: {
    brand_id: string | null;
    connection_kind: string | null;
    connection_method: string | null;
    model_id: string | null;
    preferred_provider_id: string | null;
  } | null;
}): string {
  const s = stableStringify(args);
  return `s_${fnv1a32Hex(s)}`;
}

function summarizeProposalBasis(args: {
  seed: BriefSeed;
  brief: BriefPack;
  inspiration_vault: InspirationItem[];
  taste_vector: TasteVector;
  taste_locked: boolean;
  tags: string[];
  brownfield_git_url?: string | null;
}): ProposalBasisSummary {
  const { seed, brief, inspiration_vault, taste_vector, taste_locked, tags, brownfield_git_url } = args;
  const highlights: string[] = [];
  highlights.push(`For: ${brief.audience}`);
  highlights.push(`Outcome: ${brief.outcome}`);
  highlights.push(`Accounts: ${brief.accounts ? "Yes" : "No"}`);
  highlights.push(`Integrations: ${brief.integrations}`);
  if (brief.sensitive?.length) highlights.push(`Sensitive: ${brief.sensitive.map((x)=>x.replace("_"," ")).join(", ")}`);
  if (brief.feel) highlights.push(`Feel: ${brief.feel}`);
  if (brief.surface) highlights.push(`Surface: ${brief.surface}`);
  if (brief.speed) highlights.push(`Speed: ${brief.speed}`);
  return {
    goal: seed.goal,
    sector: seed.sector,
    seriousness: seed.seriousness,
    creative_push: brief.creative_push || "balanced",
    inspiration_count: Array.isArray(inspiration_vault) ? inspiration_vault.length : 0,
    tags_count: Array.isArray(tags) ? tags.length : 0,
    taste_confidence: taste_vector?.confidence || "low",
    taste_locked: !!taste_locked,
    brownfield: !!brownfield_git_url,
    highlights: highlights.slice(0, 7),
  };
}

function diffProposalBasisSummary(prev: ProposalBasisSummary | undefined, now: ProposalBasisSummary): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const push = (label: string, a: any, b: any) => {
    if (a === b) return;
    out.push(`${label}: ${String(a)} → ${String(b)}`);
  };
  push("Goal", prev.goal, now.goal);
  push("Sector", prev.sector || "(none)", now.sector || "(none)");
  push("Seriousness", prev.seriousness, now.seriousness);
  push("Creativity", prev.creative_push, now.creative_push);
  push("Inspiration items", prev.inspiration_count, now.inspiration_count);
  push("Tags", prev.tags_count, now.tags_count);
  push("Taste confidence", prev.taste_confidence, now.taste_confidence);
  push("Taste locked", prev.taste_locked ? "Yes" : "No", now.taste_locked ? "Yes" : "No");
  push("Brownfield import", prev.brownfield ? "Yes" : "No", now.brownfield ? "Yes" : "No");
  return out.slice(0, 10);
}

function summarizeShipPackBasis(args: {
  seed: BriefSeed;
  brief: BriefPack;
  selected_proposal_id: string;
  selected_proposal_name?: string;
  inspiration_vault: InspirationItem[];
  taste_vector: TasteVector;
  taste_locked: boolean;
  tags: string[];
  style_locked: boolean;
  ai_selection: {
    brand_id: string | null;
    model_id: string | null;
  } | null;
}): ShipPackBasisSummary {
  const { seed, brief, selected_proposal_id, selected_proposal_name, inspiration_vault, taste_vector, taste_locked, tags, style_locked, ai_selection } = args;
  const highlights: string[] = [];
  highlights.push(`For: ${brief.audience}`);
  highlights.push(`Outcome: ${brief.outcome}`);
  if (selected_proposal_name) highlights.push(`Choice: ${selected_proposal_name}`);
  highlights.push(`Accounts: ${brief.accounts ? "Yes" : "No"}`);
  highlights.push(`Integrations: ${brief.integrations}`);
  if (brief.feel) highlights.push(`Feel: ${brief.feel}`);
  if (style_locked) highlights.push("Style locked");
  if (taste_locked) highlights.push("Taste locked");

  return {
    goal: seed.goal,
    sector: seed.sector,
    seriousness: seed.seriousness,
    creative_push: brief.creative_push || "balanced",
    inspiration_count: Array.isArray(inspiration_vault) ? inspiration_vault.length : 0,
    tags_count: Array.isArray(tags) ? tags.length : 0,
    taste_confidence: taste_vector?.confidence || "low",
    taste_locked: !!taste_locked,
    style_locked: !!style_locked,
    selected_proposal_id: selected_proposal_id,
    selected_proposal_name,
    ai_brand_id: ai_selection?.brand_id ?? null,
    ai_model_id: ai_selection?.model_id ?? null,
    highlights: highlights.slice(0, 7),
  };
}

function diffShipPackBasisSummary(prev: ShipPackBasisSummary | undefined, now: ShipPackBasisSummary): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const push = (label: string, a: any, b: any) => {
    if (a === b) return;
    out.push(`${label}: ${String(a)} → ${String(b)}`);
  };
  push("Goal", prev.goal, now.goal);
  push("Sector", prev.sector || "(none)", now.sector || "(none)");
  push("Seriousness", prev.seriousness, now.seriousness);
  push("Creativity", prev.creative_push, now.creative_push);
  push("Chosen option", prev.selected_proposal_name || prev.selected_proposal_id, now.selected_proposal_name || now.selected_proposal_id);
  push("Inspiration items", prev.inspiration_count, now.inspiration_count);
  push("Tags", prev.tags_count, now.tags_count);
  push("Taste confidence", prev.taste_confidence, now.taste_confidence);
  push("Taste locked", prev.taste_locked ? "Yes" : "No", now.taste_locked ? "Yes" : "No");
  push("Style locked", prev.style_locked ? "Yes" : "No", now.style_locked ? "Yes" : "No");
  push("AI brand", prev.ai_brand_id || "(none)", now.ai_brand_id || "(none)");
  push("AI model", prev.ai_model_id || "auto", now.ai_model_id || "auto");
  return out;
}


async function sha256HexFromFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}


async function sha256HexFromText(text: string): Promise<string> {
  const buf = new TextEncoder().encode(String(text || ""));
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function makeHandoffMarkdown(args: {
  seed: BriefSeed;
  brief: BriefPack;
  inspiration_vault?: InspirationItem[];
  taste_vector?: TasteVector;
  taste_locked?: boolean;
  proposal: Proposal;
  refined_features: string[];
  upgrades: string[];
  style?: StylePack;
  tags?: string[];
  style_locked?: boolean;
  asset_manifest?: AssetManifestV1 | null;
}): string {
  const { seed, brief, inspiration_vault, taste_vector, taste_locked, proposal, refined_features, upgrades, style, asset_manifest } = args;
  const lines: string[] = [];
  lines.push(`# Kindred Ship Pack Handoff`);
  lines.push("");
  lines.push(`**Goal:** ${seed.goal}`);
  if (seed.sector) lines.push(`**Sector:** ${seed.sector.replace("_", " ")}`);
  lines.push(`**Seriousness:** ${seed.seriousness}`);
  if (seed.one_sentence) lines.push(`**One sentence:** ${seed.one_sentence}`);
  lines.push("");
  lines.push(`## Audience & outcome`);
  lines.push(`- For: ${brief.audience}`);
  lines.push(`- Core outcome: ${brief.outcome}`);
  lines.push(`- Accounts: ${brief.accounts ? "Yes" : "No"}`);
  lines.push(`- Integrations: ${brief.integrations}`);
  lines.push(`- Sensitive areas: ${brief.sensitive.length ? brief.sensitive.map((x)=>x.replace("_"," ")).join(", ") : "None"}`);
  lines.push("");
  lines.push(`## Day 1 must-haves`);
  for (const x of brief.must_have) lines.push(`- ${x}`);
  lines.push("");
  lines.push(`## Can wait`);
  for (const x of brief.can_wait) lines.push(`- ${x}`);
  lines.push("");
  lines.push(`## Chosen approach`);
  lines.push(`- ${proposal.name} (${proposal.scope})`);
  lines.push(`- Complexity: ${proposal.complexity}`);
  lines.push(`- Timeline: ${proposal.timeline}`);
  lines.push("");
  lines.push(`## Included features`);
  for (const x of refined_features) lines.push(`- ${x}`);
  if (upgrades.length) {
    lines.push("");
    lines.push(`## Extra improvements`);
    for (const u of upgrades) lines.push(`- ${u}`);
  }
  if (style) {
    lines.push("");
    lines.push(`## Design vibe`);
    lines.push(`- Vibe: ${style.vibe}`);
    lines.push(`- Typography: ${style.typography}`);
    lines.push(`- Shape: ${style.shape}`);
    lines.push(`- Palette: ${style.palette}`);
    if ((args as any).style_locked) lines.push(`- Locked: Yes`);
  }

  if (asset_manifest && Array.isArray(asset_manifest.slots) && asset_manifest.slots.length) {
    lines.push("");
    lines.push(`## Assets chosen`);
    for (const slot of asset_manifest.slots) {
      const c = asset_manifest.choices ? asset_manifest.choices[slot.slot_id] : undefined;
      if (!c || !c.sha256) {
        lines.push(`- ${slot.slot_id} (${slot.kind}) ... not set${slot.required ? " (required)" : ""}`);
        continue;
      }
      const src = c.source;
      const h = String(c.sha256).slice(0, 10);
      const b = typeof c.bytes === "number" ? `${c.bytes} bytes` : "";
      const extra = src === "url" && c.url ? ` · ${c.url}` : src === "upload" && c.filename ? ` · ${c.filename}` : src === "ai" ? " · AI" : "";
      lines.push(`- ${slot.slot_id} (${slot.kind}) ... ${src}${extra} · sha256:${h}… ${b}`.trim());
    }
    if (asset_manifest.brand_creation_enabled) {
      lines.push(`- Brand creation path: enabled`);
    }
  }
  if (args.tags && args.tags.length) {
    const ts = args.tags as string[];
    lines.push("");
    lines.push(`## Preference tags`);
    for (const x of ts) lines.push(`- ${x}`);
  }

  if (taste_vector) {
    lines.push("");
    lines.push(`## Taste vector`);
    lines.push(`- Confidence: ${taste_vector.confidence}`);
    if (typeof taste_locked === "boolean") lines.push(`- Locked: ${taste_locked ? "Yes" : "No"}`);
    if (taste_vector.chips && taste_vector.chips.length) {
      for (const x of taste_vector.chips) lines.push(`- ${x}`);
    } else {
      lines.push(`- (none)`);
    }
  }

  if (Array.isArray(inspiration_vault) && inspiration_vault.length) {
    lines.push("");
    lines.push(`## Inspiration vault`);
    for (const it of inspiration_vault.slice(0, 12)) {
      const title = it.kind === "link" ? it.url : it.filename;
      const why = (it.reason_chips && it.reason_chips.length) ? ` (${it.reason_chips.join(", ")})` : "";
      lines.push(`- [${it.label.replace("_", " ")}] ${title}${why}`);
    }
    if (inspiration_vault.length > 12) lines.push(`- ...and ${inspiration_vault.length - 12} more`);
  }

  lines.push("");
  lines.push(`## Notes`);
  lines.push(`- This pack is non-custodial by default (no secrets stored in the browser).`);
  lines.push(`- If commitments exist, include pending/confirmed/failed + receipts.`);
  lines.push(`- If integrations exist, plan for failure handling and retries.`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  return lines.join("\n");
}

const GOALS: { id: BuildGoal; label: string }[] = [
  { id: "sell", label: "Sell" },
  { id: "organise", label: "Organise" },
  { id: "teach", label: "Teach" },
  { id: "share", label: "Share" },
  { id: "match", label: "Match" },
  { id: "manage", label: "Manage" },
  { id: "automate", label: "Automate" },
  { id: "govern", label: "Govern" },
];

const SECTORS: { id: Sector; label: string }[] = [
  { id: "retail", label: "Retail" },
  { id: "community", label: "Community" },
  { id: "real_estate", label: "Real Estate" },
  { id: "health", label: "Health" },
  { id: "finance", label: "Finance" },
  { id: "media", label: "Media" },
  { id: "education", label: "Education" },
  { id: "saas", label: "SaaS" },
  { id: "other", label: "Other" },
];

const SERIOUSNESS: { id: Seriousness; label: string; desc: string }[] = [
  { id: "prototype", label: "Prototype", desc: "Quick and simple. For testing an idea." },
  { id: "real", label: "Real", desc: "A real product. Safe defaults included." },
  { id: "critical", label: "Critical", desc: "More safety checks. Better monitoring." },
];

function ChipRow<T extends string>(props: {
  label: string;
  value: T | undefined;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  const { label, value, options, onChange, disabled } = props;
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={"chip" + (value === o.id ? " active" : "")}
            disabled={!!disabled}
            onClick={() => { if (disabled) return; onChange(o.id); }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiChipRow(props: {
  label: string;
  values: string[];
  options: string[];
  onChange: (next: string[]) => void;
  hint?: string;
}) {
  const { label, values, options, onChange, hint } = props;
  const set = new Set(values);
  return (
    <div className="field">
      <label>{label}</label>
      {hint ? <p className="small mt0">{hint}</p> : null}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {options.map((o) => {
          const on = set.has(o);
          return (
            <button
              key={o}
              type="button"
              className={"chip" + (on ? " active" : "")}
              onClick={() => {
                const next = new Set(values);
                if (on) next.delete(o);
                else next.add(o);
                onChange(Array.from(next));
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepHeader(props: { step: number; savedAt?: number | null }) {
  const titles = [
    "Welcome",
    "Quick questions",
    "Inspiration",
    "Options",
    "Choose & tweak",
    "Assets",
    "Vibe",
    "Build plan",
    "Ship",
  ];
  return (
    <div className="hero">
      <h1>{titles[props.step] || "Journey"}</h1>
      <p className="small">Step {props.step + 1} of 9{props.savedAt ? ` • Saved ${prettySavedAgo(props.savedAt)}` : ""}</p>
    </div>
  );
}


function SnapshotBar(props: { state: JourneyState }) {
  const s = props.state;
  const b = s.brief;
  const chips: string[] = [];
  chips.push(`Goal: ${s.seed.goal}`);
  if (s.seed.sector) chips.push(`Sector: ${s.seed.sector.replace("_", " ")}`);
  chips.push(`Seriousness: ${s.seed.seriousness}`);
  if (b?.audience) chips.push(`For: ${b.audience}`);
  if (b?.outcome) chips.push(`Outcome: ${b.outcome}`);
  if (b?.accounts !== undefined) chips.push(`Accounts: ${b.accounts ? "Yes" : "No"}`);
  if (b?.integrations) chips.push(`Integrations: ${b.integrations}`);
  if (b?.sensitive?.length) chips.push(`Sensitive: ${b.sensitive.map((x) => x.replace("_", " ")).join(", ")}`);

  const inspoCount = Array.isArray(s.inspiration) ? s.inspiration.length : 0;
  if (inspoCount) chips.push(`Inspo: ${inspoCount}`);

  const tv = s.taste_vector;
  if (tv?.confidence) chips.push(`Taste: ${tv.confidence}${s.taste_locked ? " (locked)" : ""}`);

  const tagCount = Array.isArray(s.tags) ? s.tags.length : 0;
  if (tagCount) chips.push(`Tags: ${tagCount}`);

  // Progressive disclosure: keep the journey calm.
  // The snapshot is useful, but it should not compete with the current decision.
  return (
    <details className="rounded-2xl border p-3" style={{ marginBottom: 12 }}>
      <summary className="small" style={{ cursor: "pointer", userSelect: "none" }}>
        Project snapshot
      </summary>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {chips.map((c) => (
          <span key={c} className="chip active">{c}</span>
        ))}
      </div>
    </details>
  );
}

export default function DirectorJourneyPage() {
  const [state, setState] = useState<JourneyState>(() => defaultState());
  const [loaded, setLoaded] = useState(false);
  const [aiConnected, setAiConnected] = useState(false);
  const [aiOptOut, setAiOptOut] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [proposalNonce, setProposalNonce] = useState<number>(0);
  const proposalsInFlight = useRef<boolean>(false);
  const [showCompare, setShowCompare] = useState(false);
  const [refineFeatureQuery, setRefineFeatureQuery] = useState<string>("");
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [resumeOffer, setResumeOffer] = useState<JourneyState | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [githubRepoName, setGithubRepoName] = useState<string>("");
  const [githubConfirmToken, setGithubConfirmToken] = useState<string>("");
  const [shipLockToken, setShipLockToken] = useState<string>("");
  const [draftExportAck, setDraftExportAck] = useState<boolean>(false);
  const [resetToken, setResetToken] = useState<string>("");
  const [githubBusy, setGithubBusy] = useState<boolean>(false);
  const [githubMsg, setGithubMsg] = useState<string | null>(null);
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null);
  const [githubCommitUrl, setGithubCommitUrl] = useState<string | null>(null);
  const [githubCommitSha, setGithubCommitSha] = useState<string | null>(null);
  const [githubRemoteVerified, setGithubRemoteVerified] = useState<boolean | null>(null);
  const [githubRemoteHeadSha, setGithubRemoteHeadSha] = useState<string | null>(null);
  const [githubRemoteVerifyError, setGithubRemoteVerifyError] = useState<string | null>(null);

  // Optional tag entry (freedom + determinism)
  const [customTag, setCustomTag] = useState<string>("");

  // Assets (logo + images): UI-only ephemeral state (no bytes stored in Vercel).
  const [assetBusySlot, setAssetBusySlot] = useState<string | null>(null);
  const [assetMsg, setAssetMsg] = useState<string | null>(null);
  const [assetSourceUi, setAssetSourceUi] = useState<Record<string, AssetSource>>({});
  const [assetUrlInput, setAssetUrlInput] = useState<Record<string, string>>({});
  const [assetPromptInput, setAssetPromptInput] = useState<Record<string, string>>({});

  const [assetStyleHints, setAssetStyleHints] = useState<Record<string, string[]>>({});
  const [assetPreview, setAssetPreview] = useState<Record<string, string>>({});

  // Inline connector checks (avoid "silent failure" embarrassment).
  const [assetConnCheckBusy, setAssetConnCheckBusy] = useState<boolean>(false);
  const [assetConnCheckMsg, setAssetConnCheckMsg] = useState<string | null>(null);
  const [shipConnCheckBusy, setShipConnCheckBusy] = useState<boolean>(false);
  const [shipConnCheckMsg, setShipConnCheckMsg] = useState<string | null>(null);

  const showLnaAiHelp = useMemo(() => isLikelyLocalNetworkAccessBlock(aiStatus), [aiStatus]);
  const showLnaGithubHelp = useMemo(() => isLikelyLocalNetworkAccessBlock(githubMsg), [githubMsg]);
  const showLnaAssetsHelp = useMemo(() => isLikelyLocalNetworkAccessBlock(assetConnCheckMsg), [assetConnCheckMsg]);
  const showLnaShipHelp = useMemo(() => isLikelyLocalNetworkAccessBlock(shipConnCheckMsg), [shipConnCheckMsg]);
  const importRef = useRef<HTMLInputElement | null>(null);

  // Inspiration Vault (links + uploads) inputs
  const [inspoUrl, setInspoUrl] = useState<string>("");
  const [inspoLabel, setInspoLabel] = useState<InspirationLabel>("like");
  const [inspoChips, setInspoChips] = useState<string[]>([]);
  const [inspoNotes, setInspoNotes] = useState<string>("");
  const [inspoBusy, setInspoBusy] = useState<boolean>(false);
  const [inspoMsg, setInspoMsg] = useState<string | null>(null);
  const [tasteLockConfirm, setTasteLockConfirm] = useState<boolean>(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  // Inspiration Vault inline edit state (avoid delete/re-add friction)
  const [inspoEditId, setInspoEditId] = useState<string | null>(null);
  const [inspoEditLabel, setInspoEditLabel] = useState<InspirationLabel>("like");
  const [inspoEditChips, setInspoEditChips] = useState<string[]>([]);
  const [inspoEditNotes, setInspoEditNotes] = useState<string>("");

  // Destructive-op safety: removing inspiration evidence can change downstream proposals.
  const [inspoRemoveId, setInspoRemoveId] = useState<string | null>(null);
  const [inspoRemoveToken, setInspoRemoveToken] = useState<string>("");

  // Recoverability: allow an undo after removing an inspiration item.
  // Directors are fickle; we keep an escape hatch without making the UI noisy.
  const [inspoUndo, setInspoUndo] = useState<null | {
    item: InspirationItem;
    index: number;
    expires_at_ms: number;
  }>(null);
  const inspoUndoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (inspoUndoTimerRef.current != null) {
        window.clearTimeout(inspoUndoTimerRef.current);
        inspoUndoTimerRef.current = null;
      }
    };
  }, []);

  const aiConn = useMemo(() => {
    try {
      const v2 = safeJsonParse<AiConnection>(localStorage.getItem(AI_KEY_V2));
      if (v2) return v2;
      return safeJsonParse<AiConnection>(localStorage.getItem(AI_KEY_V1));
    } catch {
      return null;
    }
  }, [loaded]);

  const brownfield = useMemo(() => {
    try {
      return safeJsonParse<BrownfieldState>(localStorage.getItem(BF_KEY));
    } catch {
      return null;
    }
  }, [loaded]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const resume = url.searchParams.get("resume");
    const saved = loadState();

    // Director-friendly: don't silently drop them into the middle of something.
    if (saved && !resume) {
      setResumeOffer(saved);
    }
    if (saved && resume) {
      setState(saved);
      setSavedAt(Date.now());
    }
    setLoaded(true);
  }, []);

  // Brownfield assist: if a spec pack exists, prefill the interview so the Director starts from reality.
  useEffect(() => {
    if (!loaded) return;
    if (state.brief) return;
    const spec = (brownfield as any)?.spec_pack?.spec || null;
    const sug = spec?.brief_suggestions || null;
    if (!sug) return;

    const nextBrief: BriefPack = {
      audience: (sug.audience as any) || "public",
      outcome: (sug.outcome as any) || "browse",
      must_have: Array.isArray(sug.must_have) ? sug.must_have.map(String).slice(0, 7) : [],
      can_wait: Array.isArray(sug.can_wait) ? sug.can_wait.map(String).slice(0, 7) : [],
      accounts: Boolean(sug.accounts),
      sensitive: Array.isArray(sug.sensitive) ? (sug.sensitive.map(String) as any) : [],
      feel: "utilitarian",
      surface: "website",
      team: "solo",
      integrations: (sug.integrations as any) || "later",
      speed: "weeks",
      success: ["It works end-to-end"],
    };

    setState((s) => ({ ...s, step: Math.max(1, s.step), brief: nextBrief }));
  }, [brownfield, loaded, state.brief, state.step]);

  // AI is the primary mode. The Director should connect AI before continuing.
  useEffect(() => {
    if (!loaded) return;
    try {
      const raw = localStorage.getItem(AI_KEY_V2) || localStorage.getItem(AI_KEY_V1);
      const obj = raw ? JSON.parse(raw) : null;
      setAiConnected(Boolean(obj && obj.connected === true));
    } catch {
      setAiConnected(false);
    }
  }, [loaded]);

  // AI opt-out is explicit. Default posture is AI-first.
  useEffect(() => {
    if (!loaded) return;
    try {
      const raw = localStorage.getItem(AI_OPTOUT_KEY);
      setAiOptOut(raw === "1" || raw === "true");
    } catch {
      setAiOptOut(false);
    }
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    saveState(state);
    setSavedAt(Date.now());
  }, [state, loaded]);

  // Keep taste vector in sync with inspiration + tags unless explicitly locked.
  useEffect(() => {
    if (!loaded) return;
    if (state.taste_locked) return;
    const recomputed = computeTasteVector(state.inspiration || [], state.tags || []);
    // Avoid infinite set loops: only write when meaningfully different.
    const cur = state.taste_vector || { chips: [], confidence: "low" };
    const same = cur.confidence === recomputed.confidence && JSON.stringify(cur.chips) === JSON.stringify(recomputed.chips);
    if (!same) {
      setState((s) => ({ ...s, taste_vector: recomputed }));
    }
  }, [loaded, state.inspiration, state.tags, state.taste_locked]);

  // Ensure asset slots are deterministic and present once we have a brief + selected option.
  useEffect(() => {
    if (!loaded) return;
    if (!state.brief) return;
    if (!state.selected_proposal_id) return;
    const selectedNow = (Array.isArray(state.proposals) ? state.proposals : []).find((p) => p.id === state.selected_proposal_id) || null;
    const next = ensureAssetManifest(state.asset_manifest, state.seed, state.brief, selectedNow);
    const cur = state.asset_manifest;
    const sameFor = String(cur?.for_proposal_id || "") === String(next.for_proposal_id || "");
    const sameSlots = JSON.stringify(cur?.slots || []) === JSON.stringify(next.slots);
    const sameChoices = JSON.stringify(cur?.choices || {}) === JSON.stringify(next.choices);
    const sameBrand = Boolean(cur?.brand_creation_enabled) === Boolean(next.brand_creation_enabled);
    if (sameFor && sameSlots && sameChoices && sameBrand) return;
    setState((s) => ({ ...s, asset_manifest: next }));
  }, [loaded, state.brief, state.seed, state.asset_manifest, state.selected_proposal_id, state.proposals]);

  // Small timer tick only when we need to show a retry countdown.
  useEffect(() => {
    const ms = Number(state.proposals_regen_retry_after_ms || 0);
    const at = state.proposals_regen_requested_at ? Date.parse(state.proposals_regen_requested_at) : 0;
    if (!ms || !at) return;
    const id = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(id);
  }, [state.proposals_regen_retry_after_ms, state.proposals_regen_requested_at]);

  // Keep compare UI from "sticking" when the Director moves on.
  useEffect(() => {
    if (state.step !== 3) setShowCompare(false);
  }, [state.step]);

  // AI-first: when we reach the proposal stage, ask the local connector for proposals.
  useEffect(() => {
    if (!loaded) return;
    if (!aiConnected) return;
    if (aiOptOut) return;
    if (state.step !== 3) return;
    if (!state.brief) return;
    const shouldGenerate = (!state.proposals || !state.proposals.length || !!state.proposals_regenerating);
    if (!shouldGenerate) return;
    if (!aiConn?.connector_url) return;

    let cancelled = false;
    proposalsInFlight.current = true;
    (async () => {
      setAiStatus(state.proposals_regenerating ? "Updating options with your local AI…" : "Generating proposals with your local AI…");
      const payload = {
        engine: aiConn?.preferred_engine || "fast",
        provider: aiConn?.primary_provider || "auto",
        provider_id: aiConn?.preferred_provider_id || undefined,
        model: ((aiConn as any)?.model_id && (aiConn as any).model_id !== "auto") ? (aiConn as any).model_id : "",
        seed: state.seed,
        brief: state.brief,
        inspiration_vault: state.inspiration || [],
        taste_vector: state.taste_vector || { chips: [], confidence: "low" },
        taste_locked: !!state.taste_locked,
        tags: state.tags || [],
        brownfield: brownfield?.inventory?.artifacts
          ? {
              git_url: brownfield.git_url || null,
              route_map: brownfield.inventory.artifacts.route_map || null,
              spel_skeleton: brownfield.inventory.artifacts.spel_skeleton || "",
            }
          : null,
      };

      const conf = await postJson(`${aiConn.connector_url}/v1/confirm`, { scope: "proposals_generate" }, aiConn.pairing_code);
      if (cancelled) return;
      if (!conf?.ok || !conf?.token) {
        setAiStatus(`Could not confirm proposal generation (${formatConnectorFail(conf)}). Fix connection or continue without AI (limited).`);
        setState((s) => ({
          ...s,
          proposals_regenerating: false,
          proposals_regen_error: String(formatConnectorFail(conf) || "confirm failed"),
          proposals_regen_error_code: String(conf?.error || "confirm_failed"),
          proposals_regen_retry_after_ms: Number(conf?.retry_after_ms || 0) || undefined,
        }));
        return;
      }

      const res = await postJson(`${aiConn.connector_url}/v1/proposals`, payload, aiConn.pairing_code, { "x-kindred-confirm": String(conf.token) });
      if (cancelled) return;
      if (!res?.ok || !Array.isArray(res.proposals)) {
        setAiStatus(`Could not reach your connector (${formatConnectorFail(res)}). Fix connection or continue without AI (limited).`);
        setState((s) => ({
          ...s,
          proposals_regenerating: false,
          proposals_regen_error: String(formatConnectorFail(res) || "connector unreachable"),
          proposals_regen_error_code: String(res?.error || "connector_unreachable"),
          proposals_regen_retry_after_ms: Number(res?.retry_after_ms || 0) || undefined,
        }));
        return;
      }
      const next = res.proposals.map((p: any) => ({
        id: String(p.id || ""),
        name: String(p.name || "Option"),
        scope: (p.scope as ProposalScope) || "starter",
        summary: String(p.summary || ""),
        features: Array.isArray(p.features) ? p.features.map(String) : [],
        risks_handled: Array.isArray(p.risks_handled) ? p.risks_handled.map(String) : [],
        complexity: (p.complexity as any) || "medium",
        timeline: String(p.timeline || ""),
      })) as Proposal[];

      const basis = proposalBasisHash({
        seed: state.seed,
        brief: state.brief,
        inspiration_vault: state.inspiration || [],
        taste_vector: state.taste_vector || { chips: [], confidence: "low" },
        taste_locked: !!state.taste_locked,
        tags: state.tags || [],
        brownfield_git_url: brownfield?.git_url || null,
      });

      setState((s) => {
        const had = Array.isArray(s.proposals) && s.proposals.length > 0;
        const prev = had
          ? {
              proposals_prev: s.proposals,
              proposals_prev_basis_hash: s.proposals_basis_hash,
              proposals_prev_basis_summary: s.proposals_basis_summary,
              proposals_prev_generated_at: s.proposals_generated_at,
            }
          : {};
        return {
          ...s,
          ...prev,
          proposals: next,
          proposals_basis_hash: basis,
          proposals_basis_summary: summarizeProposalBasis({
            seed: state.seed,
            brief: state.brief,
            inspiration_vault: state.inspiration || [],
            taste_vector: state.taste_vector || { chips: [], confidence: "low" },
            taste_locked: !!state.taste_locked,
            tags: state.tags || [],
            brownfield_git_url: brownfield?.git_url || null,
          }),
          proposals_generated_at: new Date().toISOString(),
          proposals_regenerating: false,
          proposals_regen_requested_at: undefined,
          proposals_regen_error: undefined,
          proposals_regen_error_code: undefined,
          proposals_regen_retry_after_ms: undefined,
        };
      });
      setAiStatus(null);
    })().finally(() => {
      proposalsInFlight.current = false;
    });

    return () => {
      cancelled = true;
      proposalsInFlight.current = false;
    };
  }, [aiConnected, aiConn?.connector_url, aiConn?.primary_provider, aiConn?.preferred_engine, aiOptOut, brownfield, loaded, proposalNonce, state.brief, state.inspiration, state.taste_vector, state.taste_locked, state.tags, state.proposals, state.proposals_regenerating, state.seed, state.step]);

  const brief = state.brief;
  const briefSection = state.brief_section ?? 0;
  const proposals = useMemo(() => {
    if (!state.brief) return null;
    if (state.proposals && state.proposals.length) return state.proposals;
    // AI is the default. Only fall back to templates if the Director explicitly opted out.
    if (aiOptOut) return makeProposals(state.seed, state.brief);
    return null;
  }, [aiOptOut, state.brief, state.proposals, state.seed]);

  // Limited mode (explicit opt-out): store template options into state so we can
  // detect staleness and export deterministically.
  useEffect(() => {
    if (!loaded) return;
    if (!aiOptOut) return;
    if (state.step !== 3) return;
    if (!state.brief) return;
    const shouldGenerate = (!state.proposals || !state.proposals.length || !!state.proposals_regenerating);
    if (!shouldGenerate) return;
    if (proposalsInFlight.current) return;
    const next = makeProposals(state.seed, state.brief);
    const basis = proposalBasisHash({
      seed: state.seed,
      brief: state.brief,
      inspiration_vault: [],
      taste_vector: { chips: [], confidence: "low" },
      taste_locked: false,
      tags: [],
      brownfield_git_url: null,
    });
    setState((s) => ({
      ...s,
      ...(s.proposals && s.proposals.length ? { proposals_prev: s.proposals, proposals_prev_basis_hash: s.proposals_basis_hash, proposals_prev_basis_summary: s.proposals_basis_summary, proposals_prev_generated_at: s.proposals_generated_at } : {}),
      proposals: next,
      proposals_basis_hash: basis,
      proposals_basis_summary: summarizeProposalBasis({
        seed: state.seed,
        brief: state.brief,
        inspiration_vault: [],
        taste_vector: { chips: [], confidence: "low" },
        taste_locked: false,
        tags: [],
        brownfield_git_url: null,
      }),
      proposals_generated_at: new Date().toISOString(),
      proposals_regenerating: false,
      proposals_regen_requested_at: undefined,
      proposals_regen_error: undefined,
      proposals_regen_error_code: undefined,
      proposals_regen_retry_after_ms: undefined,
    }));
  }, [aiOptOut, loaded, state.brief, state.proposals, state.proposals_regenerating, state.seed, state.step]);

  function enableAiOptOut() {
    try {
      localStorage.setItem(AI_OPTOUT_KEY, "1");
    } catch {
      // ignore
    }
    setAiOptOut(true);
  }

  function disableAiOptOut() {
    try {
      localStorage.removeItem(AI_OPTOUT_KEY);
    } catch {
      // ignore
    }
    setAiOptOut(false);
  }

  function next() {
    setBlockMsg(null);

    // Stage gating: block only when it's merciful.
    if (state.step == 1) {
      // AI-first integrity: do not allow Directors to proceed into Proposals without a verified
      // AI connection, unless they explicitly opted out (limited mode).
      if (!aiConnected && !aiOptOut) {
        setBlockMsg("Connect AI before continuing. This product is AI-first. You can explicitly continue without AI (limited), but we won't silently downgrade.");
        return;
      }
      const b = state.brief;
      if (!b) {
        setBlockMsg("Please answer the quick questions before continuing.");
        return;
      }
      if (!b.must_have || b.must_have.length < 1) {
        setBlockMsg("Pick at least 1 'must exist on day 1' item.");
        return;
      }
      if (!b.success || b.success.length < 1) {
        setBlockMsg("Pick at least 1 success sign.");
        return;
      }
    }

    // Step 2 is Inspiration Vault: no hard block needed.

    if (state.step == 3) {
      if (!state.selected_proposal_id) {
        setBlockMsg("Pick one option to continue.");
        return;
      }
    }

    if (state.step == 4 && state.brief) {
      const check = isCoreApproved(refinedPlusUpgrades, state.brief, state.seed.seriousness);
      if (!check.ok) {
        setBlockMsg(check.fix || "A required safety detail is missing.");
        return;
      }
    }

    // Step 5: Assets
    if (state.step == 5) {
      if (!aiConn?.connector_url) {
        setBlockMsg("Assets need your local connector (for uploads + URL downloads). Connect AI again.");
        return;
      }
      const man = (state.brief && selected)
        ? ensureAssetManifest(state.asset_manifest || undefined, state.seed, state.brief, selected)
        : state.asset_manifest;
      const slots = man?.slots || [];
      const choices = man?.choices || {};
      const missing = slots.filter((s) => s.required && (!choices[s.slot_id] || !choices[s.slot_id].sha256));
      if (missing.length) {
        setBlockMsg(`Please fill the required slots: ${missing.map((m) => m.label || m.slot_id).join(", ")}`);
        return;
      }
    }

    // Step 6: Vibe
    if (state.step == 6) {
      if (!state.style) {
        setBlockMsg("Pick a vibe so the design feels consistent.");
        return;
      }
    }

    setState((s) => ({ ...s, step: Math.min(8, s.step + 1) }));
  }

  function back() {
    setBlockMsg(null);
    setState((s) => ({ ...s, step: Math.max(0, s.step - 1) }));
  }

  function reset() {
    setState(defaultState());
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  const selected = proposals?.find((p) => p.id === state.selected_proposal_id) || null;
  const refinedFeatures = state.refined_features || selected?.features || [];

  // Ensure the asset manifest exists (and stays proposal-aware) before gating navigation.
  // This keeps the "required slots" rule real instead of being bypassed by a null manifest.
  useEffect(() => {
    if (!loaded) return;
    if (state.step !== 5) return;
    if (!state.brief || !selected) return;
    setState((s) => {
      const next = ensureAssetManifest(s.asset_manifest || undefined, s.seed, s.brief as any, selected);
      // Avoid re-render loops: only write when meaningfully different.
      const cur = s.asset_manifest;
      const sameProposal = (cur as any)?.for_proposal_id === (next as any)?.for_proposal_id;
      const sameSlots = JSON.stringify((cur as any)?.slots || []) === JSON.stringify((next as any)?.slots || []);
      const sameChoices = JSON.stringify((cur as any)?.choices || {}) === JSON.stringify((next as any)?.choices || {});
      const sameBrand = Boolean((cur as any)?.brand_creation_enabled) === Boolean((next as any)?.brand_creation_enabled);
      if (cur && sameProposal && sameSlots && sameChoices && sameBrand) return s;
      return { ...s, asset_manifest: next };
    });
  }, [loaded, state.step, state.brief, state.seed, selected?.id]);

  // Prefill sensible AI prompts for asset slots (purely UI convenience, not stored on Vercel).
  useEffect(() => {
    if (!loaded) return;
    if (state.step !== 5) return;
    if (!state.brief || !selected) return;
    const man = ensureAssetManifest(state.asset_manifest || undefined, state.seed, state.brief as any, selected);
    const slots = Array.isArray(man.slots) ? man.slots : [];
    if (!slots.length) return;
    setAssetPromptInput((prev) => {
      const next: Record<string, string> = { ...(prev || {}) };
      let changed = false;
      for (const slot of slots) {
        const k = String((slot as any).slot_id || "");
        if (!k) continue;
        if (!next[k]) {
          next[k] = suggestAssetPrompt(slot as any, state.seed, state.brief as any);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [loaded, state.step, state.brief, state.seed, selected?.id]);


  // Prefill sensible AI prompts for asset slots (purely UI convenience, not stored on Vercel).
  useEffect(() => {
    if (!loaded) return;
    if (state.step !== 5) return;
    if (!state.brief || !selected) return;
    const man = ensureAssetManifest(state.asset_manifest || undefined, state.seed, state.brief as any, selected);
    const slots = Array.isArray(man.slots) ? man.slots : [];
    if (!slots.length) return;
    setAssetPromptInput((prev) => {
      const next: Record<string, string> = { ...(prev || {}) };
      let changed = false;
      for (const slot of slots) {
        const k = String(slot.slot_id);
        if (!next[k]) {
          next[k] = suggestAssetPrompt(slot as any, state.seed, state.brief as any);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [loaded, state.step, state.brief, state.seed, selected?.id]);

  // Ensure StylePack has a sane default when entering the Vibe step.
  // Directors shouldn't be blocked by a missing "style" object if they're happy
  // with the default vibe inferred from their brief.
  useEffect(() => {
    if (!loaded) return;
    if (state.step !== 6) return;
    if (state.style) return;
    setState((s) => ({
      ...s,
      style: {
        vibe: (s.brief?.feel || "calm") as Vibe,
        typography: "modern",
        shape: "rounded",
        palette: "light",
      }
    }));
  }, [loaded, state.step, state.style, state.brief, state.seed]);

  // Optional upgrades (kept separate from features, but included in the final ship pack output).
  const smartUpgrades = brief ? suggestUpgrades(brief, state.seed.seriousness) : [];
  const upgradeIds = state.upgrades || [];
  const upgradeAdds = smartUpgrades.filter((u) => upgradeIds.includes(u.id)).map((u) => u.label);
  const refinedPlusUpgrades = uniq(refinedFeatures.concat(upgradeAdds));

  const buildBlocks = brief ? inferBuildBlocks(brief, state.seed.seriousness) : [];

  function diffFeatures(a: string[], b: string[]) {
    const A = new Set(a);
    const B = new Set(b);
    const added: string[] = [];
    const removed: string[] = [];
    for (const x of b) if (!A.has(x)) added.push(x);
    for (const x of a) if (!B.has(x)) removed.push(x);
    return { added: uniq(added), removed: uniq(removed) };
  }

  function exportJourneyBackup(s: JourneyState) {
    downloadTextFile("journey_state.json", JSON.stringify(s, null, 2) + "\n", "application/json");
  }

  async function runConnectorCheck(which: "assets" | "ship") {
    const connectorUrl = aiConn?.connector_url;
    if (!connectorUrl) {
      const msg = "Connector URL missing. Reconnect AI.";
      if (which === "assets") setAssetConnCheckMsg(msg);
      else setShipConnCheckMsg(msg);
      return;
    }
    if (which === "assets") {
      setAssetConnCheckBusy(true);
      setAssetConnCheckMsg(null);
    } else {
      setShipConnCheckBusy(true);
      setShipConnCheckMsg(null);
    }

    const r = await postJson(`${connectorUrl}/v1/ping`, { ts: Date.now() }, aiConn?.pairing_code);
    const ok = Boolean(r && r.ok);
    const msg = ok ? "Connector OK" : `Connector check failed: ${formatConnectorFail(r)}`;
    if (which === "assets") {
      setAssetConnCheckBusy(false);
      setAssetConnCheckMsg(msg);
    } else {
      setShipConnCheckBusy(false);
      setShipConnCheckMsg(msg);
    }
  }

  async function exportShipArtifacts() {
    if (!brief || !selected) {
      setBlockMsg("Finish the quick questions and pick an option first.");
      return;
    }

    // Asset manifest must be deterministic (never null) so receipts stay stable.
    const man = ensureAssetManifest(state.asset_manifest || undefined, state.seed, brief, selected);

    const shipPack = {
      seed: state.seed,
      brief,
      inspiration_vault: Array.isArray(state.inspiration) ? state.inspiration : [],
      taste_vector: state.taste_vector || { chips: [], confidence: "low" },
      taste_locked: !!state.taste_locked,
        options_sets: [
        {
          kind: 'current',
          generated_at: (state as any).proposals_generated_at || null,
          basis_summary: (state as any).proposals_basis_summary || null,
          proposals: Array.isArray((state as any).proposals) ? (state as any).proposals : [],
        },
        ...(((state as any).proposals_prev && (state as any).proposals_prev.length) ? [{
          kind: 'previous',
          generated_at: (state as any).proposals_prev_generated_at || null,
          basis_summary: (state as any).proposals_prev_basis_summary || null,
          proposals: Array.isArray((state as any).proposals_prev) ? (state as any).proposals_prev : [],
        }] : []),
      ],
      proposal: selected,
      refined_features: refinedPlusUpgrades,
      upgrades: upgradeAdds,
      asset_manifest: man,
      style: state.style,
      tags: Array.isArray(state.tags) ? state.tags : [],
      style_locked: !!state.style_locked,
      // AI selection snapshot (no secrets). This makes Ship Packs reproducible and portable.
      ai_selection: aiConn
        ? {
            brand_id: (aiConn as any)?.brand_id || null,
            connection_kind: (aiConn as any)?.connection_kind || null,
            connection_method: (aiConn as any)?.connection_method || null,
            model_id: (aiConn as any)?.model_id || "auto",
            preferred_provider_id: (aiConn as any)?.preferred_provider_id || null,
          }
        : null,
      ship_pack_status: {
        locked: !!(state as any).ship_pack_locked,
        locked_at: (state as any).ship_pack_locked_at || null,
        locked_basis_hash: (state as any).ship_pack_locked_basis_hash || null,
        locked_basis_summary: (state as any).ship_pack_locked_basis_summary || null,
      },
      created_at: new Date().toISOString(),
    };

    downloadTextFile("ship_pack.json", JSON.stringify(shipPack, null, 2) + "\n", "application/json");

    const assetManifestText = JSON.stringify(man, null, 2) + "\n";
    downloadTextFile("asset_manifest.json", assetManifestText, "application/json");

    const handoff = makeHandoffMarkdown({
      seed: state.seed,
      brief,
      inspiration_vault: Array.isArray(state.inspiration) ? state.inspiration : [],
      taste_vector: state.taste_vector || { chips: [], confidence: "low" },
      taste_locked: !!state.taste_locked,
      proposal: selected,
      refined_features: refinedPlusUpgrades,
      upgrades: upgradeAdds,
      style: state.style,
      tags: Array.isArray(state.tags) ? state.tags : [],
      style_locked: !!state.style_locked,
      asset_manifest: man,
    });
    const handoffText = String(handoff).endsWith("\n") ? String(handoff) : String(handoff) + "\n";
    downloadTextFile("HANDOFF.md", handoffText, "text/markdown");

    const buildPlan = {
      included_day_1: refinedPlusUpgrades,
      deferred: brief.can_wait,
      building_blocks: buildBlocks,
      risks: buildRisks(brief, state.seed.seriousness),
      notes: [
        "No secrets stored in the browser.",
        brief.integrations === "yes" ? "Integrations must survive failure." : "",
        brief.sensitive.includes("money") ? "Commitments require pending/confirmed/failed + receipts." : "",
      ].filter(Boolean),
    };
    downloadTextFile("BUILD_PLAN.json", JSON.stringify(buildPlan, null, 2) + "\n", "application/json");

    // Deterministic receipt (hashes over exported texts)
    const shipText = JSON.stringify(shipPack, null, 2) + "\n";
    const buildText = JSON.stringify(buildPlan, null, 2) + "\n";
    const journeyText = JSON.stringify(state, null, 2) + "\n";

    const receipt = {
      kind: "kindred.ship_pack_receipt.v1",
      created_at: shipPack.created_at,
      app_version: "bootstrap",
      files: {
        "ship_pack.json": { sha256: await sha256HexFromText(shipText), bytes: shipText.length },
        "asset_manifest.json": { sha256: await sha256HexFromText(assetManifestText), bytes: assetManifestText.length },
        "HANDOFF.md": { sha256: await sha256HexFromText(handoffText), bytes: handoffText.length },
        "BUILD_PLAN.json": { sha256: await sha256HexFromText(buildText), bytes: buildText.length },
        "journey_state.json": { sha256: await sha256HexFromText(journeyText), bytes: journeyText.length },
      },
      notes: ["No secrets stored.", "Hashes computed over exported text."],
    };
    downloadTextFile("SHIP_PACK_RECEIPT.json", JSON.stringify(receipt, null, 2) + "\n", "application/json");

    exportJourneyBackup(state);
  }


  async function exportToGithub() {
    setGithubMsg(null);
    setGithubRepoUrl(null);
    if (!brief || !selected) {
      setBlockMsg("Finish the quick questions and pick an option first.");
      return;
    }

    // Don't let Directors export a half-empty pack then blame the system.
    const man = ensureAssetManifest(state.asset_manifest || undefined, state.seed, brief, selected);
    const slots = man?.slots || [];
    const choices = man?.choices || {};
    const missing = slots.filter((s) => s.required && (!choices[s.slot_id] || !choices[s.slot_id].sha256));
    if (missing.length) {
      setGithubMsg(`Missing required assets: ${missing.map((m) => m.label || m.slot_id).join(", ")}`);
      setGithubBusy(false);
      return;
    }
    if (!aiConn?.connector_url) {
      setGithubMsg("Connector URL missing. Connect AI again.");
      return;
    }
    const suggested = `kindred-ship-pack-${state.seed.goal}`;
    const picked = String(githubRepoName || suggested).trim();
    const n = normalizeRepoName(picked);
    if (!n.ok) {
      setGithubMsg(n.reason);
      return;
    }
    const name = n.name;

    // High-impact action: require explicit confirmation (Director-safe, no browser prompt).
    if (String(githubConfirmToken || "").trim().toUpperCase() !== "EXPORT") {
      setGithubMsg("Type EXPORT to confirm GitHub export.");
      return;
    }

    // Draft export must be explicit. If you're not locked, we ask for a clear acknowledgement.
    if (!lockedEffective && !draftExportAck) {
      setGithubMsg("This ship pack is still a draft. Tick the box to export a draft, or lock the ship pack first.");
      return;
    }

    setGithubBusy(true);
    try {
      const shipPack = {
        seed: state.seed,
        brief,
        inspiration_vault: Array.isArray(state.inspiration) ? state.inspiration : [],
        taste_vector: state.taste_vector || { chips: [], confidence: "low" },
        taste_locked: !!state.taste_locked,
        options_sets: [
        {
          kind: 'current',
          generated_at: (state as any).proposals_generated_at || null,
          basis_summary: (state as any).proposals_basis_summary || null,
          proposals: Array.isArray((state as any).proposals) ? (state as any).proposals : [],
        },
        ...(((state as any).proposals_prev && (state as any).proposals_prev.length) ? [{
          kind: 'previous',
          generated_at: (state as any).proposals_prev_generated_at || null,
          basis_summary: (state as any).proposals_prev_basis_summary || null,
          proposals: Array.isArray((state as any).proposals_prev) ? (state as any).proposals_prev : [],
        }] : []),
      ],
        proposal: selected,
        refined_features: refinedPlusUpgrades,
        upgrades: upgradeAdds,
        asset_manifest: man,
        style: state.style,
        tags: Array.isArray(state.tags) ? state.tags : [],
        style_locked: !!state.style_locked,
        // AI selection snapshot (no secrets). Stored in pack per doctrine.
        ai_selection: aiConn
          ? {
              brand_id: (aiConn as any)?.brand_id || null,
              connection_kind: (aiConn as any)?.connection_kind || null,
              connection_method: (aiConn as any)?.connection_method || null,
              model_id: (aiConn as any)?.model_id || "auto",
              preferred_provider_id: (aiConn as any)?.preferred_provider_id || null,
            }
          : null,
        ship_pack_status: {
          locked: !!(state as any).ship_pack_locked,
          locked_at: (state as any).ship_pack_locked_at || null,
        },
        created_at: new Date().toISOString(),
      };

      // Include export artifacts for GitHub export (no secrets, deterministic content).
      const assetManifestText = JSON.stringify(man, null, 2) + "\n";
      const handoff = makeHandoffMarkdown({
        seed: state.seed,
        brief,
      inspiration_vault: Array.isArray(state.inspiration) ? state.inspiration : [],
      taste_vector: state.taste_vector || { chips: [], confidence: "low" },
      taste_locked: !!state.taste_locked,
        proposal: selected,
        refined_features: refinedPlusUpgrades,
        upgrades: upgradeAdds,
        style: state.style,
      tags: Array.isArray(state.tags) ? state.tags : [],
      style_locked: !!state.style_locked,
      asset_manifest: man,
      });

      const handoffText = String(handoff).endsWith("\n") ? String(handoff) : String(handoff) + "\n";

      const buildPlan = {
        included_day_1: refinedPlusUpgrades,
        deferred: brief.can_wait,
        building_blocks: buildBlocks,
        risks: buildRisks(brief, state.seed.seriousness),
        notes: [
          "No secrets stored in the browser.",
          brief.integrations === "yes" ? "Integrations must survive failure." : "",
          brief.sensitive.includes("money") ? "Commitments require pending/confirmed/failed + receipts." : "",
        ].filter(Boolean),
      };

      const shipText = JSON.stringify(shipPack, null, 2) + "\n";
      const buildText = JSON.stringify(buildPlan, null, 2) + "\n";
      const journeyText = JSON.stringify(state, null, 2) + "\n";

      const receipt = {
        kind: "kindred.ship_pack_receipt.v1",
        created_at: shipPack.created_at,
        app_version: "bootstrap",
        files: {
          "ship_pack.json": { sha256: await sha256HexFromText(shipText), bytes: shipText.length },
          "asset_manifest.json": { sha256: await sha256HexFromText(assetManifestText), bytes: assetManifestText.length },
          "HANDOFF.md": { sha256: await sha256HexFromText(handoffText), bytes: handoffText.length },
          "BUILD_PLAN.json": { sha256: await sha256HexFromText(buildText), bytes: buildText.length },
          "journey_state.json": { sha256: await sha256HexFromText(journeyText), bytes: journeyText.length },
        },
        notes: ["No secrets stored.", "Hashes computed over exported text."],
      };

      const confSP = await postJson(
        `${aiConn.connector_url}/v1/confirm`,
        { scope: "ship_pack_create" },
        aiConn.pairing_code
      );
      if (!confSP?.ok || !confSP?.token) {
        setGithubMsg(`Could not prepare export folder (confirmation step failed: ${formatConnectorFail(confSP)}).`);
        setGithubBusy(false);
        return;
      }

      const created = await postJson(
        `${aiConn.connector_url}/v1/ship_pack/create`,
        {
          state: {
            ship_pack: shipPack,
            build_plan: buildPlan,
            handoff_md: handoff,
            journey_state: state,
            receipt,
          },
          name,
        },
        aiConn.pairing_code,
        { "x-kindred-confirm": String(confSP.token) }
      );
      if (!created?.ok) {
        setGithubMsg(`Could not prepare export folder: ${formatConnectorFail(created)}`);
        setGithubBusy(false);
        return;
      }


      const conf = await postJson(
        `${aiConn.connector_url}/v1/confirm`,
        { scope: "github_export" },
        aiConn.pairing_code
      );
      if (!conf?.ok || !conf?.token) {
        setGithubMsg(`Could not start export (confirmation step failed: ${formatConnectorFail(conf)}).`);
        setGithubBusy(false);
        return;
      }

      const exported = await postJson(
        `${aiConn.connector_url}/v1/github/export`,
        { local_path: created.local_path, repo_name: name, visibility: "public", receipt },
        aiConn.pairing_code,
        { "x-kindred-confirm": String(conf.token) }
      );
      if (!exported?.ok) {
        const err = exported?.error || "unknown";
        if (err === "ship_pack_receipt_mismatch") {
          setGithubMsg("Export aborted: the prepared folder did not match its receipt (integrity check failed). Try regenerating the ship pack and exporting again.");
          setGithubBusy(false);
          return;
        }
        if (err === "gh_not_installed") {
          setGithubMsg("GitHub CLI (gh) not installed on your computer.");
        } else if (err === "gh_not_logged_in") {
          setGithubMsg("You need to login to GitHub CLI on this computer first (run: gh auth login).");
        } else if (err === "gh_repo_exists") {
          setGithubMsg("That repo name already exists in your account. Pick a different name and try again.");
        } else if (err === "gh_insufficient_scopes") {
          setGithubMsg("GitHub CLI auth is missing required permissions. Re-login (gh auth login) and grant repo scope.");
        } else if (err === "gh_permission_denied") {
          setGithubMsg("GitHub export was denied. Check the account you are logged into (gh auth status) and your repo permissions.");
        } else if (err === "gh_network_error") {
          setGithubMsg("GitHub export could not reach GitHub. Check your internet connection and retry.");
        } else if (err === "git_not_installed") {
          setGithubMsg("Git is not installed on this computer. Install Git and retry.");
        } else {
          setGithubMsg(`GitHub export failed: ${formatConnectorFail(exported)}`);
        }
        setGithubBusy(false);
        return;
      }

      setGithubMsg(`Exported to GitHub repo: ${exported.repo_name}`);
      if (exported?.repo_url && String(exported.repo_url).startsWith("http")) {
        setGithubRepoUrl(String(exported.repo_url));
      }
      if (exported?.commit_url && String(exported.commit_url).startsWith("http")) {
        setGithubCommitUrl(String(exported.commit_url));
      }
      if (exported?.commit_sha && typeof exported.commit_sha === "string") {
        setGithubCommitSha(String(exported.commit_sha));
      }
      if (typeof exported?.remote_verified === "boolean") {
        setGithubRemoteVerified(Boolean(exported.remote_verified));
      } else {
        setGithubRemoteVerified(null);
      }
      if (exported?.remote_head_sha && typeof exported.remote_head_sha === "string") {
        setGithubRemoteHeadSha(String(exported.remote_head_sha));
      } else {
        setGithubRemoteHeadSha(null);
      }
      if (exported?.remote_verify_error && typeof exported.remote_verify_error === "string") {
        setGithubRemoteVerifyError(String(exported.remote_verify_error));
      } else {
        setGithubRemoteVerifyError(null);
      }
      setGithubConfirmToken("");
    } catch (e: any) {
      setGithubMsg(`GitHub export failed: ${e?.message || "unknown"}`);
    }
    setGithubBusy(false);
  }

  function importJourneyBackupFromFile(f: File) {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        if (!parsed || typeof parsed !== "object") throw new Error("Not a JSON object.");
        if (parsed.v !== 1) throw new Error("This backup is not compatible with this version.");
        setResumeOffer(null);
        setState(parsed as JourneyState);
        setSavedAt(Date.now());
      } catch (e: any) {
        setImportError(String(e?.message || e || "Import failed."));
      }
    };
    reader.onerror = () => setImportError("Import failed (file read error).");
    reader.readAsText(f);
  }

  function ensureBriefDefaults(): BriefPack {
    return {
      audience: "public",
      outcome: "browse",
      must_have: [],
      can_wait: [],
      accounts: false,
      sensitive: [],
      feel: defaultFeelForSector(state.seed.sector),
      surface: "website",
      team: "solo",
      integrations: "none",
      speed: "weeks",
      success: [],
      creative_push: "balanced",
    };
  }

  function updateBrief(next: Partial<BriefPack>) {
    setState((s) => ({
      ...s,
      brief: { ...(s.brief || ensureBriefDefaults()), ...next },
    }));
  }

  function renderStep() {
    // Stage 0: Welcome
    if (state.step === 0) {
      return (
        <Panel title="What are we building?">
          <p className="small mt0">Pick the basics. We’ll handle the complicated parts for you.</p>

          <ChipRow
            label="I want to…"
            value={state.seed.goal}
            options={GOALS}
            onChange={(goal) => setState((s) => ({ ...s, seed: { ...s.seed, goal } }))}
          />

          <ChipRow
            label="Sector (optional)"
            value={state.seed.sector}
            options={SECTORS}
            onChange={(sector) => setState((s) => ({ ...s, seed: { ...s.seed, sector } }))}
          />

          <div className="field">
            <label>How serious is this?</label>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {SERIOUSNESS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={"chip" + (state.seed.seriousness === o.id ? " active" : "")}
                  onClick={() => setState((s) => ({ ...s, seed: { ...s.seed, seriousness: o.id } }))}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="small mt0">
              {SERIOUSNESS.find((x) => x.id === state.seed.seriousness)?.desc}
            </p>
          </div>

          <div className="field">
            <label>One sentence (optional)</label>
            <textarea
              className="textarea"
              rows={3}
              value={state.seed.one_sentence || ""}
              placeholder="Example: A website where people can book lessons and message the teacher."
              onChange={(e) => setState((s) => ({ ...s, seed: { ...s.seed, one_sentence: e.target.value } }))}
            />
          </div>

          <div className="hr" />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                // Initialize brief defaults (so the next step isn't blank).
                setState((s) => ({ ...s, brief: s.brief || ensureBriefDefaults(), step: 1 }));
              }}
            >
              Continue
            </button>

            <button className="btn secondary" type="button" onClick={() => exportJourneyBackup(state)}>
              Download backup
            </button>

            <button
              className="btn secondary"
              type="button"
              onClick={() => importRef.current?.click()}
            >
              Import backup
            </button>

            <input
              ref={importRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJourneyBackupFromFile(f);
                if (e.target) e.target.value = "";
              }}
            />
          </div>

          {importError ? (
            <Callout title="Import failed" tone="warn">
              <p className="small" style={{ margin: 0 }}>{importError}</p>
            </Callout>
          ) : null}
        </Panel>
      );
    }

    // Stage 1: Brief
    if (state.step === 1) {
      const b = brief || ensureBriefDefaults();
      const mustOptions = [
        "Homepage",
        "Pages & content",
        "Search",
        "Listings/catalog",
        "Messages",
        "Bookings",
        "Checkout",
        "Admin dashboard",
        "Reports & moderation",
        "Integrations",
      ];
      const waitOptions = [
        "Analytics",
        "Email notifications",
        "Mobile polish",
        "Automations",
        "Advanced search",
        "Teams & roles",
        "Appeals",
        "Exports",
      ];
      const successOptions = [
        "People use it weekly",
        "People pay",
        "Low support messages",
        "Fast and reliable",
        "Easy to manage",
        "Looks premium",
      ];

      return (
        <Panel title="Quick questions so we can propose options">
          <SnapshotBar state={{ ...state, brief: b }} />

          <ChipRow
            label="Who is it for?"
            value={b.audience}
            options={[
              { id: "public", label: "Public" },
              { id: "members", label: "Members" },
              { id: "internal", label: "Internal team" },
              { id: "clients", label: "Clients" },
            ]}
            onChange={(audience) => updateBrief({ audience })}
          />

          <ChipRow
            label="Core outcome"
            value={b.outcome}
            options={[
              { id: "browse", label: "Browse" },
              { id: "create", label: "Create" },
              { id: "buy", label: "Buy" },
              { id: "book", label: "Book" },
              { id: "message", label: "Message" },
              { id: "track", label: "Track" },
            ]}
            onChange={(outcome) => updateBrief({ outcome })}
          />

          <MultiChipRow
            label="What must exist on day 1?"
            values={b.must_have}
            options={mustOptions}
            onChange={(must_have) => updateBrief({ must_have: uniq(must_have).slice(0, 7) })}
            hint="Pick 3–7 if you can. Start small."
          />

          <MultiChipRow
            label="What can wait?"
            values={b.can_wait}
            options={waitOptions}
            onChange={(can_wait) => updateBrief({ can_wait: uniq(can_wait) })}
          />

          <ChipRow
            label="Do users need accounts?"
            value={b.accounts ? "yes" : "no"}
            options={[
              { id: "yes", label: "Yes" },
              { id: "no", label: "No" },
            ]}
            onChange={(v) => updateBrief({ accounts: v === "yes" })}
          />

          <MultiChipRow
            label="Anything sensitive?"
            values={b.sensitive.map((x) => x.replace("_", " "))}
            options={["money", "private data", "identity", "moderation"]}
            onChange={(vals) => {
              const mapped = vals.map((x) => x.replace(" ", "_")) as Sensitive[];
              const nextSensitive = uniq(mapped);
              const next: Partial<BriefPack> = { sensitive: nextSensitive };

              // Conditional rules (plain language, but enforced).
              if (nextSensitive.includes("money")) {
                next.payments_states = "yes";
                next.receipts_history = "yes";
              }
              if (nextSensitive.includes("moderation")) {
                if (b.reports === undefined) next.reports = true;
              }
              updateBrief(next);
            }}
            hint="Money, private data, identity, moderation… tell us early so we don’t miss safety pieces."
          />

          <ChipRow
            label="How should it feel?"
            value={b.feel}
            options={[
              { id: "calm", label: "Calm" },
              { id: "playful", label: "Playful" },
              { id: "premium", label: "Premium" },
              { id: "utilitarian", label: "Utilitarian" },
            ]}
            onChange={(feel) => updateBrief({ feel })}
          />

          <ChipRow
            label="Where will this live?"
            value={b.surface}
            options={[
              { id: "website", label: "Website" },
              { id: "app", label: "Mobile‑like web app" },
              { id: "internal", label: "Internal tool" },
            ]}
            onChange={(surface) => updateBrief({ surface })}
          />

          <ChipRow
            label="Solo or team‑run?"
            value={b.team}
            options={[
              { id: "solo", label: "Solo" },
              { id: "small_team", label: "Small team" },
              { id: "org", label: "Organisation" },
            ]}
            onChange={(team) => updateBrief({ team })}
          />

          <ChipRow
            label="Do you need integrations?"
            value={b.integrations}
            options={[
              { id: "none", label: "None" },
              { id: "later", label: "Later" },
              { id: "yes", label: "Yes" },
            ]}
            onChange={(integrations) => {
              const next: Partial<BriefPack> = { integrations };
              if (integrations === "yes") next.integration_resilience = "yes";
              updateBrief(next);
            }}
          />

          <ChipRow
            label="How fast do you need it?"
            value={b.speed}
            options={[
              { id: "days", label: "Days" },
              { id: "weeks", label: "Weeks" },
              { id: "months", label: "Months" },
            ]}
            onChange={(speed) => updateBrief({ speed })}
          />

          <MultiChipRow
            label="What does success look like?"
            values={b.success}
            options={successOptions}
            onChange={(success) => updateBrief({ success: uniq(success) })}
          />

          <Callout title="Notes and tags (optional)" tone="info">
            <p className="small" style={{ margin: 0 }}>
              If your idea is fuzzy, a few keywords help the AI stay on track. We will also suggest some tags you can keep or ignore.
            </p>
            <div style={{ marginTop: 10 }}>
              <textarea
                className="input"
                placeholder="Any extra context, constraints, or keywords… (optional)"
                value={b.constraints || ""}
                onChange={(e) => updateBrief({ constraints: e.target.value })}
                rows={3}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>
            {(() => {
              const suggested = suggestTagsFromText([state.seed.one_sentence || "", b.constraints || "", b.must_not || ""].join(" "));
              const active = new Set(state.tags || []);
              if (!suggested.length) return null;
              return (
                <div style={{ marginTop: 10 }}>
                  <p className="small" style={{ margin: 0 }}>Suggested tags:</p>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {suggested.map((t) => {
                      const on = active.has(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          className={"chip" + (on ? " active" : "")}
                          onClick={() => {
                            const next = new Set(state.tags || []);
                            if (on) next.delete(t);
                            else next.add(t);
                            setState((s) => ({ ...s, tags: Array.from(next) }));
                          }}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {active.size ? (
                      <>
                        <p className="small" style={{ margin: 0 }}>Your tags:</p>
                        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                          {Array.from(active).map((t) => (
                            <button
                              key={t}
                              type="button"
                              className="chip active"
                              onClick={() => {
                                const next = new Set(state.tags || []);
                                next.delete(t);
                                setState((s) => ({ ...s, tags: Array.from(next) }));
                              }}
                              title="Remove tag"
                            >
                              {t} ✕
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="small" style={{ margin: 0 }}>No tags yet.</p>
                    )}
                  </div>

                  <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                    <input
                      className="input"
                      style={{ maxWidth: 260 }}
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      placeholder="Add a tag…"
                    />
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={!normalizeUserTag(customTag)}
                      onClick={() => {
                        const norm = normalizeUserTag(customTag);
                        if (!norm) return;
                        const next = new Set(state.tags || []);
                        next.add(norm);
                        setState((s) => ({ ...s, tags: Array.from(next) }));
                        setCustomTag("");
                      }}
                    >
                      Add tag
                    </button>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => setState((s) => ({ ...s, tags: [] }))}
                    >
                      Clear tags
                    </button>
                  </div>
                </div>
              );
            })()}
          </Callout>

          {/* Conditional packs */}
          {b.sensitive.includes("money") ? (
            <Callout title="Commitment safety (required)" tone="info">
              <p className="small" style={{ margin: 0 }}>
                Because money is involved, we’ll include: pending / confirmed / failed, plus receipts & history.
              </p>
              <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => updateBrief({ refunds_undo: !(b.refunds_undo || false) })}
                >
                  {b.refunds_undo ? "Refunds/undo: Yes" : "Refunds/undo: No"}
                </button>
              </div>
            </Callout>
          ) : null}

          {b.sensitive.includes("moderation") ? (
            <Callout title="Moderation (only if you need it)" tone="info">
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <button
                  className={"btn " + (b.reports ? "" : "secondary")}
                  type="button"
                  onClick={() => updateBrief({ reports: !b.reports })}
                >
                  Reports: {b.reports ? "Yes" : "No"}
                </button>
                <button
                  className={"btn " + (b.appeals ? "" : "secondary")}
                  type="button"
                  onClick={() => updateBrief({ appeals: !b.appeals })}
                >
                  Appeals: {b.appeals ? "Yes" : "No"}
                </button>
                <button
                  className={"btn secondary"}
                  type="button"
                  onClick={() => updateBrief({ separation_of_duties: !(b.separation_of_duties || false) })}
                >
                  Team separation: {b.separation_of_duties ? "Yes" : "No"}
                </button>
              </div>
            </Callout>
          ) : null}

          {b.integrations === "yes" ? (
            <Callout title="Integrations (required safety)" tone="info">
              <p className="small" style={{ margin: 0 }}>
                We plan for integrations to fail gracefully, with retries and safe recovery.
              </p>
              <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  className={"btn " + (b.receives_webhooks ? "" : "secondary")}
                  type="button"
                  onClick={() => updateBrief({ receives_webhooks: !b.receives_webhooks })}
                >
                  Receives webhooks: {b.receives_webhooks ? "Yes" : "No"}
                </button>
              </div>
            </Callout>
          ) : null}

          {state.seed.seriousness === "critical" ? (
            <Callout title="Critical build (required safety)" tone="info">
              <p className="small" style={{ margin: 0 }}>
                For critical builds we include uptime & errors monitoring, and plan for high traffic.
              </p>
            </Callout>
          ) : null}

          <div className="hr" />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn secondary" type="button" onClick={() => exportJourneyBackup(state)}>
              Download backup
            </button>
            <button className="btn secondary" type="button" onClick={() => reset()}>
              Start over
            </button>
          </div>
        </Panel>
      );
    }

    // Stage 2: Inspiration Vault (Links + Uploads)
    if (state.step === 2) {
      if (!brief) {
        return (
          <Panel title="Inspiration">
            <p className="small">Answer the quick questions first.</p>
          </Panel>
        );
      }

      const items = Array.isArray(state.inspiration) ? state.inspiration : [];
      const taste = state.taste_vector || { chips: [], confidence: "low" };

      const updateInspiration = (nextItems: InspirationItem[]) => {
        setState((s) => {
          const nextTaste = s.taste_locked ? (s.taste_vector || taste) : computeTasteVector(nextItems, s.tags || []);
          return { ...s, inspiration: nextItems, taste_vector: nextTaste };
        });
      };

      const addLink = () => {
        const url = inspoUrl.trim();
        if (!url) return;
        setInspoMsg(null);
        // Light sanity check, but don't be authoritarian.
        const normalized = url.startsWith("http") ? url : `https://${url}`;

        // Prevent accidental duplicates (common when Directors paste quickly).
        if (items.some((x) => x.kind === "link" && (x.url || "").trim() === normalized.trim())) {
          setInspoMsg("That link is already in your Inspiration Vault.");
          return;
        }

        // Soft cap to keep the signal clean (too many references becomes noise).
        if (items.length >= 20) {
          setInspoMsg("You already have 20 inspiration items. Remove a few to keep the signal clean.");
          return;
        }

        const id = `inspo_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const next: InspirationItem = {
          id,
          kind: "link",
          label: inspoLabel,
          url: normalized,
          reason_chips: inspoChips.slice(0, 10),
          notes: inspoNotes.trim() || undefined,
          added_at: new Date().toISOString(),
        };
        updateInspiration([next, ...items]);
        setInspoUrl("");
        setInspoNotes("");
        setInspoChips([]);
        setInspoLabel("like");
      };

      const addUpload = async (file: File) => {
        try {
          setInspoBusy(true);
          setInspoMsg(null);
          // Soft cap to keep the signal clean.
          if (items.length >= 20) {
            setInspoMsg("You already have 20 inspiration items. Remove a few to keep the signal clean.");
            return;
          }
          const hash = await sha256HexFromFile(file);

          // Prevent accidental duplicates by hash.
          if (items.some((x) => x.kind === "upload" && (x.sha256 || "") === hash)) {
            setInspoMsg("That upload already exists (same file hash). If you meant a different file, rename it or pick another asset.");
            return;
          }

          const id = `upload_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          const next: InspirationItem = {
            id,
            kind: "upload",
            label: inspoLabel,
            filename: file.name,
            size_bytes: file.size,
            sha256: hash,
            reason_chips: inspoChips.slice(0, 10),
            notes: inspoNotes.trim() || undefined,
            added_at: new Date().toISOString(),
          };
          updateInspiration([next, ...items]);
          setInspoNotes("");
          setInspoChips([]);
          setInspoLabel("like");
          // Clear file input so the same file can be picked again if needed.
          if (uploadRef.current) uploadRef.current.value = "";
        } finally {
          setInspoBusy(false);
        }
      };

      return (
        <Panel title="Inspiration Vault">
          <SnapshotBar state={state} />

          {inspoUndo && Date.now() < inspoUndo.expires_at_ms ? (
            <Callout title="Removed" tone="info">
              <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <p className="small" style={{ margin: 0 }}>
                  Inspiration removed. You can undo for a moment.
                </p>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    // Restore the removed item in its original position (best-effort).
                    const current = Array.isArray(state.inspiration) ? state.inspiration : [];
                    if (current.some((x) => x.id === inspoUndo.item.id)) {
                      setInspoUndo(null);
                      return;
                    }
                    const restored = current.slice();
                    const idx = Math.max(0, Math.min(inspoUndo.index, restored.length));
                    restored.splice(idx, 0, inspoUndo.item);
                    updateInspiration(restored);
                    setInspoUndo(null);
                    if (inspoUndoTimerRef.current != null) {
                      window.clearTimeout(inspoUndoTimerRef.current);
                      inspoUndoTimerRef.current = null;
                    }
                  }}
                >
                  Undo
                </button>
              </div>
            </Callout>
          ) : null}

          {aiOptOut ? (
            <Callout title="Limited mode" tone="warn">
              <p className="small" style={{ margin: 0 }}>
                You are in <b>Limited mode</b> (AI is disconnected). Your Inspiration Vault will still be saved, but it will not shape proposal options until you connect AI.
              </p>
            </Callout>
          ) : null}

          {inspoMsg ? (
            <Callout title="Note" tone="warn">
              <p className="small" style={{ margin: 0 }}>{inspoMsg}</p>
            </Callout>
          ) : null}

          <Callout title="Why this matters" tone="info">
            <p className="small" style={{ margin: 0 }}>
              Add links or screenshots you like (and what you hate). This keeps proposals aligned to your taste without writing a messy creative brief.
              Nothing is locked unless you lock it.
            </p>
          </Callout>

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0 }}>Add inspiration</h3>

            <div className="field">
              <label>Label</label>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {(
                  [
                    { id: "like", label: "✅ Like" },
                    { id: "dislike", label: "❌ Don't like" },
                    { id: "must_match", label: "⭐ Must match" },
                    { id: "avoid", label: "⚠ Avoid vibe" },
                  ] as Array<{ id: InspirationLabel; label: string }>
                ).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={"btn " + (inspoLabel === o.id ? "" : "secondary")}
                    onClick={() => setInspoLabel(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Link</label>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <input
                  className="input"
                  placeholder="Paste a URL (e.g. linear.app)"
                  value={inspoUrl}
                  onChange={(e) => setInspoUrl(e.target.value)}
                  style={{ minWidth: 260 }}
                />
                <button className="btn" type="button" onClick={() => addLink()} disabled={!inspoUrl.trim()}>
                  Add link
                </button>
              </div>
            </div>

            <div className="field">
              <label>Upload (stored only as metadata + hash)</label>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <input
                  ref={uploadRef}
                  type="file"
                  className="input"
                  accept="image/*,application/pdf"
                  disabled={inspoBusy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void addUpload(file);
                  }}
                  style={{ minWidth: 260 }}
                />
                {inspoBusy ? <span className="small">Hashing…</span> : null}
              </div>
              <p className="small mt0">
                We do not store the file in Kindred. Only filename, size, and SHA-256 hash are saved.
              </p>
            </div>

            <ChipMulti
              label="Why (chips)"
              values={inspoChips}
              options={INSPIRATION_REASON_CHIPS}
              onChange={(next) => setInspoChips(next.slice(0, 10))}
              hint="Pick a few. You can be vague."
            />

            <div className="field">
              <label>Optional note</label>
              <textarea
                className="input"
                value={inspoNotes}
                onChange={(e) => setInspoNotes(e.target.value)}
                placeholder="Short explanation (optional)"
                rows={2}
              />
            </div>
          </div>

          <Callout title="Taste summary" tone="info">
            <p className="small" style={{ margin: 0 }}>
              Current taste vector: <b>{taste.confidence}</b> confidence.
            </p>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {(taste.chips && taste.chips.length ? taste.chips : ["(no signals yet)"]).map((c) => (
                <span key={c} className={"chip " + (c === "(no signals yet)" ? "" : "active")}>{c}</span>
              ))}
            </div>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button
                className={"btn " + (state.taste_locked ? "" : "secondary")}
                type="button"
                onClick={() => {
                  if (state.taste_locked) {
                    setState((s) => ({ ...s, taste_locked: false }));
                    setTasteLockConfirm(false);
                    return;
                  }
                  if (taste.confidence === "low" && !tasteLockConfirm) {
                    setTasteLockConfirm(true);
                    return;
                  }
                  setState((s) => ({ ...s, taste_locked: true }));
                  setTasteLockConfirm(false);
                }}
              >
                {state.taste_locked ? "Taste locked" : "Lock taste (optional)"}
              </button>
              <span className="small">
                Locking is optional. You can unlock any time.
              </span>
            </div>

            {tasteLockConfirm && !state.taste_locked && taste.confidence === "low" ? (
              <div className="card" style={{ marginTop: 10, background: "rgba(255,255,255,0.03)" }}>
                <p className="small" style={{ marginTop: 0 }}>
                  <b>Heads up:</b> your taste confidence is still <b>low</b>. Locking now may reduce useful exploration.
                </p>
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setState((s) => ({ ...s, taste_locked: true }));
                      setTasteLockConfirm(false);
                    }}
                  >
                    Lock anyway
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setTasteLockConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </Callout>

          <h3>Saved items</h3>
          {items.length === 0 ? (
            <p className="small">No inspiration yet. Add 3–7 items if you can.</p>
          ) : (
            items.map((it) => (
              <div key={it.id} className="card" style={{ marginBottom: 10 }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <p className="small" style={{ margin: 0 }}>
                      <b>{it.kind === "link" ? "Link" : "Upload"}</b> • {it.kind === "link" ? it.url : it.filename}
                    </p>
                    <p className="small" style={{ margin: "6px 0 0 0" }}>
                      Label: <b>{it.label.replace("_", " ")}</b>
                      {it.sha256 ? ` • hash: ${it.sha256.slice(0, 10)}…` : ""}
                    </p>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => {
                        // Inline edit: make changes without delete/re-add.
                        setInspoEditId(it.id);
                        setInspoEditLabel(it.label);
                        setInspoEditChips((it.reason_chips || []).slice(0, 10));
                        setInspoEditNotes(it.notes || "");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => {
                        setInspoRemoveId(it.id);
                        setInspoRemoveToken("");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {inspoRemoveId === it.id ? (
                  <div className="card" style={{ marginTop: 10, border: "1px solid rgba(255,255,255,0.12)" }}>
                    <p className="small" style={{ marginTop: 0 }}>
                      <b>Confirm removal</b> (this changes your taste evidence and may affect proposal options)
                    </p>
                    <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                      <div className="field" style={{ margin: 0, minWidth: 220 }}>
                        <label>Type REMOVE</label>
                        <input
                          className="input"
                          value={inspoRemoveToken}
                          onChange={(e) => setInspoRemoveToken(e.target.value)}
                          placeholder="REMOVE"
                        />
                      </div>
                      <button
                        className="btn"
                        type="button"
                        disabled={(inspoRemoveToken || "").trim().toUpperCase() !== "REMOVE"}
                        onClick={() => {
                          const idx = items.findIndex((x) => x.id === it.id);
                          const next = items.filter((x) => x.id !== it.id);
                          updateInspiration(next);

                          // Offer a brief undo window (recoverability > punishment).
                          const expires = Date.now() + 10_000;
                          setInspoUndo({ item: it, index: idx < 0 ? 0 : idx, expires_at_ms: expires });
                          if (inspoUndoTimerRef.current != null) {
                            window.clearTimeout(inspoUndoTimerRef.current);
                          }
                          inspoUndoTimerRef.current = window.setTimeout(() => {
                            setInspoUndo(null);
                            inspoUndoTimerRef.current = null;
                          }, 10_000);
                          if (inspoEditId === it.id) setInspoEditId(null);
                          setInspoRemoveId(null);
                          setInspoRemoveToken("");
                        }}
                      >
                        Confirm remove
                      </button>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => {
                          setInspoRemoveId(null);
                          setInspoRemoveToken("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {inspoEditId === it.id ? (
                  <div className="card" style={{ marginTop: 10, background: "rgba(255,255,255,0.02)" }}>
                    <p className="small" style={{ marginTop: 0 }}>
                      <b>Edit inspiration</b> (nothing locks unless you lock it)
                    </p>

                    <div className="field">
                      <label>Label</label>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        {([
                          { id: "like", label: "✅ Like" },
                          { id: "dislike", label: "❌ Don't like" },
                          { id: "must_match", label: "⭐ Must match" },
                          { id: "avoid", label: "⚠ Avoid vibe" },
                        ] as Array<{ id: InspirationLabel; label: string }>).map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            className={"btn " + (inspoEditLabel === o.id ? "" : "secondary")}
                            onClick={() => setInspoEditLabel(o.id)}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <ChipMulti
                      label="Why (chips)"
                      values={inspoEditChips}
                      options={INSPIRATION_REASON_CHIPS}
                      onChange={(next) => setInspoEditChips(next.slice(0, 10))}
                      hint="Keep it short. This feeds the Taste Vector."
                    />

                    <div className="field">
                      <label>Optional note</label>
                      <textarea
                        className="input"
                        value={inspoEditNotes}
                        onChange={(e) => setInspoEditNotes(e.target.value)}
                        placeholder="Short explanation (optional)"
                        rows={2}
                      />
                    </div>

                    {state.taste_locked ? (
                      <p className="small" style={{ marginTop: 8 }}><b>Note:</b> taste is currently locked. Your edits will be saved, but the taste summary won’t update until you unlock.</p>
                    ) : null}

                    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          const next = items.map((x) =>
                            x.id === it.id
                              ? {
                                  ...x,
                                  label: inspoEditLabel,
                                  reason_chips: inspoEditChips.slice(0, 10),
                                  notes: inspoEditNotes.trim() || undefined,
                                }
                              : x
                          );
                          updateInspiration(next);
                          setInspoEditId(null);
                        }}
                      >
                        Save changes
                      </button>
                      <button className="btn secondary" type="button" onClick={() => setInspoEditId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {it.reason_chips?.length ? (
                  <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {it.reason_chips.map((c) => (
                      <span key={c} className="chip active">{c}</span>
                    ))}
                  </div>
                ) : null}
                {it.notes ? <p className="small" style={{ marginTop: 8 }}>{it.notes}</p> : null}
              </div>
            ))
          )}

          <div className="hr" />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn secondary" type="button" onClick={() => exportJourneyBackup(state)}>
              Download backup
            </button>
          </div>
        </Panel>
      );
    }

    // Stage 3: Proposals
    if (state.step === 3) {
      if (!brief) {
        return (
          <Panel title="Options">
            <p className="small">Answer the quick questions first.</p>
          </Panel>
        );
      }
      const ps = proposals || [];

      const basisNow = proposalBasisHash({
        seed: state.seed,
        brief,
        inspiration_vault: aiOptOut ? [] : (state.inspiration || []),
        taste_vector: aiOptOut ? { chips: [], confidence: "low" } : (state.taste_vector || { chips: [], confidence: "low" }),
        taste_locked: aiOptOut ? false : !!state.taste_locked,
        tags: aiOptOut ? [] : (state.tags || []),
        brownfield_git_url: aiOptOut ? null : (brownfield?.git_url || null),
      });

      const summaryNow = summarizeProposalBasis({
        seed: state.seed,
        brief,
        inspiration_vault: aiOptOut ? [] : (state.inspiration || []),
        taste_vector: aiOptOut ? { chips: [], confidence: "low" } : (state.taste_vector || { chips: [], confidence: "low" }),
        taste_locked: aiOptOut ? false : !!state.taste_locked,
        tags: aiOptOut ? [] : (state.tags || []),
        brownfield_git_url: aiOptOut ? null : (brownfield?.git_url || null),
      });
      const changes = diffProposalBasisSummary(state.proposals_basis_summary, summaryNow);
      const isStale = !!(state.proposals_basis_hash && state.proposals_basis_hash !== basisNow);
      return (
        <Panel title="Here are 3 approaches">
          <SnapshotBar state={state} />

          {aiOptOut ? (
            <Callout title="Limited mode" tone="warn">
              <p className="small" style={{ margin: 0 }}>
                You chose to continue without AI. These options are based on a simple template and will not use your Inspiration Vault.
                For the full consultancy experience, connect AI.
              </p>
              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <a className="btn" href="/director/connect-ai?next=/director/journey">
                  Connect AI
                </a>
              </div>
            </Callout>
          ) : null}

          {isStale ? (
            <Callout title="Your options are out of date" tone="warn">
              <p className="small" style={{ margin: 0 }}>
                You changed your brief, tags, or Inspiration Vault after these options were generated.
                Regenerate to reflect your latest inputs.
              </p>

              {changes.length ? (
                <ul className="small" style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
                  {changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}
              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <button
                  className="btn"
                  type="button"
                  disabled={!!state.proposals_regenerating}
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      proposals_regenerating: true,
                      proposals_regen_requested_at: new Date().toISOString(),
                      proposals_regen_error: undefined,
                      proposals_regen_error_code: undefined,
                      proposals_regen_retry_after_ms: undefined,
                      selected_proposal_id: undefined,
                    }));
                    setProposalNonce((x) => x + 1);
                  }}
                >
                  {state.proposals_regenerating ? "Updating…" : "Regenerate options"}
                </button>
                <span className="small">Nothing is locked unless you lock it.</span>
              </div>
            </Callout>
          ) : null}

          {state.proposals_regen_error ? (
            <Callout title="Could not update options" tone="warn">
              {(() => {
                const code = String(state.proposals_regen_error_code || "");
                const at = state.proposals_regen_requested_at ? Date.parse(state.proposals_regen_requested_at) : 0;
                const retryMs = Number(state.proposals_regen_retry_after_ms || 0);
                const remainingMs = at && retryMs ? Math.max(0, retryMs - (nowMs - at)) : 0;
                const remainingS = remainingMs ? Math.ceil(remainingMs / 1000) : 0;

                const lines: string[] = [];
                if (code === "busy") {
                  lines.push("Your connector is busy doing another operation. Wait a moment, then try again.");
                } else if (code === "rate_limited") {
                  lines.push(remainingS ? `You're hitting a connector rate limit. Try again in ~${remainingS}s.` : "You're hitting a connector rate limit. Try again soon.");
                } else if (code === "pairing_rate_limited") {
                  lines.push(remainingS ? `Too many pairing attempts. Wait ~${remainingS}s, then try again.` : "Too many pairing attempts. Wait a moment, then try again.");
                } else if (code === "timeout") {
                  lines.push("The connector did not respond in time. Confirm it's running, then retry.");
                } else if (code === "network_error") {
                  lines.push("Your browser may be blocking local network requests (Local Network Access). Allow it if prompted, or open the connector directly.");
                } else {
                  lines.push("We couldn't regenerate your options, but we kept your last good set so you can continue.");
                }

                return (
                  <>
                    {lines.map((t) => (
                      <p key={t} className="small" style={{ margin: 0, marginTop: 6 }}>{t}</p>
                    ))}
                  </>
                );
              })()}
              <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                Error: <b>{state.proposals_regen_error}</b>
              </p>
              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                {(() => {
                  const at = state.proposals_regen_requested_at ? Date.parse(state.proposals_regen_requested_at) : 0;
                  const retryMs = Number(state.proposals_regen_retry_after_ms || 0);
                  const remainingMs = at && retryMs ? Math.max(0, retryMs - (nowMs - at)) : 0;
                  const remainingS = remainingMs ? Math.ceil(remainingMs / 1000) : 0;
                  const disabled = remainingMs > 0;
                  const label = disabled ? `Retry in ${remainingS}s` : "Retry regeneration";
                  return (
                    <button
                      className="btn"
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setState((s) => ({
                          ...s,
                          proposals_regenerating: true,
                          proposals_regen_requested_at: new Date().toISOString(),
                          proposals_regen_error: undefined,
                          proposals_regen_error_code: undefined,
                          proposals_regen_retry_after_ms: undefined,
                        }));
                        setProposalNonce((x) => x + 1);
                      }}
                    >
                      {label}
                    </button>
                  );
                })()}
                <a className="btn secondary" href="/director/connect-ai">Reconnect AI</a>
                {String(state.proposals_regen_error_code || "") === "network_error" ? (
                  <a className="btn secondary" href="http://127.0.0.1:6174" target="_blank" rel="noreferrer">Open connector</a>
                ) : null}
              </div>

              {String(state.proposals_regen_error_code || "") === "network_error" ||
              isLikelyLocalNetworkAccessBlock(state.proposals_regen_error) ? (
                <LocalNetworkAccessHelp connectorUrl={aiConn?.connector_url} />
              ) : null}
            </Callout>
          ) : null}

          {state.proposals_regenerating ? (
            <Callout title="Updating options" tone="info">
              <p className="small" style={{ margin: 0 }}>
                Generating updated options from your latest inputs. Your current options stay visible until the new set arrives.
              </p>
            </Callout>
          ) : null}

          {!state.proposals_regenerating && state.proposals_prev && state.proposals_prev.length ? (
            <Callout title="Previous options available" tone="info">
              <p className="small" style={{ margin: 0 }}>
                You can restore the last option set if you preferred it. This won't delete anything.
              </p>
              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setState((s) => ({
                      ...s,
                      proposals: s.proposals_prev,
                      proposals_basis_hash: s.proposals_prev_basis_hash,
                      proposals_basis_summary: s.proposals_prev_basis_summary,
                      proposals_generated_at: s.proposals_prev_generated_at,
                      proposals_prev: s.proposals,
                      proposals_prev_basis_hash: s.proposals_basis_hash,
                      proposals_prev_basis_summary: s.proposals_basis_summary,
                      proposals_prev_generated_at: s.proposals_generated_at,
                      selected_proposal_id: undefined,
                      refined_features: undefined,
                    }));
                  }}
                >
                  Restore previous options
                </button>
              </div>
            </Callout>
          ) : null}

          <Callout title="Option range" tone="info">
            <p className="small" style={{ margin: 0 }}>
              You can stay close to your brief, or let the AI explore a bolder alternative in the mix.
              Change this any time. If you change it, we regenerate proposals.
            </p>
            <div style={{ marginTop: 10 }}>
              <ChipRow
                label="Creativity dial"
                value={brief.creative_push || "balanced"}
                options={[
                  { id: "safe", label: "Closest match" },
                  { id: "balanced", label: "Balanced" },
                  { id: "bold", label: "Creative alt" },
                ]}
                onChange={(creative_push) => {
                  // Changing this changes the proposal set. Clear and regenerate.
                  setState((s) => ({
                    ...s,
                    brief: { ...(s.brief || ensureBriefDefaults()), creative_push },
                    proposals_regenerating: true,
                    proposals_regen_requested_at: new Date().toISOString(),
                    proposals_regen_error: undefined,
                    proposals_regen_error_code: undefined,
                    proposals_regen_retry_after_ms: undefined,
                    selected_proposal_id: undefined,
                  }));
                  setProposalNonce((x) => x + 1);
                }}
              />
            </div>
          </Callout>

          <Callout title="What shaped these options" tone="info">
            <p className="small" style={{ margin: 0 }}>
              We bias proposals using your brief, Inspiration Vault, and optional tags. Nothing is a hard constraint unless you explicitly lock it.
            </p>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {(
                (state.taste_vector?.chips && state.taste_vector.chips.length)
                  ? state.taste_vector.chips
                  : ["(no taste signals yet)"]
              ).slice(0, 6).map((c) => (
                <span key={c} className={"chip " + (c.startsWith("(") ? "" : "active")}>{c}</span>
              ))}
              {(Array.isArray(state.tags) ? state.tags : []).slice(0, 6).map((t) => (
                <span key={t} className="chip active">#{t}</span>
              ))}
            </div>
            <p className="small" style={{ marginTop: 10 }}>
              Taste confidence: <b>{state.taste_vector?.confidence || "low"}</b>{state.taste_locked ? " (locked)" : ""}.
            </p>
          </Callout>

          {Array.isArray(state.inspiration) && state.inspiration.length ? (
            <Callout title="Inspiration signals" tone="info">
              <p className="small" style={{ margin: 0 }}>
                We use your Inspiration Vault as taste evidence. This keeps suggestions grounded instead of "random AI".
              </p>
              <div style={{ marginTop: 10 }}>
                {state.inspiration.slice(0, 3).map((it) => {
                  const title = it.kind === "link" ? (it.url || "(link)") : (it.filename || "(upload)");
                  const label = it.label === "must_match" ? "Must match" : it.label === "dislike" ? "Dislike" : it.label === "avoid" ? "Avoid" : "Like";
                  return (
                    <div key={it.id} className="card" style={{ marginBottom: 10 }}>
                      <p style={{ margin: 0 }}><b>{title}</b></p>
                      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                        <span className="chip active">{label}</span>
                        {(it.reason_chips || []).slice(0, 6).map((c) => (
                          <span key={c} className="chip">{c}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {state.inspiration.length > 3 ? (
                <p className="small" style={{ marginBottom: 0 }}>
                  +{state.inspiration.length - 3} more in your Inspiration Vault.
                </p>
              ) : null}
            </Callout>
          ) : null}

          {!proposals && !aiOptOut ? (
            <Callout title="Waiting for AI proposals" tone="info">
              <p className="small" style={{ margin: 0 }}>
                We will generate real options using your local AI connector.
              </p>
              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setAiStatus("Retrying proposals…");
                    setState((s) => ({ ...s, proposals: undefined } as any));
                  }}
                >
                  Retry
                </button>
                <a className="btn secondary" href="/director/connect-ai">Reconnect AI</a>
                <button className="btn secondary" type="button" onClick={() => enableAiOptOut()}>
                  Continue without AI (limited)
                </button>
              </div>
            </Callout>
          ) : null}
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className={"btn " + (showCompare ? "" : "secondary")} type="button" onClick={() => setShowCompare(!showCompare)}>
              {showCompare ? "Hide compare" : "Compare"}
            </button>
          </div>

          {showCompare ? (
            <Callout title="Compare options" tone="info">
              <p className="small" style={{ margin: 0 }}>
                Quick rule: <b>Starter</b> ships fastest, <b>Standard</b> balances coverage, <b>Ambitious</b> covers more edge cases.
              </p>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table className="table" style={{ minWidth: 720 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>What</th>
                      {ps.map((p) => (
                        <th key={p.id} style={{ textAlign: "left" }}>{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Scope</td>
                      {ps.map((p) => (
                        <td key={p.id}>{p.scope}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>Complexity</td>
                      {ps.map((p) => (
                        <td key={p.id}>{p.complexity}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>Timeline</td>
                      {ps.map((p) => (
                        <td key={p.id}>{p.timeline}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>Features</td>
                      {ps.map((p) => (
                        <td key={p.id}>{p.features.length}</td>
                      ))}
                    </tr>
                    <tr>
                      <td>Risks handled</td>
                      {ps.map((p) => (
                        <td key={p.id}>{(p.risks_handled || []).slice(0, 3).join(", ") || "—"}</td>
                      ))}
                    </tr>
                    <tr>
                      <td></td>
                      {ps.map((p) => (
                        <td key={p.id}>
                          <button
                            className={"btn" + (state.selected_proposal_id === p.id ? " secondary" : "")}
                            type="button"
                            disabled={!!state.proposals_regenerating}
                            onClick={() => setState((s) => ({ ...s, selected_proposal_id: p.id, refined_features: p.features }))}
                          >
                            {state.selected_proposal_id === p.id ? "Selected" : "Choose"}
                          </button>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Callout>
          ) : null}
          <div className="hr" />

          {!aiOptOut && !state.proposals ? (
            <Callout title="Waiting for AI proposals" tone="info">
              <p className="small" style={{ margin: 0 }}>
                We haven't received proposals from your local AI yet.
              </p>
              <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setAiStatus("Retrying proposal generation…");
                    setProposalNonce((x) => x + 1);
                    setState((s) => ({ ...s, proposals: undefined } as any));
                  }}
                >
                  Retry
                </button>
                <a className="btn secondary" href="/director/connect-ai">Reconnect AI</a>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    enableAiOptOut();
                  }}
                >
                  Continue without AI (limited)
                </button>
              </div>
            </Callout>
          ) : null}

          {ps.map((p, idx) => (
            <div key={p.id} className="card" style={{ marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{p.name}</h3>
                  <p className="small mt0" style={{ marginTop: 6 }}>{p.summary}</p>
                  <div style={{ marginTop: 10 }}>
                    <p className="small" style={{ margin: 0 }}>
                      <b>Good for</b>: {proposalStrengths(p, state.seed, brief).slice(0, 3).join(" · ")}
                    </p>
                    <p className="small" style={{ marginTop: 6, marginBottom: 0 }}>
                      <b>Tradeoffs</b>: {proposalTradeoffs(p, state.seed, brief).slice(0, 2).join(" · ")}
                    </p>

                    <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                      {(() => {
                        const dial = (brief.creative_push || "balanced") as any;
                        const labels = [
                          "Closest match",
                          "Alt structure",
                          "Alt priorities",
                          dial === "bold" ? "Creative alt" : "Exploration",
                          "Contrarian",
                          "Wildcard",
                          "Edge case",
                        ];
                        const label = labels[Math.min(idx, labels.length - 1)];
                        return <span className="chip active">{label}</span>;
                      })()}

                      <span className="chip active">{p.scope}</span>
                      <span className="chip">{p.timeline}</span>
                      <span className="chip">{p.complexity}</span>
                    </div>

                    <details style={{ marginTop: 10 }}>
                      <summary className="small" style={{ cursor: "pointer" }}>Show details</summary>
                      <div style={{ marginTop: 8 }}>
                        <p className="small" style={{ margin: 0 }}>
                          <b>Why</b>: {proposalWhyLine(p, state.seed, brief)}
                        </p>
                        <p className="small" style={{ marginTop: 6, marginBottom: 0 }}>
                          <b>Key features</b>: {(p.features || []).slice(0, 10).join(" · ")}{(p.features || []).length > 10 ? ` · +${(p.features || []).length - 10} more` : ""}
                        </p>
                        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          <span className="chip active">Risks handled</span>
                          {(p.risks_handled || []).slice(0, 6).map((r) => (
                            <span key={r} className="chip">{r}</span>
                          ))}
                          {(p.risks_handled || []).length > 6 ? <span className="chip">+{(p.risks_handled || []).length - 6} more</span> : null}
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
                <div>
                  <button
                    className={"btn" + (state.selected_proposal_id === p.id ? " secondary" : "")}
                    type="button"
                    disabled={!!state.proposals_regenerating}
                    onClick={() => setState((s) => ({ ...s, selected_proposal_id: p.id, refined_features: p.features }))}
                  >
                    {state.proposals_regenerating ? "Updating…" : (state.selected_proposal_id === p.id ? "Selected" : "Choose")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </Panel>
      );
    }

    // Stage 4: Choose & tweak
    if (state.step === 4) {
      if (!brief || !selected) {
        return (
          <Panel title="Choose & tweak">
            <p className="small">Pick an option first.</p>
          </Panel>
        );
      }

      const base = selected.features;
      const refined = state.refined_features || base;

      const baseSet = new Set(base);
      const refinedSet = new Set(refined);
      const removed = base.filter((f) => !refinedSet.has(f));
      const added = refined.filter((f) => !baseSet.has(f));

      const q = refineFeatureQuery.trim().toLowerCase();
      const filteredBase = q ? base.filter((f) => f.toLowerCase().includes(q)) : base;

      const toggleFeature = (name: string) => {
        const set = new Set(refined);
        if (set.has(name)) set.delete(name);
        else set.add(name);
        const next = enforceSafetyFeatures(Array.from(set), brief);
        setState((s) => ({ ...s, refined_features: uniq(next) }));
      };

      const check = isCoreApproved(refinedPlusUpgrades, brief, state.seed.seriousness);

      return (
        <Panel title="Pick one, then tweak it">
          <SnapshotBar state={state} />

          <Callout title="Current shape" tone="info">
            <p className="small" style={{ margin: 0 }}>
              Included: <b>{refined.length}</b> · Removed: <b>{removed.length}</b>{added.length ? ` · Added: ${added.length}` : ""}
            </p>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setState((s) => ({ ...s, refined_features: base }))}
              >
                Reset to this option
              </button>
            </div>
            {removed.length ? (
              <div style={{ marginTop: 10 }}>
                <p className="small" style={{ margin: 0 }}>Removed:</p>
                <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {removed.slice(0, 10).map((f) => (
                    <span key={f} className="chip">{f}</span>
                  ))}
                  {removed.length > 10 ? <span className="chip">+{removed.length - 10} more</span> : null}
                </div>
              </div>
            ) : null}
            {added.length ? (
              <div style={{ marginTop: 10 }}>
                <p className="small" style={{ margin: 0 }}>Added:</p>
                <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {added.slice(0, 10).map((f) => (
                    <span key={f} className="chip active">{f}</span>
                  ))}
                  {added.length > 10 ? <span className="chip active">+{added.length - 10} more</span> : null}
                </div>
              </div>
            ) : null}

          </Callout>

          {check.ok ? null : (
            <Callout title="One thing to fix before continuing" tone="warn">
              <p className="small" style={{ margin: 0 }}>{check.fix}</p>
              <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    const next = enforceSafetyFeatures(refined, brief);
                    setState((s) => ({ ...s, refined_features: uniq(next) }));
                  }}
                >
                  Apply fix
                </button>
              </div>
            </Callout>
          )}
          <div style={{ marginTop: 10 }}>
            <label className="small" style={{ display: "block", marginBottom: 6 }}>Find a feature</label>
            <input
              className="input"
              placeholder="Search…"
              value={refineFeatureQuery}
              onChange={(e) => setRefineFeatureQuery(e.target.value)}
            />
          </div>

          <p className="small">Toggle items for day 1. Safety items will be enforced automatically.</p>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {filteredBase.slice(0, 12).map((f) => {
              const on = refinedSet.has(f);
              return (
                <button
                  key={f}
                  type="button"
                  className={"chip" + (on ? " active" : "")}
                  onClick={() => toggleFeature(f)}
                >
                  {f}
                </button>
              );
            })}
          </div>

          {filteredBase.length > 12 ? (
            <details style={{ marginTop: 10 }}>
              <summary className="small">Show all features ({filteredBase.length})</summary>
              <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {filteredBase.map((f) => {
                  const on = refinedSet.has(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      className={"chip" + (on ? " active" : "")}
                      onClick={() => toggleFeature(f)}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            </details>
          ) : null}

          <div className="hr" />
          <h3 style={{ marginTop: 0 }}>Extra improvements (optional)</h3>
          <p className="small mt0">Small upgrades that make real products feel polished.</p>

          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {smartUpgrades.slice(0, 6).map((u, idx) => {
              const on = upgradeIds.includes(u.id);
              const rec = idx < 3;
              return (
                <button
                  key={u.id}
                  type="button"
                  className={"chip" + (on ? " active" : "")}
                  title={rec ? "Recommended" : undefined}
                  onClick={() => {
                    const next = new Set(upgradeIds);
                    if (on) next.delete(u.id);
                    else next.add(u.id);
                    setState((s) => ({ ...s, upgrades: Array.from(next) }));
                  }}
                >
                  {u.label}
                </button>
              );
            })}
          </div>

          {smartUpgrades.length > 6 ? (
            <details style={{ marginTop: 10 }}>
              <summary className="small">More improvements ({smartUpgrades.length - 6})</summary>
              <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {smartUpgrades.slice(6).map((u) => {
                  const on = upgradeIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={"chip" + (on ? " active" : "")}
                      onClick={() => {
                        const next = new Set(upgradeIds);
                        if (on) next.delete(u.id);
                        else next.add(u.id);
                        setState((s) => ({ ...s, upgrades: Array.from(next) }));
                      }}
                    >
                      {u.label}
                    </button>
                  );
                })}
              </div>
            </details>
          ) : null}

        </Panel>
      );
    }

    // Stage 5: Assets (logo + images)
    if (state.step === 5) {
      if (!brief || !selected) {
        return (
          <Panel title="Assets">
            <p className="small">Pick an option first so we know what placeholders exist.</p>
          </Panel>
        );
      }

      const man = state.asset_manifest || ensureAssetManifest(undefined, state.seed, brief, selected);
      const slots = man.slots || [];
      const choices = man.choices || {};
      const missingRequired = slots.filter((s) => s.required && (!choices[s.slot_id] || !choices[s.slot_id].sha256));

      const sortedSlots = [...slots].sort((a, b) => {
        const aMissing = !(choices[a.slot_id] && choices[a.slot_id].sha256);
        const bMissing = !(choices[b.slot_id] && choices[b.slot_id].sha256);
        const aScore = (a.required ? 0 : 2) + (aMissing ? 0 : 1);
        const bScore = (b.required ? 0 : 2) + (bMissing ? 0 : 1);
        return aScore - bScore;
      });

      const connectorUrl = aiConn?.connector_url;
      const pairingCode = aiConn?.pairing_code;

      const setBrandCreationEnabled = (on: boolean) => {
        setState((s) => {
          const cur = s.asset_manifest || man;
          return { ...s, asset_manifest: { ...cur, brand_creation_enabled: on } };
        });
      };

      const setChoice = (slot_id: string, c: AssetChoice) => {
        setState((s) => {
          const cur = s.asset_manifest || man;
          return { ...s, asset_manifest: { ...cur, choices: { ...(cur.choices || {}), [slot_id]: c } } };
        });
      };

      const clearChoice = (slot_id: string) => {
        setState((s) => {
          const cur = s.asset_manifest || man;
          const next = { ...(cur.choices || {}) };
          delete next[slot_id];
          return { ...s, asset_manifest: { ...cur, choices: next } };
        });
        setAssetPreview((p) => {
          const next = { ...p };
          delete next[slot_id];
          return next;
        });
      };

      const runFetchUrl = async (slot: AssetSlot) => {
        if (!connectorUrl) {
          setAssetMsg("Connector URL missing. Reconnect AI.");
          return;
        }
        const url = String(assetUrlInput[slot.slot_id] || "").trim();
        if (!url) {
          setAssetMsg("Paste a https image URL.");
          return;
        }
        setAssetBusySlot(slot.slot_id);
        setAssetMsg(null);
        const r = await postJson(
          `${connectorUrl}/v1/assets/fetch_url`,
          { slot_id: slot.slot_id, kind: slot.kind, url, aspect_ratio: slot.aspect_ratio },
          pairingCode
        );
        setAssetBusySlot(null);
        if (!r?.ok) {
          setAssetMsg(`URL fetch failed: ${formatConnectorFail(r)}`);
          return;
        }
        const choice: AssetChoice = {
          slot_id: slot.slot_id,
          source: "url",
          url,
          asset_id: r.asset_id,
          sha256: r.sha256,
          bytes: r.bytes,
          mime: r.mime,
          created_at: new Date().toISOString(),
        };
        setChoice(slot.slot_id, choice);
        if (r.preview_data_url) {
          setAssetPreview((p) => ({ ...p, [slot.slot_id]: String(r.preview_data_url) }));
        }
      };

      const runUpload = async (slot: AssetSlot, file: File) => {
        if (!connectorUrl) {
          setAssetMsg("Connector URL missing. Reconnect AI.");
          return;
        }
        setAssetBusySlot(slot.slot_id);
        setAssetMsg(null);
        const form = new FormData();
        form.append("slot_id", slot.slot_id);
        form.append("kind", slot.kind);
        form.append("aspect_ratio", slot.aspect_ratio);
        form.append("file", file);
        const r = await postFormData(`${connectorUrl}/v1/assets/upload`, form, pairingCode);
        setAssetBusySlot(null);
        if (!r?.ok) {
          setAssetMsg(`Upload failed: ${formatConnectorFail(r)}`);
          return;
        }
        const choice: AssetChoice = {
          slot_id: slot.slot_id,
          source: "upload",
          filename: file.name,
          asset_id: r.asset_id,
          sha256: r.sha256,
          bytes: r.bytes,
          mime: r.mime,
          created_at: new Date().toISOString(),
        };
        setChoice(slot.slot_id, choice);
        if (r.preview_data_url) {
          setAssetPreview((p) => ({ ...p, [slot.slot_id]: String(r.preview_data_url) }));
        }
      };

      const runGenerate = async (slot: AssetSlot) => {
        if (!connectorUrl) {
          setAssetMsg("Connector URL missing. Reconnect AI.");
          return;
        }
        const prompt = String(assetPromptInput[slot.slot_id] || "").trim();
        if (!prompt) {
          setAssetMsg("Add a short prompt for the AI image.");
          return;
        }
        const hints = Array.isArray(assetStyleHints[slot.slot_id]) ? assetStyleHints[slot.slot_id] : [];
        setAssetBusySlot(slot.slot_id);
        setAssetMsg(null);
        const r = await postJson(
          `${connectorUrl}/v1/assets/generate`,
          { slot_id: slot.slot_id, kind: slot.kind, prompt, style_hints: hints, aspect_ratio: slot.aspect_ratio },
          pairingCode
        );
        setAssetBusySlot(null);
        if (!r?.ok) {
          setAssetMsg(`AI generation failed: ${formatConnectorFail(r)}`);
          return;
        }
        const choice: AssetChoice = {
          slot_id: slot.slot_id,
          source: "ai",
          prompt,
          style_hints: hints,
          asset_id: r.asset_id,
          sha256: r.sha256,
          bytes: r.bytes,
          mime: r.mime,
          created_at: new Date().toISOString(),
        };
        setChoice(slot.slot_id, choice);
        if (r.preview_data_url) {
          setAssetPreview((p) => ({ ...p, [slot.slot_id]: String(r.preview_data_url) }));
        }
      };

      const STYLE_HINTS = ["minimal", "bold", "geometric", "soft", "monochrome", "photographic", "illustrated"];

      return (
        <Panel title="Assets (logo + images)">
          <SnapshotBar state={state} />

          {!connectorUrl ? (
            <Callout title="Local connector required" tone="warn">
              <p className="small" style={{ margin: 0 }}>
                Assets are local-first: uploads + URL downloads happen on your computer, not Vercel.
              </p>
              <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <a className="btn" href="/director/connect-ai">Reconnect AI</a>
                <a className="btn secondary" href="/director/health">Health check</a>
              </div>
            </Callout>
          ) : null}

          {connectorUrl ? (
            <Callout title="Connector check" tone="info">
              <p className="small" style={{ margin: 0 }}>
                If something feels stuck, test your local connector first.
              </p>
              <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={assetConnCheckBusy}
                  onClick={() => runConnectorCheck("assets")}
                >
                  {assetConnCheckBusy ? "Testing…" : "Test connector"}
                </button>
                <a className="btn secondary" href="/director/health">Health check</a>
                {assetConnCheckMsg ? <span className="small" style={{ opacity: 0.85 }}>{assetConnCheckMsg}</span> : null}
              </div>
              {showLnaAssetsHelp ? (
                <LocalNetworkAccessHelp connectorUrl={connectorUrl} />
              ) : null}
            </Callout>
          ) : null}

          {missingRequired.length ? (
            <Callout title="Finish these first" tone="warn">
              <p className="small" style={{ margin: 0 }}>
                You can’t continue until these required slots are set: <b>{missingRequired.map((m) => m.label || m.slot_id).join(", ")}</b>
              </p>
              <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {missingRequired.slice(0, 6).map((m) => (
                  <button
                    key={m.slot_id}
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      if (typeof window === "undefined") return;
                      const el = document.getElementById(`asset_slot_${m.slot_id}`);
                      if (el && typeof (el as any).scrollIntoView === "function") (el as any).scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {m.label || m.slot_id}
                  </button>
                ))}
              </div>
            </Callout>
          ) : null}

          <Callout title="Brand creation" tone="info">
            <p className="small" style={{ margin: 0 }}>
              Brand creation unlocks AI logo generation. Toggle it here or in Vibe.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className={"btn " + (man.brand_creation_enabled ? "secondary" : "")}
                onClick={() => setBrandCreationEnabled(!man.brand_creation_enabled)}
              >
                {man.brand_creation_enabled ? "Disable brand creation" : "Enable brand creation"}
              </button>
            </div>
          </Callout>

          {assetMsg ? (
            <Callout title="Assets" tone="warn">
              <p className="small" style={{ margin: 0 }}>{assetMsg}</p>
            </Callout>
          ) : null}

          {sortedSlots.map((slot) => {
            const c = choices[slot.slot_id];
            const busy = assetBusySlot === slot.slot_id;
            const preview = assetPreview[slot.slot_id];
            const canAi = slot.kind === "image" || (slot.kind === "logo" && man.brand_creation_enabled);
            const mode = assetSourceUi[slot.slot_id] || "url";
            const hints = assetStyleHints[slot.slot_id] || [];
            return (
              <div id={"asset_slot_" + slot.slot_id} key={slot.slot_id} className="card" style={{ marginBottom: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0 }}>{slot.label || slot.slot_id.replaceAll("_", " ")}</h3>
                      <span className={"chip " + (c?.sha256 ? "active" : "")}>{c?.sha256 ? "Set" : "Missing"}</span>
                      <span className={"chip " + (slot.required ? "active" : "")}>{slot.required ? "Required" : "Optional"}</span>
                    </div>
                    <div className="row small mt0" style={{ marginTop: 6, gap: 8, flexWrap: "wrap", opacity: 0.9 }}>
                      <span style={{ opacity: 0.8 }}>Recommended:</span>
                      <span className="chip">{slot.aspect_ratio}</span>
                      <span className="chip">min {slot.min_size}</span>
                    </div>
                    {slot.help ? (
                      <p className="small" style={{ margin: "6px 0 0 0", opacity: 0.85 }}>{slot.help}</p>
                    ) : null}
                    {c?.sha256 ? (
                      <p className="small" style={{ margin: 0 }}>
                        Set via <b>{c.source}</b> • sha256:{String(c.sha256).slice(0, 10)}…{typeof c.bytes === "number" ? ` • ${c.bytes} bytes` : ""}
                      </p>
                    ) : (
                      <p className="small" style={{ margin: 0 }}>
                        Not set yet.
                      </p>
                    )}
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {c?.sha256 ? (
                      <button type="button" className="btn secondary" onClick={() => clearChoice(slot.slot_id)} disabled={busy}>
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                {preview ? (
                  <div style={{ marginTop: 10 }}>
                    <img src={preview} alt={slot.slot_id} style={{ maxWidth: "100%", borderRadius: 12 }} />
                  </div>
                ) : null}

                <div className="hr" />

                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className={"btn " + (mode === "url" ? "" : "secondary")} onClick={() => setAssetSourceUi((m) => ({ ...m, [slot.slot_id]: "url" }))}>
                    URL
                  </button>
                  <button type="button" className={"btn " + (mode === "upload" ? "" : "secondary")} onClick={() => setAssetSourceUi((m) => ({ ...m, [slot.slot_id]: "upload" }))}>
                    Upload
                  </button>
                  <button
                    type="button"
                    disabled={!canAi}
                    title={!canAi && slot.kind === "logo" ? "Enable Brand creation to unlock AI logo generation." : undefined}
                    className={"btn " + (mode === "ai" ? "" : "secondary")}
                    onClick={() => setAssetSourceUi((m) => ({ ...m, [slot.slot_id]: "ai" }))}
                  >
                    AI generate
                  </button>
                </div>

                {slot.kind === "logo" && !man.brand_creation_enabled ? (
                  <p className="small" style={{ marginTop: 8, opacity: 0.85 }}>
                    AI logo generation is locked. Enable Brand creation above to unlock it.
                  </p>
                ) : null}

                {mode === "url" ? (
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>Image URL (https only)</label>
                    <input
                      className="input"
                      value={assetUrlInput[slot.slot_id] || ""}
                      onChange={(e) => setAssetUrlInput((m) => ({ ...m, [slot.slot_id]: e.target.value }))}
                      placeholder="https://..."
                      disabled={busy}
                    />
                    <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <button type="button" className="btn" disabled={busy || !connectorUrl} onClick={() => runFetchUrl(slot)}>
                        {busy ? "Working…" : "Download from URL"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {mode === "upload" ? (
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>Upload a file</label>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={busy || !connectorUrl}
                      onChange={(e) => {
                        const f = e.target.files && e.target.files[0];
                        if (!f) return;
                        // Reset input so the same file can be re-picked.
                        e.currentTarget.value = "";
                        runUpload(slot, f);
                      }}
                    />
                    <p className="small">Stored locally by the connector. Vercel stores hashes + slot mapping only.</p>
                  </div>
                ) : null}

                {mode === "ai" ? (
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>Prompt</label>
                    <input
                      className="input"
                      value={assetPromptInput[slot.slot_id] || ""}
                      onChange={(e) => setAssetPromptInput((m) => ({ ...m, [slot.slot_id]: e.target.value }))}
                      placeholder={slot.kind === "logo" ? "A simple geometric mark that fits the brand" : "A clean hero image that fits the product"}
                      disabled={busy || !connectorUrl}
                    />
                    <MultiChipRow
                      label="Style hints"
                      values={hints}
                      options={STYLE_HINTS}
                      onChange={(next) => setAssetStyleHints((m) => ({ ...m, [slot.slot_id]: next }))}
                      hint="Optional. Keep it simple so the output stays consistent."
                    />
                    <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                      <button type="button" className="btn" disabled={busy || !connectorUrl || !canAi} onClick={() => runGenerate(slot)}>
                        {busy ? "Working…" : "Generate"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Panel>
      );
    }

    // Stage 6: Vibe
    if (state.step === 6) {
      const style = state.style || {
        vibe: (brief?.feel || "calm") as Vibe,
        typography: "modern",
        shape: "rounded",
        palette: "light",
      };

      const man = (brief && selected)
        ? ensureAssetManifest(state.asset_manifest || undefined, state.seed, brief, selected)
        : null;
      const brandEnabled = Boolean(man?.brand_creation_enabled);

      function setBrandCreationEnabled(next: boolean) {
        if (!brief || !selected) return;
        setState((s) => {
          const cur = ensureAssetManifest(s.asset_manifest || undefined, s.seed, brief, selected);
          if (Boolean(cur.brand_creation_enabled) === next) return s;
          return {
            ...s,
            asset_manifest: {
              ...cur,
              brand_creation_enabled: next,
            },
          };
        });
      }

      function setStyle(next: Partial<StylePack>) {
        setState((s) => ({ ...s, style: { ...(s.style || style), ...next } }));
      }

      return (
        <Panel title="Make it feel right">
          <SnapshotBar state={state} />

          <Callout title="Brand posture" tone="info">
            <p className="small" style={{ margin: 0 }}>
              Most Directors already have a logo and a look. If you want to create a fresh brand identity,
              enable Brand creation so the system can propose a simple mark and tighter design direction.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className={"btn " + (!brandEnabled ? "secondary" : "")}
                onClick={() => setBrandCreationEnabled(false)}
              >
                Use existing brand
              </button>
              <button
                type="button"
                className={"btn " + (brandEnabled ? "secondary" : "")}
                onClick={() => setBrandCreationEnabled(true)}
              >
                Brand creation (optional)
              </button>
              <span className="small" style={{ opacity: 0.85 }}>
                {brandEnabled ? "Enabled (logo AI generation becomes available in Assets)" : "Off (recommended if you already have a logo)"}
              </span>
            </div>
            {brandEnabled ? (
              <p className="small" style={{ margin: "10px 0 0 0", opacity: 0.9 }}>
                Logo creation is not a toy. If you enable this, keep it minimal and let the system propose a few options.
              </p>
            ) : null}
          </Callout>

          {brandEnabled && man && (!(man.choices && man.choices["logo_primary"] && man.choices["logo_primary"].sha256)) ? (
            <Callout title="Next: create your logo" tone="warn">
              <p className="small" style={{ margin: 0 }}>
                You enabled <b>Brand creation</b>. Head back to Assets to generate or upload your logo.
              </p>
              <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn secondary" onClick={() => setState((s) => ({ ...s, step: 5 } as any))}>
                  Go to Assets
                </button>
              </div>
            </Callout>
          ) : null}

          <Callout title={state.style_locked ? "Style is locked" : "Lock this style (optional)"} tone="info">
            <p className="small" style={{ margin: 0 }}>
              If you are happy with the vibe choices, lock them so future changes don’t accidentally drift.
              You can unlock later if you change your mind.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button
                className={"btn " + (state.style_locked ? "secondary" : "")}
                type="button"
                onClick={() => setState((s) => ({ ...s, style_locked: !s.style_locked }))}
              >
                {state.style_locked ? "Unlock style" : "Lock style"}
              </button>
            </div>
          </Callout>

          <Callout title="Preview" tone="neutral">
            <p className="small" style={{ margin: 0 }}>
              Vibe: <b>{style.vibe}</b> · Typography: <b>{style.typography}</b> · Components: <b>{style.shape}</b> · Palette: <b>{style.palette}</b>
            </p>
          </Callout>

          <ChipRow
            label="Vibe"
            disabled={!!state.style_locked}
            value={style.vibe}
            options={[
              { id: "calm", label: "Calm" },
              { id: "playful", label: "Playful" },
              { id: "premium", label: "Premium" },
              { id: "utilitarian", label: "Utilitarian" },
            ]}
            onChange={(vibe) => setStyle({ vibe })}
          />

          <ChipRow
            label="Typography"
            disabled={!!state.style_locked}
            value={style.typography}
            options={[
              { id: "classic", label: "Classic" },
              { id: "modern", label: "Modern" },
              { id: "bold", label: "Bold" },
            ]}
            onChange={(typography) => setStyle({ typography })}
          />

          <ChipRow
            label="Component style"
            disabled={!!state.style_locked}
            value={style.shape}
            options={[
              { id: "rounded", label: "Rounded" },
              { id: "flat", label: "Flat" },
              { id: "soft", label: "Soft" },
              { id: "sharp", label: "Sharp" },
            ]}
            onChange={(shape) => setStyle({ shape })}
          />

          <ChipRow
            label="Palette"
            disabled={!!state.style_locked}
            value={style.palette}
            options={[
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
              { id: "warm", label: "Warm" },
              { id: "cool", label: "Cool" },
            ]}
            onChange={(palette) => setStyle({ palette })}
          />
        </Panel>
      );
    }

    // Stage 7: Build plan
    if (state.step === 7) {
      if (!brief || !selected) {
        return (
          <Panel title="Build plan">
            <p className="small">Finish the earlier steps first.</p>
          </Panel>
        );
      }

      const risks = buildRisks(brief, state.seed.seriousness);

      return (
        <Panel title="What it will take to ship">
          <SnapshotBar state={state} />

          <h3 style={{ marginTop: 0 }}>Day 1 includes</h3>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {refinedPlusUpgrades.map((x) => (
              <span key={x} className="chip active">{x}</span>
            ))}
          </div>

          <div className="hr" />

          <h3 style={{ marginTop: 0 }}>Can wait</h3>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {brief.can_wait.map((x) => (
              <span key={x} className="chip">{x}</span>
            ))}
          </div>

          <div className="hr" />

          <h3 style={{ marginTop: 0 }}>Building blocks (plain language)</h3>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {buildBlocks.map((x) => (
              <span key={x} className="chip active">{x}</span>
            ))}
          </div>

          {risks.length ? (
            <>
              <div className="hr" />
              <h3 style={{ marginTop: 0 }}>Risks handled</h3>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {risks.map((x) => (
                  <span key={x} className="chip active">{x}</span>
                ))}
              </div>
            </>
          ) : null}

          <div className="hr" />
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn secondary" type="button" onClick={() => exportShipArtifacts()}>
              Download build plan + handoff
            </button>
          </div>
        </Panel>
      );
    }

    // Stage 8: Ship
    if (state.step === 8) {
      const proofCmds = [
        "# Verification (recommended)",
        "npm run preflight",
        "npm run deploy:smoke",
        "npm run publish_ready",
      ].join("\n");

      const aiSelNow = aiConn ? {
        brand_id: (aiConn as any)?.brand_id || null,
        connection_kind: (aiConn as any)?.connection_kind || null,
        connection_method: (aiConn as any)?.connection_method || null,
        model_id: (aiConn as any)?.model_id || null,
        preferred_provider_id: (aiConn as any)?.preferred_provider_id || null,
      } : null;

      const shipBasisNow = brief && selected ? shipPackBasisHash({
        seed: state.seed,
        brief,
        selected_proposal_id: selected.id,
        inspiration_vault: Array.isArray(state.inspiration) ? state.inspiration : [],
        taste_vector: state.taste_vector || { chips: [], confidence: "low" },
        taste_locked: !!state.taste_locked,
        tags: Array.isArray(state.tags) ? state.tags : [],
        asset_manifest: state.asset_manifest || null,
        style_locked: !!state.style_locked,
        ai_selection: aiSelNow,
      }) : null;

      const shipSummaryNow = brief && selected ? summarizeShipPackBasis({
        seed: state.seed,
        brief,
        selected_proposal_id: selected.id,
        selected_proposal_name: selected.name,
        inspiration_vault: Array.isArray(state.inspiration) ? state.inspiration : [],
        taste_vector: state.taste_vector || { chips: [], confidence: "low" },
        taste_locked: !!state.taste_locked,
        tags: Array.isArray(state.tags) ? state.tags : [],
        style_locked: !!state.style_locked,
        ai_selection: aiSelNow ? { brand_id: aiSelNow.brand_id, model_id: aiSelNow.model_id } : null,
      }) : null;
      const shipLockOutOfDate = Boolean(
        state.ship_pack_locked &&
        state.ship_pack_locked_basis_hash &&
        shipBasisNow &&
        state.ship_pack_locked_basis_hash !== shipBasisNow
      );
      const lockedEffective = Boolean(state.ship_pack_locked && !shipLockOutOfDate);
      const shipLockChanges = shipLockOutOfDate && shipSummaryNow
        ? diffShipPackBasisSummary((state as any).ship_pack_locked_basis_summary, shipSummaryNow)
        : [];

      const missingAssets = summarizeMissingRequiredAssets(state.asset_manifest || null);
      const hasAllRequiredAssets = missingAssets.missing_ids.length === 0;
      const connectorConfigured = Boolean(aiConn?.connector_url);
      const canDownloadPack = connectorConfigured && hasAllRequiredAssets;

      return (
        <Panel title="Ship pack">
          <SnapshotBar state={state} />

          <p className="small mt0">
            This exports a handoff a freelancer/team can build from, without you speaking technical language.
          </p>

          {aiConn?.connector_url ? (
            <Callout title="Connector check" tone="info">
              <p className="small" style={{ margin: 0 }}>
                Exports run through your local connector. If something fails, test the connector first.
              </p>
              <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={shipConnCheckBusy}
                  onClick={() => runConnectorCheck("ship")}
                >
                  {shipConnCheckBusy ? "Testing…" : "Test connector"}
                </button>
                <a className="btn secondary" href="/director/health">Health check</a>
                {shipConnCheckMsg ? <span className="small" style={{ opacity: 0.85 }}>{shipConnCheckMsg}</span> : null}
              </div>
              {showLnaShipHelp ? (
                <LocalNetworkAccessHelp connectorUrl={aiConn?.connector_url} />
              ) : null}
            </Callout>
          ) : null}

          <Callout title="Export readiness" tone={canDownloadPack ? "success" : "warn"}>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>
                Connector: {connectorConfigured ? "Connected" : "Not connected"}
              </li>
              <li>
                Required assets: {hasAllRequiredAssets ? "Complete" : `Missing ${missingAssets.missing_labels.join(", ")}`}
              </li>
              <li>
                Lock status: {lockedEffective ? "Locked" : "Draft"}
              </li>
            </ul>
            {!hasAllRequiredAssets ? (
              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setState((s) => ({ ...s, step: 5 } as any))}
                >
                  Go to Assets
                </button>
              </div>
            ) : null}
            {!connectorConfigured ? (
              <p className="small" style={{ margin: "10px 0 0 0", opacity: 0.9 }}>
                If your browser blocks local requests, open the Health check and follow the Local Network Access steps.
              </p>
            ) : null}
          </Callout>

          <details className="small" style={{ margin: "10px 0 0 0" }}>
            <summary style={{ cursor: "pointer" }}>What’s inside the ship pack</summary>
            <ul style={{ margin: "8px 0 0 0", paddingLeft: 18 }}>
              <li><b>HANDOFF.md</b> (plain-English build instructions)</li>
              <li><b>ship_pack.json</b> (your selected option + refinements + plan)</li>
              <li><b>asset_manifest.json</b> (slots + chosen sources + hashes)</li>
              <li><b>project_assets/</b> (your logo/images, stored locally and verified)</li>
              <li><b>receipt.json</b> (sha256 + byte receipts for verification)</li>
            </ul>
          </details>


          <Callout title="Ship pack status" tone={lockedEffective ? "success" : (state.ship_pack_locked && shipLockOutOfDate ? "warn" : "info")}>
            <p className="small" style={{ margin: 0 }}>
              {lockedEffective
                ? `Locked${state.ship_pack_locked_at ? ` · ${new Date(state.ship_pack_locked_at).toLocaleString()}` : ""}`
                : state.ship_pack_locked && shipLockOutOfDate
                ? "Locked (out of date). Re-lock to update the locked version."
                : "Draft (you can keep refining before locking)."}
            </p>
            {shipLockOutOfDate && shipLockChanges.length ? (
              <div className="small" style={{ marginTop: 8 }}>
                <div style={{ opacity: 0.85, marginBottom: 6 }}>What changed since you locked:</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {shipLockChanges.slice(0, 10).map((x, i) => (
                    <li key={`shipchg_${i}`}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              {!lockedEffective ? (
                <>
                  <input
                    className="input"
                    placeholder="Type LOCK"
                    value={shipLockToken}
                    onChange={(e) => setShipLockToken(e.target.value)}
                    style={{ maxWidth: 160 }}
                  />
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={String(shipLockToken || "").trim().toUpperCase() !== "LOCK" || !shipBasisNow}
                    onClick={() => {
                      setState((s) => ({
                        ...s,
                        ship_pack_locked: true,
                        ship_pack_locked_at: new Date().toISOString(),
                        ship_pack_locked_basis_hash: shipBasisNow || undefined,
                        ship_pack_locked_basis_summary: shipSummaryNow || undefined,
                      } as any));
                      setShipLockToken("");
                    }}
                  >
                    {state.ship_pack_locked ? "Re-lock ship pack" : "Lock ship pack"}
                  </button>
                  {state.ship_pack_locked ? (
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => {
                        setState((s) => ({ ...s, ship_pack_locked: false, ship_pack_locked_at: null, ship_pack_locked_basis_hash: undefined, ship_pack_locked_basis_summary: undefined } as any));
                        setDraftExportAck(false);
                      }}
                    >
                      Unlock
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    setState((s) => ({ ...s, ship_pack_locked: false, ship_pack_locked_at: null, ship_pack_locked_basis_hash: undefined, ship_pack_locked_basis_summary: undefined } as any));
                    setDraftExportAck(false);
                  }}
                >
                  Unlock
                </button>
              )}
            </div>
          </Callout>

          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={() => exportShipArtifacts()} disabled={!canDownloadPack}>
              {lockedEffective ? "Download locked ship pack" : "Download draft ship pack"}
            </button>
            <button className="btn secondary" type="button" onClick={() => exportJourneyBackup(state)}>
              Download backup
            </button>
          </div>

          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
            <input
              className="input"
              placeholder="Type RESET"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              style={{ maxWidth: 160 }}
            />
            <button
              className="btn secondary"
              type="button"
              disabled={String(resetToken || "").trim().toUpperCase() !== "RESET"}
              onClick={() => {
                reset();
                setResetToken("");
              }}
            >
              Start a new project
            </button>
          </div>

          <div className="hr" />

          <h3 style={{ marginTop: 0 }}>Export to GitHub (optional)</h3>
          <p className="small mt0">
            Create a new repo using GitHub CLI (gh) installed on your computer. No tokens are typed into this website.
          </p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <input
              className="input"
              placeholder={`kindred-ship-pack-${state.seed.goal}`}
              value={githubRepoName}
              onChange={(e) => setGithubRepoName(e.target.value)}
              style={{ minWidth: 240, flex: 1 }}
            />
            <input
              className="input"
              placeholder="Type EXPORT"
              value={githubConfirmToken}
              onChange={(e) => setGithubConfirmToken(e.target.value)}
              style={{ maxWidth: 160 }}
            />
            <button
              className="btn secondary"
              type="button"
              onClick={() => exportToGithub()}
              disabled={
                githubBusy ||
                String(githubConfirmToken || "").trim().toUpperCase() !== "EXPORT" ||
                (!lockedEffective && !draftExportAck) ||
                !canDownloadPack
              }
            >
              {githubBusy ? "Exporting…" : (lockedEffective ? "Export locked pack" : "Export draft pack")}
            </button>
          </div>

          {!lockedEffective ? (
            <label className="small" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={draftExportAck}
                onChange={(e) => setDraftExportAck(Boolean(e.target.checked))}
              />
              I understand this is a draft export.
            </label>
          ) : null}

          {githubMsg ? (
            <Callout
              title="GitHub export"
              tone={githubMsg.startsWith("Exported") ? "success" : "warn"}
              actions={
                githubRepoUrl ? (
                  <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                    <a className="btn secondary" href={githubRepoUrl} target="_blank" rel="noreferrer">
                      Open on GitHub
                    </a>
                    {githubCommitUrl ? (
                      <a className="btn secondary" href={githubCommitUrl} target="_blank" rel="noreferrer">
                        Open commit
                      </a>
                    ) : null}
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(githubRepoUrl);
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      Copy link
                    </button>
                    {githubCommitSha ? (
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(githubCommitSha);
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        Copy commit SHA
                      </button>
                    ) : null}
                  </div>
                ) : null
              }
            >
              <p className="small" style={{ margin: 0 }}>{githubMsg}</p>
              {githubRemoteVerified !== null ? (
                <p className="small" style={{ margin: "6px 0 0 0", opacity: 0.9 }}>
                  Remote verification: {githubRemoteVerified
                    ? "Verified on GitHub"
                    : `Mismatch (remote HEAD ${githubRemoteHeadSha ? githubRemoteHeadSha.slice(0, 7) : "unknown"} != pushed commit)`}
                </p>
              ) : githubRemoteVerifyError ? (
                <p className="small" style={{ margin: "6px 0 0 0", opacity: 0.9 }}>
                  Remote verification: Not confirmed yet (check your network / permissions).
                </p>
              ) : null}
            </Callout>
          ) : null}

          {showLnaGithubHelp ? <LocalNetworkAccessHelp connectorUrl={aiConn?.connector_url} /> : null}

          <div className="hr" />

          <h3 style={{ marginTop: 0 }}>Verification checklist (for your team)</h3>
          <pre className="codeblock">{proofCmds}</pre>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn secondary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(proofCmds);
                } catch {
                  // ignore
                }
              }}
            >
              Copy commands
            </button>
          </div>

          <Callout title="Non-custodial by default" tone="info">
            <p className="small" style={{ margin: 0 }}>
              No secrets are stored in the browser. Integrations are declared as needed, and secrets are added later in your own deployment.
            </p>
          </Callout>
        </Panel>
      );
    }

    return (
      <Panel title="Journey">
        <p className="small">Something went wrong. Try starting over.</p>
      </Panel>
    );
  }

  if (!aiConnected && !aiOptOut) {
    return (
      <div className="container">
        <StepHeader step={0} savedAt={savedAt} />
        <Panel title="Connect AI first">
          <Callout title="AI is required" tone="warn">
            <p className="small" style={{ margin: 0 }}>
              This journey is powered by AI proposals. Connect an AI provider on this device so we can generate real options.
            </p>
          </Callout>

          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <a className="btn" href="/director/connect-ai">
              Connect AI
            </a>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                enableAiOptOut();
                setState((s) => ({ ...s, step: Math.max(0, s.step) }));
              }}
            >
              Continue without AI (limited)
            </button>
            <a className="btn secondary" href="/">
              Back
            </a>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="container">
      <StepHeader step={state.step} savedAt={savedAt} />

      {brownfield?.inventory?.artifacts ? (
        <Callout title="Imported app detected" tone="info">
          <p className="small" style={{ margin: 0 }}>
            Proposals will be shaped by your imported routes and draft spec skeleton.
            <a href="/director/import" className="link" style={{ marginLeft: 8 }}>Review import</a>
          </p>
        </Callout>
      ) : null}

      {aiStatus ? (
        <Callout title="AI is working" tone="info">
          <p className="small" style={{ margin: 0 }}>{aiStatus}</p>
        </Callout>
      ) : null}

      {showLnaAiHelp ? <LocalNetworkAccessHelp connectorUrl={aiConn?.connector_url} /> : null}

      {resumeOffer ? (
        <Panel title="Continue your previous project?">
          <p className="small mt0">We found something you were working on. Continue, or start fresh.</p>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setState(resumeOffer);
                setResumeOffer(null);
                setSavedAt(Date.now());
              }}
            >
              Continue
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setResumeOffer(null);
                reset();
              }}
            >
              Start fresh
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => exportJourneyBackup(resumeOffer)}
            >
              Download backup
            </button>
          </div>
        </Panel>
      ) : null}

      {blockMsg ? (
        <Callout title="Before you continue…" tone="warn">
          <p className="small" style={{ margin: 0 }}>{blockMsg}</p>
        </Callout>
      ) : null}

      <div style={{ marginTop: 12 }}>{renderStep()}</div>

      {state.step > 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn secondary" type="button" onClick={() => back()} disabled={state.step === 0}>
              Back
            </button>
            <button className="btn" type="button" onClick={() => next()} disabled={state.step === 8}>
              {state.step === 8 ? "Done" : "Continue"}
            </button>
          </div>

          <details className="rounded-2xl border p-3" style={{ marginTop: 12 }}>
            <summary className="small" style={{ cursor: "pointer", userSelect: "none" }}>
              More actions
            </summary>
            <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn secondary" type="button" onClick={() => exportJourneyBackup(state)}>
                Download backup
              </button>

              <button className="btn secondary" type="button" onClick={() => importRef.current?.click()}>
                Import backup
              </button>

              <button
                className="btn danger"
                type="button"
                onClick={() => {
                  try {
                    const token = prompt("This will wipe this Journey on this device. Type RESET to confirm.");
                    if (String(token || "").trim().toUpperCase() !== "RESET") return;
                  } catch {
                    return;
                  }
                  reset();
                }}
              >
                Start fresh
              </button>

              <input
                ref={importRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importJourneyBackupFromFile(f);
                  if (e.target) e.target.value = "";
                }}
              />
            </div>

            <p className="small" style={{ margin: "10px 0 0 0", opacity: 0.9 }}>
              Tip: backups are plain JSON. Share them with a teammate, or keep them as receipts.
            </p>
          </details>
        </div>
      ) : null}

      {importError ? (
        <Callout title="Import failed" tone="warn">
          <p className="small" style={{ margin: 0 }}>{importError}</p>
        </Callout>
      ) : null}
    </div>
  );
}
