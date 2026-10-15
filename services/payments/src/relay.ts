import {
  ArcBondError,
  createArcBondClient,
  hashPaymentIntent,
  intentAlreadyConsumed,
  paymentIntentTypedData,
  type PaymentIntent,
  type SignedPaymentIntent,
} from "@arcbond/sdk";
import {
  getAddress,
  isAddress,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";

import type { PayConfig } from "./config";
import { PayError } from "./config";
import type { PaymentsDb, RelayRow, RelayStatus } from "./db";
import { findSettlement } from "./verify";

export type RelayResponse = {
  digest: Hex;
  quoteId: string;
  status: RelayStatus;
  transactionHash: Hex | null;
  message: string | null;
  paymentSettled: boolean;
};

export function relayResponse(row: RelayRow): RelayResponse {
  return {
    digest: row.digest as Hex,
    quoteId: row.quote_id,
    status: row.status,
    transactionHash: (row.tx_hash as Hex | null) ?? null,
    message: row.error_message,
    paymentSettled: row.status === "confirmed",
  };
}

function asAddress(value: unknown, field: string): Address {
  if (typeof value !== "string" || !isAddress(value)) {
    throw new PayError(400, "invalid_request", `${field} must be an address.`);
  }
  return getAddress(value);
}

function asUint(value: unknown, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  throw new PayError(400, "invalid_request", `${field} must be a non-negative integer string.`);
}

function asBytes32(value: unknown, field: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new PayError(400, "invalid_request", `${field} must be a 32-byte hex value.`);
  }
  return value as Hex;
}

function asSignature(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(value)) {
    throw new PayError(400, "invalid_request", "signature must be a 65-byte hex ECDSA signature.");
  }
  return value as Hex;
}

