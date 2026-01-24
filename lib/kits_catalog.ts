import sddeKitManifest from "../kits/sdde_os_kernel_seed/kit.json";

export type KitChip = {
  id: string;
  label: string;
  group: string;
  description: string;
  tags: string[];
};

/**
 * Kits Builder v1
 *
 * Kits are the only place where provider/product specifics are allowed.
 * The Kindred core remains kernel-neutral.
 */

export const KITS_CATALOG_VERSION = "v1" as const;

export const KITS_CATALOG_V1: KitChip[] = [
  {
    id: (sddeKitManifest as any).kit_id || "sdde_os_kernel_seed_v1",
    label: (sddeKitManifest as any).title || "SDDE OS Kernel Seed",
    group: "Kernel seeds",
    description:
      (sddeKitManifest as any).description ||
      "Seed templates + local verification plan for bootstrapping an SDDE OS-style kernel repo.",
    tags: ["seed", "verify", "sdde"],
  },
];

export function groupKits(items: KitChip[]): Array<{ group: string; chips: KitChip[] }> {
  const map = new Map<string, KitChip[]>();
  for (const c of items) {
    const g = String(c.group || "Other");
    const arr = map.get(g) || [];
    arr.push(c);
    map.set(g, arr);
  }
  const groups = Array.from(map.entries()).map(([group, chips]) => {
    const sorted = chips.slice().sort((a, b) => a.label.localeCompare(b.label));
    return { group, chips: sorted };
  });
  return groups.sort((a, b) => a.group.localeCompare(b.group));
}
