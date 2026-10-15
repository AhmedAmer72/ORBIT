import { describe, expect, it } from "vitest";

import { PayError } from "../src/config";
import { assertIntentMatchesQuote } from "../src/relay";
import { networkRecord, recordChecksum } from "../src/records";

const quote = {
  vault: "0x0000000000000000000000000000000000000001",
  recipient: "0x0000000000000000000000000000000000000002",
  token: "0x3600000000000000000000000000000000000000",
  amount: "500000",
  payment_id: `0x${"11".repeat(32)}`,
  expires_at: 2_000,
  chain_id: 5042002,
};

const intent = {
  vault: quote.vault as `0x${string}`,
  agent: "0x0000000000000000000000000000000000000003" as `0x${string}`,
  recipient: quote.recipient as `0x${string}`,
  token: quote.token as `0x${string}`,
  amount: 500000n,
  paymentId: quote.payment_id as `0x${string}`,
  nonce: 0n,
  deadline: 2_000n,
  policyVersion: 3n,
};

describe("quote binding", () => {
  it("accepts an intent that matches the quote exactly", () => {
    expect(() => assertIntentMatchesQuote(quote, intent, 5042002, 1_000)).not.toThrow();
  });

  it("rejects a different recipient, amount, or an expired quote", () => {
    expect(() =>
      assertIntentMatchesQuote(quote, { ...intent, recipient: "0x0000000000000000000000000000000000000009" }, 5042002, 1_000),
    ).toThrow(PayError);
    expect(() => assertIntentMatchesQuote(quote, { ...intent, amount: 1n }, 5042002, 1_000)).toThrow(/amount/);
    expect(() => assertIntentMatchesQuote(quote, intent, 5042002, 2_000)).toThrow(/expired/);
  });

  it("builds a stable checksum for the public network record", () => {
    const record = networkRecord("testnet");
    expect(record.chainId).toBe(5042002);
    expect(recordChecksum(record)).toBe(recordChecksum(networkRecord("testnet")));
    expect(recordChecksum(record)).not.toBe(recordChecksum(networkRecord("mainnet")));
  });
});
