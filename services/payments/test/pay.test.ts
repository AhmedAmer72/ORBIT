import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPaymentIntent, erc20Abi, signPaymentIntent, USDC_ADDRESS, vaultAbi } from "@arcbond/sdk";

import { purchaseService, requestDelivery, requestQuote, submitSignedIntent } from "../src/flow";
import { startLocalPayments, type LocalPayments } from "../src/local-chain";

let ctx: LocalPayments;

beforeAll(async () => {
  ctx = await startLocalPayments();
}, 180_000);

afterAll(async () => {
  await ctx?.stop();
});

async function balanceOf(account: `0x${string}`) {
  return ctx.publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
}

describe("pay-per-api through the intent relay", () => {
  it("delivers the record only after the vault settles the quoted payment", async () => {
    const beforeVault = await balanceOf(ctx.vault);
    const beforeProvider = await balanceOf(ctx.provider.address);
    const relayerNonce = await ctx.publicClient.getTransactionCount({ address: ctx.relayer.address });

    const delivery = await purchaseService({
      baseUrl: ctx.baseUrl,
      publicClient: ctx.publicClient,
      chainId: 5042002,
      vault: ctx.vault,
      record: "testnet",
      signer: ctx.agent,
    });

    expect(delivery.delivered).toBe(true);
    expect(delivery.record.chainId).toBe(5042002);
    expect(delivery.record.name).toBe("Arc Testnet");
    expect(delivery.payment.amount).toBe("500000");
    expect(delivery.payment.recipient.toLowerCase()).toBe(ctx.provider.address.toLowerCase());

    const receipt = await ctx.publicClient.getTransactionReceipt({ hash: delivery.payment.transactionHash });
    expect(receipt.status).toBe("success");
    expect(receipt.from.toLowerCase()).toBe(ctx.relayer.address.toLowerCase());
    expect(await balanceOf(ctx.vault)).toBe(beforeVault - 500000n);
    expect(await balanceOf(ctx.provider.address)).toBe(beforeProvider + 500000n);
    expect(
      await ctx.publicClient.readContract({
        address: ctx.vault,
        abi: vaultAbi,
        functionName: "intentNonce",
      }),
    ).toBe(1n);
    expect(await ctx.publicClient.getTransactionCount({ address: ctx.relayer.address })).toBe(relayerNonce + 1);

    const again = await requestDelivery(ctx.baseUrl, delivery.quoteId);
    expect(again.status).toBe(200);
    expect(again.body.payment.transactionHash).toBe(delivery.payment.transactionHash);

    const stored = ctx.db.connection.prepare("SELECT * FROM relay_requests").all() as { intent_json: string; signature: string; digest: string; quote_id: string }[];
    const row = stored.find((item) => item.quote_id === delivery.quoteId);
    expect(row).toBeTruthy();
    const intent = JSON.parse(row!.intent_json) as Record<string, string>;
    const replay = await submitSignedIntent(ctx.baseUrl, {
      quoteId: row!.quote_id,
      chainId: 5042002,
      digest: row!.digest,
      signature: row!.signature,
      intent,
    });
    expect(replay.status).toBe("confirmed");
    expect(replay.transactionHash).toBe(delivery.payment.transactionHash);
    expect(
      await ctx.publicClient.readContract({ address: ctx.vault, abi: vaultAbi, functionName: "intentNonce" }),
    ).toBe(1n);
  });

  it("does not deliver a quote that has only been created", async () => {
    const quote = await requestQuote(ctx.baseUrl, ctx.vault, "mainnet");
    const delivery = await requestDelivery(ctx.baseUrl, quote.quoteId);
    expect(delivery.status).toBe(402);
    expect(delivery.body.delivered).toBeUndefined();
    expect(String(delivery.body.message)).toMatch(/not settled/i);
  });

  it("rejects an intent whose recipient is not the quoted provider", async () => {
    const quote = await requestQuote(ctx.baseUrl, ctx.vault, "testnet");
    const nonceBefore = await ctx.publicClient.readContract({
      address: ctx.vault,
      abi: vaultAbi,
      functionName: "intentNonce",
    });
    const intent = await createPaymentIntent(ctx.publicClient, {
      vault: quote.vault,
      recipient: ctx.owner.address,
      amount: BigInt(quote.amount),
      paymentId: quote.paymentId,
      deadline: BigInt(quote.expiresAt),
    });
    const signed = await signPaymentIntent({ intent, chainId: 5042002, signer: ctx.agent });
    const response = await fetch(`${ctx.baseUrl}/relay/intents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        chainId: 5042002,
        digest: signed.digest,
        signature: signed.signature,
        intent: {
          ...intent,
          amount: intent.amount.toString(),
          nonce: intent.nonce.toString(),
          deadline: intent.deadline.toString(),
          policyVersion: intent.policyVersion.toString(),
        },
      }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("quote_mismatch");
    expect(
      await ctx.publicClient.readContract({ address: ctx.vault, abi: vaultAbi, functionName: "intentNonce" }),
    ).toBe(nonceBefore);
  });

  it("does not submit an intent the vault policy would reject", async () => {
    const relayerNonce = await ctx.publicClient.getTransactionCount({ address: ctx.relayer.address });
    const quote = await requestQuote(ctx.baseUrl, ctx.lowCapVault, "testnet");
    const intent = await createPaymentIntent(ctx.publicClient, {
      vault: quote.vault,
      recipient: quote.recipient,
      amount: BigInt(quote.amount),
      paymentId: quote.paymentId,
      deadline: BigInt(quote.expiresAt),
    });
    const signed = await signPaymentIntent({ intent, chainId: 5042002, signer: ctx.agent });
    const relay = await submitSignedIntent(ctx.baseUrl, {
      quoteId: quote.quoteId,
      chainId: 5042002,
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
    expect(relay.status).toBe("simulation_reverted");
    expect(relay.paymentSettled).toBe(false);
    expect(relay.transactionHash).toBeNull();
    expect(await ctx.publicClient.getTransactionCount({ address: ctx.relayer.address })).toBe(relayerNonce);
    expect(
      await ctx.publicClient.readContract({
        address: ctx.lowCapVault,
        abi: vaultAbi,
        functionName: "usedPaymentIds",
        args: [quote.paymentId],
      }),
    ).toBe(false);
    const delivery = await requestDelivery(ctx.baseUrl, quote.quoteId);
    expect(delivery.status).toBe(402);
  });

  it("rejects a signed intent after the quote has expired", async () => {
    const quote = await requestQuote(ctx.baseUrl, ctx.vault, "testnet");
    const intent = await createPaymentIntent(ctx.publicClient, {
      vault: quote.vault,
      recipient: quote.recipient,
      amount: BigInt(quote.amount),
      paymentId: quote.paymentId,
      deadline: BigInt(quote.expiresAt),
    });
    ctx.db.expireQuote(quote.quoteId, Math.floor(Date.now() / 1000) - 5);
    const signed = await signPaymentIntent({ intent, chainId: 5042002, signer: ctx.agent });
    const response = await fetch(`${ctx.baseUrl}/relay/intents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteId: quote.quoteId,
        chainId: 5042002,
        digest: signed.digest,
        signature: signed.signature,
        intent: {
          ...intent,
          amount: intent.amount.toString(),
          nonce: intent.nonce.toString(),
          deadline: intent.deadline.toString(),
          policyVersion: intent.policyVersion.toString(),
        },
      }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("quote_expired");
  });
});
