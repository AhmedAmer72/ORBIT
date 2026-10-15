import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeFunctionData,
} from "viem";

import { erc20Abi, factoryAbi, vaultAbi } from "./abi";
import { USDC_ADDRESS } from "./constants";
import { decodeVaultError, revertDataFromError } from "./errors";
import { floorMaxFeePerGas } from "./fees";

export type ArcBondClients = {
  publicClient: PublicClient;
  walletClient?: WalletClient;
}

export async function readVault(publicClient: PublicClient, vault: Address) {
  const [
    owner,
    pendingOwner,
    agent,
    expiresAt,
    maxPerPayment,
    periodLimit,
    spentInPeriod,
    displayedSpent,
    periodId,
    paused,
    balance,
  ] = await Promise.all([
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "owner" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "pendingOwner" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "agent" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "expiresAt" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "maxPerPayment" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "periodLimit" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "spentInPeriod" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "displayedSpentInPeriod" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "periodId" }),
    publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "paused" }),
    publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [vault] }),
  ]);

  return {
    owner,
    pendingOwner,
    agent,
    expiresAt,
    maxPerPayment,
    periodLimit,
    spentInPeriod,
    displayedSpent,
    periodId,
    paused,
    balance,
  };
}

export async function listVaults(publicClient: PublicClient, factory: Address, owner: Address) {
  return publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "vaultsOf",
    args: [owner],
  });
}

export async function simulateVaultCall(args: {
  publicClient: PublicClient;
  account: Address;
  vault: Address;
  data: Hex;
}): Promise<{ ok: true } | { ok: false; errorName?: string; message: string }> {
  try {
    await args.publicClient.call({
      account: args.account,
      to: args.vault,
      data: args.data,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/0x[0-9a-fA-F]+/);
    return {
      ok: false,
      errorName: decodeVaultError(revertDataFromError(error) ?? (match ? (match[0] as Hex) : undefined)),
      message,
    };
  }
}

export function encodeExecutePayment(recipient: Address, amount: bigint, paymentId: Hex): Hex {
  return encodeFunctionData({
    abi: vaultAbi,
    functionName: "executePayment",
    args: [recipient, amount, paymentId],
  });
}

export function encodeDeposit(amount: bigint): Hex {
  return encodeFunctionData({
    abi: vaultAbi,
    functionName: "deposit",
    args: [amount],
  });
}

export async function submitContractWrite(args: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
  address: Address;
  data: Hex;
}): Promise<Hex> {
  const fees = await args.publicClient.estimateFeesPerGas();
  const maxFeePerGas = floorMaxFeePerGas(fees.maxFeePerGas ?? 0n);
  const hash = await args.walletClient.sendTransaction({
    // A local account must be passed through so viem signs and uses eth_sendRawTransaction.
    // Public Arc RPCs do not implement eth_sendTransaction. Browser wallets still sign when
    // the wallet client carries the connected account.
    account: args.walletClient.account ?? args.account,
    to: args.address,
    data: args.data,
    chain: args.walletClient.chain,
    maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 1_000_000_000n,
  });
  return hash;
}
