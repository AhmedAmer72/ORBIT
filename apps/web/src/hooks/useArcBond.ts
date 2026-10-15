"use client";

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { type Address, isAddress, zeroAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { factoryAbi, listVaults, readVault, vaultAbi } from "@arcbond/sdk";

import { appConfig } from "@/lib/config";
import { configuredChain } from "@/lib/wagmi";

export function useSelectedVaultAddress() {
  const [params] = useSearchParams();
  const raw = params.get("vault") ?? "";
  return isAddress(raw) ? raw : undefined;
}

export function useOwnedVaults() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: configuredChain.id });

  return useQuery({
    queryKey: ["vaults", appConfig.factory, address],
    enabled: Boolean(appConfig.factory && address && publicClient),
    queryFn: async () => {
      if (!appConfig.factory || !address || !publicClient) return [];
      return listVaults(publicClient, appConfig.factory, address);
    },
  });
}

export function useVaultState(vault: Address | undefined) {
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  return useQuery({
    queryKey: ["vault", vault],
    enabled: Boolean(vault && publicClient),
    queryFn: async () => {
      if (!vault || !publicClient) throw new Error("No vault");
      return readVault(publicClient, vault);
    },
  });
}

export function useIsFactoryVault(vault: Address | undefined) {
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  return useQuery({
    queryKey: ["isVault", vault],
    enabled: Boolean(appConfig.factory && vault && publicClient),
    queryFn: async () => {
      if (!appConfig.factory || !vault || !publicClient) return false;
      return publicClient.readContract({
        address: appConfig.factory,
        abi: factoryAbi,
        functionName: "isVault",
        args: [vault],
      });
    },
  });
}

export function useRecipientApproved(vault: Address | undefined, recipient: Address | undefined) {
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  return useQuery({
    queryKey: ["recipient", vault, recipient],
    enabled: Boolean(vault && recipient && publicClient && recipient !== zeroAddress),
    queryFn: async () => {
      if (!vault || !recipient || !publicClient) return false;
      return publicClient.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: "approvedRecipients",
        args: [recipient],
      });
    },
  });
}

export function vaultHref(path: string, vault: Address | undefined) {
  return vault ? `${path}?vault=${vault}` : path;
}

export function useActiveVault() {
  const owned = useOwnedVaults();
  const selected = useSelectedVaultAddress();
  const vault = selected ?? owned.data?.[0];
  const state = useVaultState(vault);
  const verified = useIsFactoryVault(vault);
  return useMemo(
    () => ({
      vault,
      owned,
      state,
      verified: verified.data === true,
      factoryConfigured: Boolean(appConfig.factory),
    }),
    [owned, state, vault, verified.data],
  );
}
