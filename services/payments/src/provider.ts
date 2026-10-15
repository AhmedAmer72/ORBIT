import { factoryAbi, formatUsdc, paymentIdFromLabel, readFactoryVersion, USDC_ADDRESS } from "@arcbond/sdk";
import { getAddress, isAddress, type Address, type PublicClient } from "viem";

import type { PayConfig } from "./config";
import { PayError } from "./config";
import type { PaymentsDb, QuoteRow } from "./db";
import { isRecordKey, networkRecord, recordChecksum, type RecordKey } from "./records";
import { findSettlement } from "./verify";

export type QuoteResponse = {
  quoteId: string;
  service: "arc-network-record";
  record: RecordKey;
  chainId: number;
  vault: Address;
  recipient: Address;
  token: Address;
  amount: string;
  amountDisplay: string;
  paymentId: `0x${string}`;
  expiresAt: number;
  note: string;
};

export function quoteResponse(row: QuoteRow): QuoteResponse {
  return {
    quoteId: row.id,
    service: "arc-network-record",
    record: row.record_key as RecordKey,
    chainId: row.chain_id,
    vault: getAddress(row.vault),
    recipient: getAddress(row.recipient),
    token: getAddress(row.token),
    amount: row.amount,
    amountDisplay: formatUsdc(BigInt(row.amount)),
    paymentId: row.payment_id as `0x${string}`,
    expiresAt: row.expires_at,
    note: "Sign nonce and policyVersion from the vault. This quote does not prove a payment.",
  };
}

export async function createQuote(
  db: PaymentsDb,
  config: PayConfig,
  publicClient: PublicClient,
  input: { vault?: unknown; record?: unknown },
): Promise<QuoteResponse> {
  if (!isRecordKey(input.record)) {
    throw new PayError(400, "invalid_request", "record must be testnet or mainnet.");
  }
  if (typeof input.vault !== "string" || !isAddress(input.vault)) {
    throw new PayError(400, "invalid_request", "vault must be an address.");
  }
  const vault = getAddress(input.vault);
  if (config.factory) {
    const deployment = await readFactoryVersion(publicClient, config.factory);
    if (!deployment.supportsPaymentIntents) {
      throw new PayError(
        409,
        "intents_unavailable",
        "This factory does not implement payment intents. The Arc Testnet factory 0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d is version 1. A version 2 factory deployment is required before this service can be paid.",
      );
    }
    const registered = await publicClient.readContract({
      address: config.factory,
      abi: factoryAbi,
      functionName: "isVault",
      args: [vault],
    });
    if (!registered) {
      throw new PayError(400, "unknown_vault", "That address is not a vault from the configured factory.");
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const quoteId = crypto.randomUUID();
  const row: QuoteRow = {
    id: quoteId,
    record_key: input.record,
    vault,
    recipient: config.recipient,
    token: USDC_ADDRESS,
    amount: config.price.toString(),
    payment_id: paymentIdFromLabel(`arcbond.quote.${quoteId}`),
    expires_at: now + config.quoteTtlSeconds,
    chain_id: config.chainId,
    created_at: now,
  };
  db.insertQuote(row);
  return quoteResponse(row);
}

export async function deliverQuote(
  db: PaymentsDb,
  config: PayConfig,
  publicClient: PublicClient,
  quoteId: string,
): Promise<{
  delivered: true;
  service: "arc-network-record";
  quoteId: string;
  payment: {
    transactionHash: `0x${string}`;
    vault: Address;
    recipient: Address;
    amount: string;
    paymentId: `0x${string}`;
  };
  record: ReturnType<typeof networkRecord>;
  checksum: `0x${string}`;
}> {
  const quote = db.getQuote(quoteId);
  if (!quote) throw new PayError(404, "quote_not_found", "No quote exists with that id.");
  if (!isRecordKey(quote.record_key)) throw new PayError(500, "invalid_quote", "The stored record key is not valid.");

  const settlement = await findSettlement(publicClient, quote, config.startBlock);
  if (!settlement) {
    throw new PayError(
      402,
      "payment_required",
      "The vault has not settled this quote. A signature, a relay acceptance, or a transaction hash is not enough.",
    );
  }

  const record = networkRecord(quote.record_key);
  const payload = {
    delivered: true as const,
    service: "arc-network-record" as const,
    quoteId: quote.id,
    payment: {
      transactionHash: settlement.transactionHash,
      vault: settlement.vault,
      recipient: settlement.recipient,
      amount: settlement.amount.toString(),
      paymentId: settlement.paymentId,
    },
    record,
    checksum: recordChecksum(record),
  };
  db.saveDelivery({
    quote_id: quote.id,
    tx_hash: settlement.transactionHash,
    payload_json: JSON.stringify(payload),
    delivered_at: Math.floor(Date.now() / 1000),
  });
  return payload;
}
