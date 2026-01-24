"use client";

import { strToU8 } from "fflate";
import { SpecPack } from "./spec_pack";
import type { SpecPackPatchV1 } from "./spec_pack_patch";
import { sha256Hex } from "./spec_pack_patch";
import { computePackHash, computePatchOpsHash, getPackGovernance, decodeLockedPack } from "./pack_governance";
import { APP_VERSION, VALIDATOR_VERSION, SPEC_PACK_VERSION } from "./version";

export type DeterminismPackRef = {
  label: string;
  zip_sha256?: string;
  pack_sha256?: string;
  files?: { path: string; sha256: string; size: number }[];
  note?: string;
};

export type DeterminismReportV1 = {
  schema: "kindred.determinism_report.v1";
  generated_at_utc: string;
  app_version: string;
  validator_version: string;
  spec_pack_version: string;
  project_id?: string;
  packs: {
    base?: DeterminismPackRef;
    proposal?: DeterminismPackRef;
    locked?: DeterminismPackRef;
  };
  patch_ops_sha256?: string;
  lineage?: {
    status: "locked" | "unlocked" | "unknown";
    last_locked_pack_sha256?: string;
    events: { at_utc: string; event: string; locked_pack_sha256?: string }[];
  };
  checks: {
    ok: boolean;
    warnings: string[];
  };
};

function nowUtc(): string {
  return new Date().toISOString();
}

export async function computeZipSha256(bytes: Uint8Array): Promise<string> {
  return await sha256Hex(bytes);
}

async function packRefFromBytes(label: string, zipBytes?: Uint8Array, pack?: SpecPack): Promise<DeterminismPackRef> {
  const out: DeterminismPackRef = { label };
  if (zipBytes) out.zip_sha256 = await computeZipSha256(zipBytes);
  if (pack) {
    const h = await computePackHash(pack);
    out.pack_sha256 = h.pack_sha256;
    out.files = h.files;
  }
  return out;
}

export async function buildDeterminismReport(opts: {
  projectId?: string;
  base?: { zipBytes?: Uint8Array; pack?: SpecPack };
  proposal?: { zipBytes?: Uint8Array; pack?: SpecPack };
  patch?: SpecPackPatchV1 | null;
}): Promise<DeterminismReportV1> {
  const warnings: string[] = [];
  const pid = opts.projectId;

  const report: DeterminismReportV1 = {
    schema: "kindred.determinism_report.v1",
    generated_at_utc: nowUtc(),
    app_version: APP_VERSION,
    validator_version: VALIDATOR_VERSION,
    spec_pack_version: SPEC_PACK_VERSION,
    project_id: pid,
    packs: {},
    checks: { ok: true, warnings: [] },
  };

  if (opts.base?.zipBytes || opts.base?.pack) report.packs.base = await packRefFromBytes("Base", opts.base?.zipBytes, opts.base?.pack);
  if (opts.proposal?.zipBytes || opts.proposal?.pack)
    report.packs.proposal = await packRefFromBytes("Proposal", opts.proposal?.zipBytes, opts.proposal?.pack);

  if (pid) {
    try {
      const gov = getPackGovernance(pid);
      const status = gov?.status === "locked" || gov?.status === "unlocked" ? gov.status : "unknown";
      report.lineage = {
        status,
        last_locked_pack_sha256: gov?.last_locked?.pack_sha256,
        events: (gov?.history || []).slice(-20).map((e) => ({ at_utc: e.at_utc, event: e.event, locked_pack_sha256: e.locked_pack_sha256 })),
      };

      if (gov?.last_locked) {
        const lockedPack = decodeLockedPack(pid);
        if (!lockedPack) {
          warnings.push("Locked snapshot exists, but locked pack bytes are missing or unreadable.");
        } else {
          const lockedRef = await packRefFromBytes("Locked", undefined, lockedPack);
          // Compare computed to snapshot
          if (lockedRef.pack_sha256 && lockedRef.pack_sha256 !== gov.last_locked.pack_sha256) {
            warnings.push("Locked pack hash drift: stored snapshot does not match computed locked pack.");
          }
          report.packs.locked = lockedRef;
        }
      }
    } catch {
      warnings.push("Failed to read pack governance lineage.");
    }
  }

  if (opts.patch) {
    try {
      report.patch_ops_sha256 = await computePatchOpsHash(opts.patch);
    } catch {
      warnings.push("Failed to compute patch ops hash.");
    }
  }

  // Sanity checks
  if (report.packs.base?.pack_sha256 && report.packs.base?.zip_sha256) {
    // Zip hash is different from pack hash; both should exist, no direct equality.
  } else if (opts.base) {
    warnings.push("Base pack is missing zip bytes or pack hash (partial report).");
  }
  if (opts.proposal && !report.packs.proposal?.pack_sha256) warnings.push("Proposal pack hash missing.");

  report.checks.warnings = warnings;
  report.checks.ok = warnings.length === 0;
  return report;
}

// Deterministic text representation for hashing/debugging.
export function determinismReportCanonicalBytes(r: DeterminismReportV1): Uint8Array {
  // Avoid including generated_at_utc in canonical bytes.
  const clone: any = { ...r, generated_at_utc: "" };
  const json = JSON.stringify(clone);
  return strToU8(json);
}
