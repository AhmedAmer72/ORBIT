import { createPublicClient, http, isAddress, zeroAddress, type Address } from "viem";

import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC,
  chainById,
  createArcBondClient,
  formatUsdc,
  parseUsdc,
  paymentIdFromLabel,
} from "../packages/sdk/src/index";

// Read-only. This script does not load .env and does not send a transaction.
async function main() {
  const vaultArg = process.argv[2] ?? process.env.VAULT_ADDRESS ?? "";
  if (!isAddress(vaultArg) || vaultArg === zeroAddress) {
    console.error("Usage: npx tsx scripts/sdk-preflight.ts <vault-address>");
    console.error("Reads the vault and simulates one payment. It does not broadcast.");
    process.exit(1);
  }
  const vault = vaultArg as Address;
  const chain = chainById(ARC_TESTNET_CHAIN_ID);
  const publicClient = createPublicClient({ chain, transport: http(ARC_TESTNET_RPC) });
  const client = createArcBondClient({ chainId: chain.id, publicClient });
  const state = await client.readVault(vault);
  const caller = state.agent === zeroAddress ? "0x00000000000000000000000000000000000000b2" : state.agent;
  const report = await client.preflight({
    vault,
    caller,
    recipient: state.owner,
    amount: parseUsdc("0.01"),
    paymentId: paymentIdFromLabel(`preflight-readonly-${Date.now()}`),
  });
  console.log(
    JSON.stringify(
      {
        chainId: chain.id,
        vault,
        owner: state.owner,
        agent: state.agent,
        paused: state.paused,
        expiresAt: state.expiresAt.toString(),
        maxPerPayment: formatUsdc(state.maxPerPayment),
        periodLimit: formatUsdc(state.periodLimit),
        displayedSpent: formatUsdc(state.displayedSpent),
        balance: formatUsdc(state.balance),
        simulatedCaller: caller,
        report,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
