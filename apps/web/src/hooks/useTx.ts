"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { useOnConfiguredChain } from "@/components/NetworkGate";
import { submitPreparedWrite, type TxState } from "@/lib/tx";
import { configuredChain } from "@/lib/wagmi";

const vaultQueryRoots = new Set(["vaults", "vault", "isVault", "recipient", "activity"]);

export function useInvalidateVaultQueries() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) => vaultQueryRoots.has(String(query.queryKey[0])),
    });
}

export function useTxWriter() {
  const { address } = useAccount();
  const onChain = useOnConfiguredChain();
  const publicClient = usePublicClient({ chainId: configuredChain.id });
  const { data: walletClient } = useWalletClient();
  const invalidate = useInvalidateVaultQueries();
  const [state, setState] = useState<TxState>({ kind: "idle" });

  const writeDisabledReason = !address
    ? "Connect a wallet."
    : !onChain
      ? `Switch to ${configuredChain.name}.`
      : !publicClient || !walletClient
        ? "Wallet client is not ready."
        : undefined;

  async function send(addressTo: Address, data: Hex): Promise<TxState> {
    if (!address || !publicClient || !walletClient || !onChain) {
      const blocked: TxState = { kind: "error", message: writeDisabledReason ?? "Write blocked." };
      setState(blocked);
      return blocked;
    }
    setState({ kind: "simulating" });
    const next = await submitPreparedWrite({
      publicClient,
      walletClient,
      account: address,
      address: addressTo,
      data,
    });
    setState(next);
    if (next.kind === "success") await invalidate();
    return next;
  }

  return { state, send, writeDisabledReason, address, onChain };
}