export function parseSignedIntent(body: unknown): { signed: SignedPaymentIntent; quoteId: string; retry: boolean } {
  if (!body || typeof body !== "object") throw new PayError(400, "invalid_request", "A JSON body is required.");
  const record = body as Record<string, unknown>;
  const intentRaw = record.intent;
  if (!intentRaw || typeof intentRaw !== "object") throw new PayError(400, "invalid_request", "intent is required.");
  const intentBody = intentRaw as Record<string, unknown>;
  if (record.chainId !== undefined && typeof record.chainId !== "number") {
    throw new PayError(400, "invalid_request", "chainId must be a number.");
  }
  const chainId = typeof record.chainId === "number" ? record.chainId : Number(intentBody.chainId);
  if (!Number.isInteger(chainId)) throw new PayError(400, "invalid_request", "chainId is required.");
  const intent: PaymentIntent = {
    vault: asAddress(intentBody.vault, "vault"),
    agent: asAddress(intentBody.agent, "agent"),
    recipient: asAddress(intentBody.recipient, "recipient"),
    token: asAddress(intentBody.token, "token"),
    amount: asUint(intentBody.amount, "amount"),
    paymentId: asBytes32(intentBody.paymentId, "paymentId"),
    nonce: asUint(intentBody.nonce, "nonce"),
    deadline: asUint(intentBody.deadline, "deadline"),
    policyVersion: asUint(intentBody.policyVersion, "policyVersion"),
  };
  const signature = asSignature(record.signature);
  const digest = asBytes32(record.digest, "digest");
  if (typeof record.quoteId !== "string" || record.quoteId.length < 8) {
    throw new PayError(400, "invalid_request", "quoteId is required.");
  }
  return {
    signed: { intent, signature, digest, chainId, status: "signed" },
    quoteId: record.quoteId,
    retry: record.retry === true,
  };
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function assertIntentMatchesQuote(
  quote: {
    vault: string;
    recipient: string;
    token: string;
    amount: string;
    payment_id: string;
    expires_at: number;
    chain_id: number;
  },
  intent: PaymentIntent,
  chainId: number,
  nowSeconds: number,
): void {
  if (chainId !== quote.chain_id) throw new PayError(400, "wrong_chain", "The intent chain does not match the quote.");
  if (!sameAddress(intent.vault, quote.vault)) throw new PayError(400, "quote_mismatch", "The intent vault does not match the quote.");
  if (!sameAddress(intent.recipient, quote.recipient)) {
    throw new PayError(400, "quote_mismatch", "The intent recipient does not match the provider quote.");
  }
  if (!sameAddress(intent.token, quote.token)) throw new PayError(400, "quote_mismatch", "The intent token does not match the quote.");
  if (intent.amount !== BigInt(quote.amount)) throw new PayError(400, "quote_mismatch", "The intent amount does not match the quote.");
  if (intent.paymentId.toLowerCase() !== quote.payment_id.toLowerCase()) {
    throw new PayError(400, "quote_mismatch", "The intent payment id does not match the quote.");
  }
  if (quote.expires_at <= nowSeconds) throw new PayError(400, "quote_expired", "The quote has expired. Request a new one.");
  if (intent.deadline > BigInt(quote.expires_at)) {
    throw new PayError(400, "deadline_too_long", "The intent deadline is later than the quote expiry.");
  }
  if (intent.deadline <= BigInt(nowSeconds)) throw new PayError(400, "intent_expired", "The intent deadline has passed.");
}

async function reconcile(
  db: PaymentsDb,
  config: PayConfig,
  publicClient: PublicClient,
  row: RelayRow,
): Promise<RelayRow> {
  if (row.status === "confirmed" || row.status === "simulation_reverted" || row.status === "failed" || row.status === "reverted") {
    return row;
  }
  const quote = db.getQuote(row.quote_id);
  if (quote) {
    const settlement = await findSettlement(publicClient, quote, config.startBlock);
    if (settlement) return db.updateRelay(row.digest, { status: "confirmed", tx_hash: settlement.transactionHash, error_code: null, error_message: null });
  }
  if (row.tx_hash) {
    const receipt = await publicClient.getTransactionReceipt({ hash: row.tx_hash as Hex }).catch(() => undefined);
    if (!receipt) return row;
    if (receipt.status === "reverted") {
      return db.updateRelay(row.digest, {
        status: "reverted",
        error_code: "reverted",
        error_message: "The transaction was mined and reverted. The intent nonce and payment id were not consumed.",
      });
    }
  }
  return row;
}

export async function submitIntent(args: {
  db: PaymentsDb;
  config: PayConfig;
  publicClient: PublicClient;
  walletClient: WalletClient;
  relayer: Address;
  body: unknown;
}): Promise<RelayResponse> {
  const parsed = parseSignedIntent(args.body);
  if (parsed.signed.chainId !== args.config.chainId) {
    throw new PayError(400, "wrong_chain", `This relay submits chain ${args.config.chainId}.`);
  }
  const digest = hashPaymentIntent(parsed.signed.intent, parsed.signed.chainId);
  if (digest.toLowerCase() !== parsed.signed.digest.toLowerCase()) {
    throw new PayError(400, "digest_mismatch", "The digest does not match the intent. Sign the unchanged intent.");
  }
  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      ...paymentIntentTypedData(parsed.signed.intent, parsed.signed.chainId),
      signature: parsed.signed.signature,
    });
  } catch {
    throw new PayError(400, "invalid_signature", "The signature could not be recovered.");
  }
  if (!sameAddress(recovered, parsed.signed.intent.agent)) {
    throw new PayError(400, "invalid_signature", "The signer is not the agent named in the intent.");
  }

  const quote = args.db.getQuote(parsed.quoteId);
  if (!quote) throw new PayError(404, "quote_not_found", "No quote exists with that id.");
  const now = Math.floor(Date.now() / 1000);
  assertIntentMatchesQuote(quote, parsed.signed.intent, parsed.signed.chainId, now);

  const existing = args.db.getRelay(digest);
  if (existing && !parsed.retry) {
    return relayResponse(await reconcile(args.db, args.config, args.publicClient, existing));
  }
  if (existing?.status === "confirmed") return relayResponse(existing);
  if (
    existing &&
    existing.status !== "simulation_reverted" &&
    existing.status !== "failed" &&
    existing.status !== "reverted"
  ) {
    return relayResponse(await reconcile(args.db, args.config, args.publicClient, existing));
  }

  const nowRow = Math.floor(Date.now() / 1000);
  const claimed = existing
    ? { row: existing, owner: true }
    : args.db.claimRelay({
        digest,
        quote_id: parsed.quoteId,
        intent_json: JSON.stringify(parsed.signed.intent, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
        signature: parsed.signed.signature,
        chain_id: parsed.signed.chainId,
        status: "received",
        tx_hash: null,
        error_code: null,
        error_message: null,
        created_at: nowRow,
        updated_at: nowRow,
      });
  if (!claimed.owner && !parsed.retry) {
    return relayResponse(await reconcile(args.db, args.config, args.publicClient, claimed.row));
  }

  const consumed = await intentAlreadyConsumed(args.publicClient, parsed.signed.intent).catch(() => undefined);
  if (consumed?.paymentIdUsed || consumed?.nonceConsumed) {
    const settlement = await findSettlement(args.publicClient, quote, args.config.startBlock);
    if (settlement) {
      return relayResponse(
        args.db.updateRelay(digest, { status: "confirmed", tx_hash: settlement.transactionHash, error_code: null, error_message: null }),
      );
    }
    return relayResponse(
      args.db.updateRelay(digest, {
        status: "failed",
        error_code: "already_consumed",
        error_message: "The nonce or payment id is already consumed, and no matching settlement log was found.",
      }),
    );
  }

  const arcBond = createArcBondClient({
    chainId: args.config.chainId,
    publicClient: args.publicClient,
    walletClient: args.walletClient,
    account: args.relayer,
  });

  let preview;
  try {
    preview = await arcBond.preflightIntent({ ...parsed.signed, caller: args.relayer });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return relayResponse(
      args.db.updateRelay(digest, { status: "failed", error_code: "unavailable", error_message: message }),
    );
  }
  if (preview.status !== "passed") {
    return relayResponse(
      args.db.updateRelay(digest, {
        status: "simulation_reverted",
        error_code: preview.errorName ?? "simulation_reverted",
        error_message: preview.message,
      }),
    );
  }
  args.db.updateRelay(digest, { status: "simulated", error_code: null, error_message: null });

  try {
    args.db.updateRelay(digest, { status: "submitting" });
    const result = await arcBond.executeIntent(parsed.signed);
    if (result.status === "confirmed") {
      const settlement = await findSettlement(args.publicClient, quote, args.config.startBlock);
      if (!settlement) {
        return relayResponse(
          args.db.updateRelay(digest, {
            status: "failed",
            tx_hash: result.hash,
            error_code: "settlement_missing",
            error_message: "The receipt succeeded, but the vault log did not match this quote.",
          }),
        );
      }
      console.log(`relay confirmed digest=${digest} tx=${settlement.transactionHash}`);
      return relayResponse(
        args.db.updateRelay(digest, {
          status: "confirmed",
          tx_hash: settlement.transactionHash,
          error_code: null,
          error_message: null,
        }),
      );
    }
    const status: RelayStatus = result.status === "reverted" ? "reverted" : "failed";
    const txHash = result.status === "reverted" ? result.hash : null;
    const message = "message" in result ? result.message : "The relay could not confirm the payment.";
    return relayResponse(
      args.db.updateRelay(digest, {
        status,
        tx_hash: txHash,
        error_code: result.status,
        error_message: message ?? "The relay could not confirm the payment.",
      }),
    );
  } catch (error) {
    const message = error instanceof ArcBondError ? error.message : error instanceof Error ? error.message : String(error);
    const code = error instanceof ArcBondError ? error.code : "failed";
    const status: RelayStatus = code === "simulation_reverted" ? "simulation_reverted" : "failed";
    return relayResponse(args.db.updateRelay(digest, { status, error_code: code, error_message: message }));
  }
}

export async function readIntent(args: {
  db: PaymentsDb;
  config: PayConfig;
  publicClient: PublicClient;
  digest: string;
}): Promise<RelayResponse> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(args.digest)) throw new PayError(400, "invalid_request", "digest must be 32 bytes.");
  const row = args.db.getRelay(args.digest);
  if (!row) throw new PayError(404, "intent_not_found", "The relay has no request for that digest.");
  return relayResponse(await reconcile(args.db, args.config, args.publicClient, row));
}
