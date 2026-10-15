import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC, chainById } from "@arcbond/sdk";

import { purchaseService } from "../services/payments/src/flow";
import type { RecordKey } from "../services/payments/src/records";

const key = process.env.AGENT_PRIVATE_KEY;
const vault = process.env.VAULT_ADDRESS;
const baseUrl = process.env.PAY_API_URL ?? "http://127.0.0.1:8787";
const rpcUrl = process.env.PAY_RPC_URL ?? ARC_TESTNET_RPC;
const chainId = Number(process.env.PAY_CHAIN_ID ?? ARC_TESTNET_CHAIN_ID);
const record = (process.env.RECORD ?? "testnet") as RecordKey;

if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("Set AGENT_PRIVATE_KEY in the shell. This script does not read .env and does not accept the owner key.");
  process.exit(1);
}
if (!vault || !/^0x[0-9a-fA-F]{40}$/.test(vault)) {
  console.error("Set VAULT_ADDRESS to the vault that authorized this agent.");
  process.exit(1);
}
if (record !== "testnet" && record !== "mainnet") {
  console.error("RECORD must be testnet or mainnet.");
  process.exit(1);
}

async function main() {
  const chain = chainById(chainId);
  const publicClient = createPublicClient({
    chain: { ...chain, rpcUrls: { default: { http: [rpcUrl] } } },
    transport: http(rpcUrl),
  });
  const agent = privateKeyToAccount(key as `0x${string}`);
  const delivery = await purchaseService({
    baseUrl,
    publicClient,
    chainId,
    vault: vault as `0x${string}`,
    record,
    signer: agent,
  });
  console.log(
    JSON.stringify(
      {
        quoteId: delivery.quoteId,
        transactionHash: delivery.payment.transactionHash,
        amount: delivery.payment.amount,
        record: delivery.record,
        checksum: delivery.checksum,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
