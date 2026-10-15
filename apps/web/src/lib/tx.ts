import type { Address, Hash, Hex, Log, PublicClient, WalletClient } from "viem";

import { describeWriteFailure, floorMaxFeePerGas, simulateVaultCall } from "@arcbond/sdk";

export type TxState =
  | { kind: "idle" }
  | { kind: "simulating" }
  | { kind: "rejected"; message: string }
  | { kind: "pending" }
  | { kind: "confirming"; hash: Hash }
  | { kind: "success"; hash: Hash; logs: Log[] }
  | { kind: "reverted"; hash: Hash }
  | { kind: "error"; message: string }
  | { kind: "unsent"; message: string };

export async function submitPreparedWrite(args: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
  address: Address;
  data: Hex;
}): Promise<TxState> {
  const preview = await simulateVaultCall({
    publicClient: args.publicClient,
    account: args.account,
    vault: args.address,
    data: args.data,
  });
  if (!preview.ok) {
    return { kind: "rejected", message: preview.errorName ?? "Simulation rejected the call." };
  }

  try {
    const fees = await args.publicClient.estimateFeesPerGas();
    const hash = await args.walletClient.sendTransaction({
      account: args.account,
      to: args.address,
      data: args.data,
      chain: args.walletClient.chain,
      maxFeePerGas: floorMaxFeePerGas(fees.maxFeePerGas ?? 0n),
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 1_000_000_000n,
    });
    const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return { kind: "reverted", hash };
    }
    return { kind: "success", hash, logs: receipt.logs };
  } catch (error) {
    const described = describeWriteFailure(error);
    if (/dropped|underpriced|not found/i.test(described.message)) {
      return { kind: "unsent", message: described.message };
    }
    return described.kind === "rejection"
      ? { kind: "rejected", message: described.message }
      : { kind: "error", message: described.message };
  }
}
