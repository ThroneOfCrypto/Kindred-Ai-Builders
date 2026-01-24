"use client";

import { SpecPack, getManifest, looksLikeRepoZip } from "./spec_pack";
import { validateSpecPack } from "./validation";

export type NoticeKind = "info" | "success" | "warn" | "error";

export type PackDiagnostics = {
  kind: NoticeKind;
  headline: string;
  details: string[];
};

function topN<T>(arr: T[], n: number): T[] {
  return arr.length <= n ? arr : arr.slice(0, n);
}

export function diagnoseImportedPack(pack: SpecPack, label: "Base" | "Proposal"): PackDiagnostics {
  const details: string[] = [];

  const manifest = getManifest(pack);
  if (!manifest.ok) {
    if (looksLikeRepoZip(pack)) {
      details.push("The ZIP contains files like package.json / app/ which usually indicates a source repo archive.");
      details.push("Workbench expects a Builder-exported Spec Pack ZIP (it contains spec_pack_manifest.json at the root).");
      details.push("Fix: open Builder, export a Spec Pack ZIP, then import that ZIP into Workbench.");
      return { kind: "error", headline: `${label} import failed: not a Spec Pack ZIP`, details };
    }

    details.push(manifest.error);
    details.push("Workbench expects spec_pack_manifest.json at the root of the ZIP.");
    details.push("Fix: export from Builder (Review → Export Spec Pack ZIP) or regenerate a Current-State Spec Pack from Brownfield.");
    return { kind: "error", headline: `${label} imported with errors`, details };
  }

  const report = validateSpecPack(pack);
  const errors = report.issues.filter((i) => i.severity === "error");
  const warns = report.issues.filter((i) => i.severity === "warn");

  if (errors.length > 0) {
    for (const i of topN(errors, 6)) {
      const where = i.file ? ` (${i.file})` : "";
      details.push(`${i.code}: ${i.message}${where}`);
    }
    if (errors.length > 6) details.push(`...and ${errors.length - 6} more errors`);
    details.push("You can still inspect files, but diffs/patches may be unreliable until these errors are resolved.");
    return { kind: "error", headline: `${label} imported with validation errors`, details };
  }

  if (warns.length > 0) {
    for (const i of topN(warns, 4)) {
      const where = i.file ? ` (${i.file})` : "";
      details.push(`${i.code}: ${i.message}${where}`);
    }
    if (warns.length > 4) details.push(`...and ${warns.length - 4} more warnings`);
    details.push("Warnings do not block diff/patch, but you may want to clean them up before locking.");
    return { kind: "warn", headline: `${label} imported with warnings`, details };
  }

  return { kind: "success", headline: `${label} imported successfully`, details: [] };
}
