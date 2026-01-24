"use client";

import { lastBasePackKeyForProject, LEGACY_LAST_BASE_PACK_KEY } from "./state";
import type { DomainId, ProjectState } from "./types";

import { buildSpecPack } from "./export_pack";
import { decodeBase64, encodeBase64, tryReadZip, type SpecPack } from "./spec_pack";
import { diffSpecPacks } from "./pack_diff";
import { buildPatchFromPacks } from "./spec_pack_patch";
import { zipDeterministic } from "./deterministic_zip";
import { stableJsonText } from "./stable_json";
import { sha256Hex } from "./hash";
import { saveProposal, type ProposalV2 } from "./proposals";
import { isPackLocked } from "./pack_governance";
import { domainsSddlText, normalizeDomainIds } from "./domains_spel";

export type DomainsSelectionProposalResult =
  | {
      ok: true;
      proposal_id: string;
      base_pack_sha256: string;
      proposed_pack_sha256: string;
      warnings: string[];
    }
  | {
      ok: false;
      error: string;
      details: string[];
    };

function readLS(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function ensureManifestContains(paths: string[], mustInclude: string) {
  if (!paths.includes(mustInclude)) paths.push(mustInclude);
}

function buildSpecPackWithDomains(basePack: SpecPack, domainIds: DomainId[]): { zip: Uint8Array; pack: SpecPack; warnings: string[] } {
  const warnings: string[] = [];

  const files: Record<string, Uint8Array> = {};
  for (const [path, f] of basePack.fileMap.entries()) files[path] = f.bytes;

  const normalized = normalizeDomainIds(domainIds);

  // Source-of-truth drill-down selections
  files["intent/domains.json"] = new TextEncoder().encode(
    stableJsonText({ schema: "kindred.intent.domains.v1", domains: normalized }, 2)
  );

  // Deterministic SPEL module
  files["spel/domains.spel"] = new TextEncoder().encode(domainsSddlText({ domain_ids: normalized }));

  // Update manifest contents if possible
  try {
    const raw = files["spec_pack_manifest.json"];
    const parsed = raw ? JSON.parse(new TextDecoder().decode(raw)) : null;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).contents)) {
      const contents: string[] = (parsed as any).contents;
      ensureManifestContains(contents, "intent/domains.json");
      ensureManifestContains(contents, "spel/domains.spel");
      files["spec_pack_manifest.json"] = new TextEncoder().encode(stableJsonText(parsed, 2));
    } else {
      warnings.push("spec_pack_manifest.json could not be updated cleanly; regenerating minimal manifest.");
      const minimal = {
        schema: "kindred.spec_pack_manifest.v1",
        project_id: "",
        created_at_utc: "1980-01-01T00:00:00.000Z",
        contents: Object.keys(files).sort(),
      };
      files["spec_pack_manifest.json"] = new TextEncoder().encode(stableJsonText(minimal, 2));
    }
  } catch {
    warnings.push("spec_pack_manifest.json update failed; leaving manifest unchanged.");
  }

  const zip = zipDeterministic({ files });
  const parsedZip = tryReadZip(zip);
  if (!parsedZip.ok) {
    warnings.push("Failed to parse the generated Spec Pack zip.");
    return { zip, pack: basePack, warnings };
  }

  return { zip, pack: parsedZip.pack, warnings };
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export async function createDomainsSelectionProposal(args: {
  project_id: string;
  state: ProjectState;
  domain_ids: DomainId[];
}): Promise<DomainsSelectionProposalResult> {
  const projectId = String(args.project_id || "").trim() || "default";

  if (isPackLocked(projectId)) {
    return {
      ok: false,
      error: "Spec Pack is locked",
      details: ["Domain proposals require an unlocked Spec Pack.", "Create a new project or unlock by switching projects."],
    };
  }

  const warnings: string[] = [];

  // Ensure we have a base Spec Pack
  let baseZip: Uint8Array | null = null;
  let basePack: SpecPack | null = null;
  try {
    const b64 = readLS(lastBasePackKeyForProject(projectId)) || readLS(LEGACY_LAST_BASE_PACK_KEY);
    if (b64) {
      const bytes = decodeBase64(b64);
      const parsed = tryReadZip(bytes);
      if (parsed.ok) {
        baseZip = bytes;
        basePack = parsed.pack;
      }
    }
  } catch {
    // ignore
  }

  if (!baseZip || !basePack) {
    try {
      const synthesized = buildSpecPack(args.state);
      const parsed = tryReadZip(synthesized);
      if (!parsed.ok) {
        return {
          ok: false,
          error: "Failed to synthesize Base Spec Pack",
          details: ["The project state could not be compiled into a Spec Pack."],
        };
      }
      baseZip = synthesized;
      basePack = parsed.pack;
      const b64 = encodeBase64(synthesized);
      writeLS(lastBasePackKeyForProject(projectId), b64);
      writeLS(LEGACY_LAST_BASE_PACK_KEY, b64);
      warnings.push("Base Spec Pack was synthesized for this project.");
    } catch (e: any) {
      return {
        ok: false,
        error: "Failed to synthesize Base Spec Pack",
        details: [String(e?.message || e)],
      };
    }
  }

  const normalized = normalizeDomainIds(args.domain_ids);

  // Build proposal Spec Pack (base + domains module)
  const proposalBuilt = buildSpecPackWithDomains(basePack, normalized);
  warnings.push(...proposalBuilt.warnings);

  const diff = diffSpecPacks(basePack, proposalBuilt.pack);
  const summary = `Domains selection (${normalized.length})`;
  const patch = await buildPatchFromPacks({
    base: basePack,
    proposal: proposalBuilt.pack,
    patch_text: diff.fullPatch,
    summary,
    stats: diff.stats,
  });

  const now = new Date().toISOString();
  const proposal: ProposalV2 = {
    schema: "kindred.proposal.v2",
    id: randomId("dom"),
    created_at_utc: now,
    summary,
    patch: { ...patch, summary, base_project_id: projectId },
  } as any;

  saveProposal(proposal);

  const baseSha = baseZip ? await sha256Hex(baseZip) : "";
  const propSha = await sha256Hex(proposalBuilt.zip);

  return {
    ok: true,
    proposal_id: proposal.id,
    base_pack_sha256: baseSha,
    proposed_pack_sha256: propSha,
    warnings,
  };
}
