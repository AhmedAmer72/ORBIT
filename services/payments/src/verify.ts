import { USDC_ADDRESS, vaultAbi } from "@arcbond/sdk";
import { getAddress, parseAbiItem, type Address, type Hex, type PublicClient } from "viem";

const paymentExecutedEvent = parseAbiItem(
  "event PaymentExecuted(address indexed agent, address indexed recipient, uint256 amount, bytes32 indexed paymentId, uint64 periodId, uint256 spentInPeriod)",
);

import type { QuoteRow } from "./db";

export type Settlement = {
  transactionHash: Hex;
  vault: Address;
  recipient: Address;
  amount: bigint;
  paymentId: Hex;
};

/**
 * Reads the vault's own PaymentExecuted log and usedPaymentIds flag.
 * A signature, a relay status, or a caller-supplied transaction hash is not accepted.
 */
export async function findSettlement(
  publicClient: PublicClient,
  quote: QuoteRow,
  fromBlock: bigint,
): Promise<Settlement | null> {
  const vault = getAddress(quote.vault);
  const paymentId = quote.payment_id as Hex;
  const logs = await publicClient.getLogs({
    address: vault,
    event: paymentExecutedEvent,
    args: { paymentId },
    fromBlock,
    toBlock: "latest",
  });

  const expectedRecipient = quote.recipient.toLowerCase();
  const expectedAmount = BigInt(quote.amount);
  const match = logs.find((log) => {
    const recipient = log.args.recipient?.toLowerCase();
    return recipient === expectedRecipient && log.args.amount === expectedAmount;
  });
  if (!match) return null;

  const used = await publicClient.readContract({
    address: vault,
    abi: vaultAbi,
    functionName: "usedPaymentIds",
    args: [paymentId],
  });
  if (!used) return null;

  const receipt = await publicClient.getTransactionReceipt({ hash: match.transactionHash });
  if (receipt.status !== "success") return null;
  if (quote.token.toLowerCase() !== USDC_ADDRESS.toLowerCase()) return null;

  return {
    transactionHash: match.transactionHash,
    vault,
    recipient: getAddress(quote.recipient),
    amount: expectedAmount,
    paymentId,
  };
}
