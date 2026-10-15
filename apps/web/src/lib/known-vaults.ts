import { isAddress, type Address } from "viem";

const storageKey = (account: Address) => `orbit.vaults.${account.toLowerCase()}`;

export function readKnownVaults(account: Address | undefined): Address[] {
  if (!account || typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(account)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Address => typeof item === "string" && isAddress(item));
  } catch {
    return [];
  }
}

export function rememberVault(account: Address, vault: Address) {
  if (typeof localStorage === "undefined") return;
  const current = readKnownVaults(account);
  if (current.some((item) => item.toLowerCase() === vault.toLowerCase())) return;
  localStorage.setItem(storageKey(account), JSON.stringify([vault, ...current].slice(0, 8)));
}

export function mergeVaults(...groups: readonly (readonly Address[])[]): Address[] {
  const seen = new Set<string>();
  const merged: Address[] = [];
  for (const group of groups) {
    for (const vault of group) {
      const key = vault.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(vault);
    }
  }
  return merged;
}
