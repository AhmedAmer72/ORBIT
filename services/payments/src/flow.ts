import { createPaymentIntent, signPaymentIntent, type IntentSigner } from "@arcbond/sdk";
import type { Address, Hex, PublicClient } from "viem";

import type { QuoteResponse } from "./provider";
import type { RelayResponse } from "./relay";
import type { RecordKey } from "./records";

export type Delivery = {
  delivered: true;
  service: "arc-network-record";
  quoteId: string;
  payment: {
    transactionHash: Hex;
    vault: Address;
    recipient: Address;
    amount: string;
    paymentId: Hex;
  };
  record: {
    name: string;
    chainId: number;
    rpcUrl: string;
    explorerUrl: string;
    usdc: Address;
    usdcDecimals: number;
    nativeGasDecimals: number;
  };
  checksum: Hex;
};

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T;
  return { status: response.status, body: payload };
}

export async function requestQuote(baseUrl: string, vault: Address, record: RecordKey): Promise<QuoteResponse> {
  const result = await postJson<QuoteResponse & { error?: string; message?: string }>(`${baseUrl}/provider/quotes`, { vault, record });
  if (result.status !== 201) {
    throw new Error(result.body.message ?? "The provider refused the quote.");
  }
  return result.body;
}

export async function submitSignedIntent(baseUrl: string, body: unknown): Promise<RelayResponse> {
  const result = await postJson<RelayResponse & { error?: string; message?: string }>(`${baseUrl}/relay/intents`, body);
  if (result.status !== 200) {
    throw new Error(result.body.message ?? "The relay rejected the intent.");
  }
  return result.body;
}

export async function requestDelivery(baseUrl: string, quoteId: string): Promise<{ status: number; body: Delivery & { error?: string; message?: string } }> {
  return postJson(`${baseUrl}/provider/deliveries`, { quoteId });
}

/**
 * Quotes a record, signs the current vault intent, submits it through the relay,
 * and asks the provider to deliver. Delivery is attempted only after the relay reports confirmation.
 * The provider still re-reads the chain.
 */
export async function purchaseService(args: {
  baseUrl: string;
  publicClient: PublicClient;
  chainId: number;
  vault: Address;
  record: RecordKey;
  signer: IntentSigner;
}): Promise<Delivery> {
  const quote = await requestQuote(args.baseUrl, args.vault, args.record);
  const intent = await createPaymentIntent(args.publicClient, {
    vault: quote.vault,
    recipient: quote.recipient,
    amount: BigInt(quote.amount),
    paymentId: quote.paymentId,
    deadline: BigInt(quote.expiresAt),
  });
  if (intent.vault.toLowerCase() !== quote.vault.toLowerCase()) throw new Error("The vault changed while the quote was being signed.");
  if (intent.amount !== BigInt(quote.amount) || intent.paymentId.toLowerCase() !== quote.paymentId.toLowerCase()) {
    throw new Error("The quoted payment does not match the intent that would be signed.");
  }
  const signed = await signPaymentIntent({ intent, chainId: args.chainId, signer: args.signer });
  const relay = await submitSignedIntent(args.baseUrl, {
    quoteId: quote.quoteId,
    chainId: args.chainId,
    digest: signed.digest,
    signature: signed.signature,
    intent: {
      ...intent,
      amount: intent.amount.toString(),
      nonce: intent.nonce.toString(),
      deadline: intent.deadline.toString(),
      policyVersion: intent.policyVersion.toString(),
    },
  });
  if (!relay.paymentSettled || relay.status !== "confirmed" || !relay.transactionHash) {
    throw new Error(relay.message ?? `The relay did not settle the payment (${relay.status}). The service was not requested.`);
  }
  const delivery = await requestDelivery(args.baseUrl, quote.quoteId);
  if (delivery.status !== 200 || !delivery.body.delivered) {
    throw new Error(delivery.body.message ?? "The provider did not deliver the record.");
  }
  if (delivery.body.payment.transactionHash.toLowerCase() !== relay.transactionHash.toLowerCase()) {
    throw new Error("The provider's transaction does not match the relay receipt.");
  }
  return delivery.body;
}
