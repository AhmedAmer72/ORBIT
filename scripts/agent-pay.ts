// This script does not load .env. Export VAULT_ADDRESS, RECIPIENT, AMOUNT, PAYMENT_ID, and AGENT_PRIVATE_KEY in the shell.
import { createPublicClient, createWalletClient, http, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER,
  ARC_TESTNET_RPC,
  chainById,
  encodeExecutePayment,
  explorerTxUrl,
  formatUsdc,
  paymentIdFromLabel,
  simulateVaultCall,
  submitContractWrite,
} from "../packages/sdk/src/index";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to an untracked .env and set local keys only.`);
  }
  return value;
}

async function main() {
  const chainId = Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? process.env.ARC_CHAIN_ID ?? ARC_TESTNET_CHAIN_ID);
  const rpc = process.env.ARC_RPC_URL ?? process.env.NEXT_PUBLIC_ARC_RPC_URL ?? ARC_TESTNET_RPC;
  const explorer = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? ARC_TESTNET_EXPLORER;
  const vault = required("VAULT_ADDRESS") as Address;
  const recipient = required("RECIPIENT") as Address;
  const amountRaw = required("AMOUNT");
  const paymentLabel = required("PAYMENT_ID");
  const key = required("AGENT_PRIVATE_KEY") as Hex;

  if (!isAddress(vault) || !isAddress(recipient)) {
    throw new Error("VAULT_ADDRESS and RECIPIENT must be addresses.");
  }

  const { parseUsdc } = await import("../packages/sdk/src/format");
  const amount = parseUsdc(amountRaw);
  const paymentId = paymentIdFromLabel(paymentLabel);
  const account = privateKeyToAccount(key);
  const chain = chainById(chainId);
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpc) });

  const data = encodeExecutePayment(recipient, amount, paymentId);
  const preview = await simulateVaultCall({
    publicClient,
    account: account.address,
    vault,
    data,
  });

  if (!preview.ok) {
    console.error("Rejected before send:", preview.errorName ?? preview.message);
    process.exit(2);
  }

  const hash = await submitContractWrite({
    publicClient,
    walletClient,
    account: account.address,
    address: vault,
    data,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    console.error("Transaction reverted:", hash);
    console.error(explorerTxUrl(explorer, hash));
    process.exit(3);
  }

  console.log("Paid", formatUsdc(amount), "USDC");
  console.log("tx", hash);
  console.log(explorerTxUrl(explorer, hash));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
