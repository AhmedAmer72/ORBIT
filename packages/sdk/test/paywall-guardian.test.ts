import { describe, expect, it } from "vitest";
import { type Address } from "viem";

import {
  createArcBondPaywall,
  createMemoryQuoteStore,
  evaluateGuardian,
  paymentIdForRequest,
  type GuardianFact,
} from "../src/index";

const vault = "0x0000000000000000000000000000000000000001" as Address;
const recipient = "0x0000000000000000000000000000000000000002" as Address;

describe("paywall quotes", () => {
  it("reuses an unexpired quote for the same request and keeps the payment id", async () => {
    let clock = 1_000;
    const paywall = createArcBondPaywall({
      chainId: 5042002,
      recipient,
      vault,
      publicClient: {} as never,
      now: () => clock,
      newId: () => "0xabc",
    });
    const first = await paywall.createQuote({ serviceId: "data-lookup", requestId: "req-1", amount: 500_000n });
    clock += 10;
    const second = await paywall.createQuote({ serviceId: "data-lookup", requestId: "req-1", amount: 500_000n });
    expect(second.id).toBe(first.id);
    expect(first.paymentId).toBe(paymentIdForRequest("data-lookup", "req-1"));
    expect(first.amount).toBe(500_000n);
    expect(first.recipient).toBe(recipient);
  });

  it("replaces an expired quote instead of extending it", async () => {
    let clock = 1_000;
    let ids = 0;
    const paywall = createArcBondPaywall({
      chainId: 5042002,
      recipient,
      vault,
      publicClient: {} as never,
      ttlSeconds: 30,
      now: () => clock,
      newId: () => `id-${ids++}`,
      store: createMemoryQuoteStore(),
    });
    const first = await paywall.createQuote({ serviceId: "data-lookup", requestId: "req-1", amount: 1n });
    clock += 31;
    const second = await paywall.createQuote({ serviceId: "data-lookup", requestId: "req-1", amount: 1n });
    expect(second.id).not.toBe(first.id);
    expect(second.paymentId).toBe(first.paymentId);
  });
});

describe("guardian rules", () => {
  it("flags a budget that crosses the threshold once", () => {
    const facts: GuardianFact[] = [
      { id: "b1", kind: "near_limit", at: 100, subject: "workspace", amount: 8n, limit: 10n },
      { id: "b1", kind: "near_limit", at: 100, subject: "workspace", amount: 8n, limit: 10n },
    ];
    const alerts = evaluateGuardian(facts, 100, {
      budgetFractionBps: 8000,
      paymentsInWindow: 5,
      windowSeconds: 60,
      relayFailures: 3,
      expiryWarningSeconds: 100,
      lowBalance: 1n,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.rule).toBe("near_budget");
    expect(alerts[0]?.severity).toBe("watch");
  });

  it("flags relay failures from records, not from reverted logs", () => {
    const facts: GuardianFact[] = [1, 2, 3].map((index) => ({
      id: `f${index}`,
      kind: "relay_failure" as const,
      at: 50 + index,
      subject: "relay",
    }));
    const alerts = evaluateGuardian(facts, 60);
    expect(alerts.map((alert) => alert.rule)).toContain("relay_failures");
  });
});
