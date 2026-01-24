"use client";

import type { VerifyPlan } from "./verify";

import type { KitRepoSeedTemplate } from "../kits/sdde_os_kernel_seed/seed";
import { sddeOsKernelRepoSeedTemplates } from "../kits/sdde_os_kernel_seed/seed";
import { sddeOsKernelVerifyPlans } from "../kits/sdde_os_kernel_seed/verify_plan";
import sddeKitManifest from "../kits/sdde_os_kernel_seed/kit.json";

export type KitManifestV1 = {
  schema: "kindred.kit_manifest.v1";
  kit_id: string;
  kit_version: string;
  title: string;
  description?: string;
  contributes?: any;
};

export type KindredKit = {
  manifest: KitManifestV1;
  repo_seed_templates: KitRepoSeedTemplate[];
  verify_plans: VerifyPlan[];
};

const BUILT_IN_KITS: KindredKit[] = [
  {
    manifest: sddeKitManifest as any,
    repo_seed_templates: sddeOsKernelRepoSeedTemplates(),
    verify_plans: sddeOsKernelVerifyPlans(),
  },
];

export function availableKits(): KindredKit[] {
  return BUILT_IN_KITS.slice();
}

export function getKitById(kitId: string): KindredKit | null {
  const id = String(kitId || "").trim();
  if (!id) return null;
  for (const k of BUILT_IN_KITS) {
    if (k.manifest.kit_id === id) return k;
  }
  return null;
}

export function kitSelectOptions(): Array<{ id: string; title: string; description: string }> {
  const opts: Array<{ id: string; title: string; description: string }> = [
    { id: "", title: "None (kernel-neutral)", description: "Use core, kernel-neutral templates and plans." },
  ];
  for (const k of BUILT_IN_KITS) {
    opts.push({
      id: k.manifest.kit_id,
      title: k.manifest.title,
      description: k.manifest.description || "",
    });
  }
  return opts;
}
