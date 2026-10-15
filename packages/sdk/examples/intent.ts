import { createPublicClient, http, type Address } from "viem";

import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC,
  chainById,
  createArcBondClient,
  paymentIdFromLabel,
  type IntentSigner,
} from "../src/index";

/**
 * Compiling example for an intent-bound payment.
 * Pass the agent's signer. Do not pass the owner key, and do not paste a seed phrase.
 * This function reads the vault, signs locally, and returns. It does not submit a transaction.
 * Existing Arc Testnet vaults from the current factory do not implement executePaymentIntent.
 */
export async function exampleSignedIntent(vault: Address, agent: IntentSigner) {
  const chain = chainById(ARC_TESTNET_CHAIN_ID);
  const publicClient = createPublicClient({ chain, transport: http(ARC_TESTNET_RPC) });
  const arcBond = createArcBondClient({
    chainId: ARC_TESTNET_CHAIN_ID,
    publicClient,
  });

  const intent = await arcBond.createPaymentIntent({
    vault,
    recipient: "0x3333333333333333333333333333333333333333",
    amount: "0.50",
    paymentId: paymentIdFromLabel("invoice-1"),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
  });

  return arcBond.signPaymentIntent(intent, agent);
}
