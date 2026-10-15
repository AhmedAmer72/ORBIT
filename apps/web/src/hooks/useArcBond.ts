"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { parseAbiItem, type Address, isAddress, zeroAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { factoryAbi, isRpcRateLimit, listVaults, readVault, vaultAbi } from "@arcbond/sdk";

import { appConfig } from "@/lib/config";
import { mergeVaults, readKnownVaults, rememberVault } from "@/lib/known-vaults";
import { MAX_LOG_BLOCK_SPAN } from "@/lib/log-ranges";
import { configuredChain } from "@/lib/wagmi";

const agentAuthorizedEvent = parseAbiItem("event AgentAuthorized(address indexed agent)");

async function recentAgentVaults(publicClient: NonNullable<ReturnType<typeof usePublicClient>>, account: Address) {
  if (!appConfig.factory) return [];
  const latest = await publicClient.getBlockNumber();
  const windowStart = latest >= MAX_LOG_BLOCK_SPAN ? latest - MAX_LOG_BLOCK_SPAN + 1n : 0n;
  const fromBlock =
    appConfig.factoryDeployBlock !== undefined && appConfig.factoryDeployBlock > windowStart
      ? appConfig.factoryDeployBlock
      : windowStart;
  let logs;
  try {
    logs = await publicClient.getLogs({
      event: agentAuthorizedEvent,
      args: { agent: account },
      fromBlock: fromBlock > latest ? latest : fromBlock,
      toBlock: latest,
    });
  } catch (error) {
    if (isRpcRateLimit(error)) return [];
    throw error;
  }
  const candidates = [...new Set(logs.map((log) => log.address.toLowerCase()))];
  const vaults: Address[] = [];
  for (const candidate of candidates) {
    const vault = candidate as Address;
    const [registered, agent] = await Promise.all([
      publicClient.readContract({
        address: appConfig.factory,
        abi: factoryAbi,
        functionName: "isVault",
        args: [vault],
      }),
      publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "agent" }),
    ]);
    if (registered && agent.toLowerCase() === account.toLowerCase()) {
      rememberVault(account, vault);
      vaults.push(vault);
    }
  }
  return vaults;
}

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
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      if (!appConfig.factory || !address || !publicClient) return [];
      const owned = await listVaults(publicClient, appConfig.factory, address);
      for (const vault of owned) rememberVault(address, vault);
      const discovered = owned.length === 0 ? await recentAgentVaults(publicClient, address) : [];
      const remembered = readKnownVaults(address).filter(
        (vault) => !owned.some((item) => item.toLowerCase() === vault.toLowerCase()) && !discovered.some((item) => item.toLowerCase() === vault.toLowerCase()),
      );
      const extras: Address[] = [];
      for (const vault of remembered) {
        const [registered, agent, owner] = await Promise.all([
          publicClient.readContract({
            address: appConfig.factory,
            abi: factoryAbi,
            functionName: "isVault",
            args: [vault],
          }),
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "agent" }),
          publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "owner" }),
        ]);
        const mine = agent.toLowerCase() === address.toLowerCase() || owner.toLowerCase() === address.toLowerCase();
        if (registered && mine) extras.push(vault);
      }
      return mergeVaults(owned, discovered, extras);
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
  const { address } = useAccount();
  const owned = useOwnedVaults();
  const selected = useSelectedVaultAddress();
  const vault = selected ?? owned.data?.[0];
  const state = useVaultState(vault);
  const verified = useIsFactoryVault(vault);
  const snapshot = state.data;

  useEffect(() => {
    if (!address || !vault || !snapshot) return;
    const mine =
      snapshot.owner.toLowerCase() === address.toLowerCase() ||
      (snapshot.agent !== zeroAddress && snapshot.agent.toLowerCase() === address.toLowerCase());
    if (mine) rememberVault(address, vault);
  }, [address, snapshot, vault]);

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
