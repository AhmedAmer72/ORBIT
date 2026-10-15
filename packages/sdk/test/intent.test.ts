import { type PublicClient, type WalletClient, recoverTypedDataAddress, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { createArcBondClient } from "../src/arcbond";
import {
  assertIntentUnchanged,
  hashPaymentIntent,
  paymentIntentDomain,
  signPaymentIntent,
  type PaymentIntent,
} from "../src/intent";
import { parseUsdc } from "../src/format";

const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

function sampleIntent(amount = parseUsdc("0.50")): PaymentIntent {
  return {
    vault: "0x1111111111111111111111111111111111111111",
    agent: "0x2222222222222222222222222222222222222222",
    recipient: "0x3333333333333333333333333333333333333333",
    token: "0x3600000000000000000000000000000000000000",
    amount,
    paymentId: "0x4444444444444444444444444444444444444444444444444444444444444444",
    nonce: 0n,
    deadline: 1_800_000_000n,
    policyVersion: 3n,
  };
}

describe("payment intents", () => {
  it("binds 0.50 USDC to 500000 base units and the documented digest", async () => {
    const intent = sampleIntent();
    expect(intent.amount).toBe(500_000n);
    const account = privateKeyToAccount(ANVIL_KEY);
    const signed = await signPaymentIntent({
      intent,
      chainId: 5042002,
      signer: account,
    });
    expect(signed.status).toBe("signed");
    expect(signed.digest).toBe("0xc8857c007e3ed4b502c4eee3ca3cf294f9145ff8280a770d8d3d7fade66d2416");
    expect(hashPaymentIntent(signed.intent, 5042002)).toBe(signed.digest);
    expect(paymentIntentDomain(5042002, intent.vault)).toMatchObject({
      name: "ArcBondVault",
      version: "1",
      chainId: 5042002,
      verifyingContract: intent.vault,
    });
    await expect(
      recoverTypedDataAddress({
        domain: paymentIntentDomain(5042002, intent.vault),
        types: {
          PaymentIntent: [
            { name: "vault", type: "address" },
            { name: "agent", type: "address" },
            { name: "recipient", type: "address" },
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "paymentId", type: "bytes32" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
            { name: "policyVersion", type: "uint256" },
          ],
        },
        primaryType: "PaymentIntent",
        message: intent,
        signature: signed.signature,
      }),
    ).resolves.toBe(account.address);
  });

  it("rejects a signed field that changed after signing", async () => {
    const account = privateKeyToAccount(ANVIL_KEY);
    const signed = await signPaymentIntent({ intent: sampleIntent(), chainId: 5042002, signer: account });
    const changed = { ...signed.intent, amount: parseUsdc("0.51") };
    expect(() => assertIntentUnchanged(signed.intent, changed)).toThrow(/amount/);
    const client = createArcBondClient({
      chainId: 5042002,
      publicClient: {} as PublicClient,
      walletClient: {} as WalletClient,
      account: account.address,
    });
    await expect(client.executeIntent({ ...signed, intent: changed })).rejects.toThrow(/Sign the intent again/);
  });

  it("does not call the chain when the intent is missing a vault", async () => {
    const { createPaymentIntent } = await import("../src/intent");
    await expect(
      createPaymentIntent({} as PublicClient, {
        vault: zeroAddress,
        recipient: "0x3333333333333333333333333333333333333333",
        amount: "0.50",
        paymentId: sampleIntent().paymentId,
        deadline: 1_800_000_000n,
      }),
    ).rejects.toThrow(/Vault address/);
  });
});
