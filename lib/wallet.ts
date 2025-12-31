export type Cip30Api = {
  getNetworkId: () => Promise<number>;
  getUsedAddresses: () => Promise<string[]>;
};

export type WalletEnable = () => Promise<Cip30Api>;

export type WalletHandle = {
  key: string;
  name: string;
  enable: WalletEnable;
};

export function listWallets(): WalletHandle[] {
  const c = (typeof window !== "undefined" ? (window as any).cardano : undefined) as
    | Record<string, any>
    | undefined;

  if (!c) return [];

  const out: WalletHandle[] = [];
  for (const [key, value] of Object.entries(c)) {
    if (value && typeof value === "object" && typeof (value as any).enable === "function") {
      out.push({ key, name: (value as any).name ?? key, enable: (value as any).enable });
    }
  }
  // Stable ordering for UI
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
