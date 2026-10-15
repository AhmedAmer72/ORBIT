import { encodeErrorResult, type Address, type PublicClient, keccak256, stringToBytes } from "viem";
import { describe, expect, it } from "vitest";

import { vaultAbi } from "../src/abi";
import { createArcBondClient } from "../src/arcbond";
import { ArcBondError } from "../src/errors";
import { paymentIdFromLabel } from "../src/format";
import {
  evaluatePolicyLocally,
  explainPolicyFailure,
  preflightPayment,
  remainingAllowance,
  suggestLiveScenario,
  type PolicyObservation,
} from "../src/policy";
import { examplePaymentRequest } from "../examples/preflight";

const agent = "0x1111111111111111111111111111111111111111" as Address;
const owner = "0x2222222222222222222222222222222222222222" as Address;
const recipient = "0x3333333333333333333333333333333333333333" as Address;
const vault = "0x4444444444444444444444444444444444444444" as Address;
const paymentId = paymentIdFromLabel("invoice-1");

function observation(overrides: Partial<PolicyObservation> = {}): PolicyObservation {
  return {
    caller: agent,
    agent,
    paused: false,
    expiresAt: 1_800_000_000n,
    now: 1_700_000_000n,
    amount: 250_000n,
    maxPerPayment: 1_000_000n,
    periodLimit: 1_000_000n,
    displayedSpent: 0n,
    recipientApproved: true,
    paymentId,
    paymentIdUsed: false,
    balance: 5_000_000n,
    ...overrides,
  };
}

describe("evaluatePolicyLocally", () => {
  it("accepts a payment inside the observed policy", () => {
    expect(evaluatePolicyLocally(observation()).ok).toBe(true);
  });

  it("follows the contract's revert order", () => {
    expect(evaluatePolicyLocally(observation({ paused: true, amount: 0n }))).toEqual({ ok: false, errorName: "VaultPaused" });
    expect(evaluatePolicyLocally(observation({ caller: owner }))).toMatchObject({ errorName: "UnauthorizedAgent" });
    expect(evaluatePolicyLocally(observation({ now: 1_800_000_000n }))).toMatchObject({ errorName: "AuthorizationExpired" });
    expect(evaluatePolicyLocally(observation({ amount: 0n }))).toMatchObject({ errorName: "ZeroAmount" });
    expect(evaluatePolicyLocally(observation({ amount: 1_000_001n }))).toMatchObject({ errorName: "AmountExceedsLimit" });
    expect(evaluatePolicyLocally(observation({ recipientApproved: false }))).toMatchObject({ errorName: "RecipientNotApproved" });
    expect(evaluatePolicyLocally(observation({ paymentId: `0x${"00".repeat(32)}` }))).toMatchObject({ errorName: "ZeroPaymentId" });
    expect(evaluatePolicyLocally(observation({ paymentIdUsed: true }))).toMatchObject({ errorName: "PaymentIdUsed" });
    expect(evaluatePolicyLocally(observation({ displayedSpent: 900_000n, amount: 200_000n }))).toMatchObject({
      errorName: "PeriodLimitExceeded",
    });
    expect(evaluatePolicyLocally(observation({ balance: 1n }))).toMatchObject({ errorName: "InsufficientBalance" });
  });

  it("explains a failed rule without calling the result an authorization", () => {
    expect(explainPolicyFailure("PaymentIdUsed")).toMatch(/already used/i);
    expect(explainPolicyFailure("PaymentIdUsed")).not.toMatch(/AUTHORIZED/);
  });
});

describe("payment identifiers", () => {
  it("hashes a label and preserves a 32-byte hex id", () => {
    expect(paymentIdFromLabel("scenario-a")).toBe(keccak256(stringToBytes("scenario-a")));
    const raw = `0x${"ab".repeat(32)}` as const;
    expect(paymentIdFromLabel(raw)).toBe(raw);
    expect(paymentIdFromLabel("scenario-a")).not.toBe(paymentIdFromLabel("scenario-b"));
  });
});

describe("suggestLiveScenario", () => {
  const state = {
    agent,
    owner,
    maxPerPayment: 1_000_000n,
    periodLimit: 1_000_000n,
    displayedSpent: 250_000n,
    balance: 3_000_000n,
    paused: false,
    expiresAt: 1_800_000_000n,
    now: 1_700_000_000n,
  };

  it("builds an over-max request and a duplicate label without sending a transaction", () => {
    expect(remainingAllowance(state.periodLimit, state.displayedSpent)).toBe(750_000n);
    expect(suggestLiveScenario("B", state, true).amount).toBe("1.000001");
    expect(suggestLiveScenario("D", state, true).paymentLabel).toBe("scenario-a");
    expect(suggestLiveScenario("C", state, true).recipient).toBe("0x00000000000000000000000000000000000000b1");
    expect(suggestLiveScenario("E", state, true).caller).not.toBe(agent);
    expect(suggestLiveScenario("F", state, true).amount).toBe("0.750001");
  });
});

describe("preflightPayment", () => {
  function client(call: PublicClient["call"]): PublicClient {
    return {
      getBlock: async () => ({ timestamp: 1_700_000_000n }),
      readContract: async ({ functionName }: { functionName: string }) => {
        const values: Record<string, unknown> = {
          owner,
          pendingOwner: `0x${"00".repeat(20)}`,
          agent,
          expiresAt: 1_800_000_000n,
          maxPerPayment: 1_000_000n,
          periodLimit: 1_000_000n,
          spentInPeriod: 0n,
          displayedSpentInPeriod: 0n,
          periodId: 1n,
          paused: false,
          balanceOf: 5_000_000n,
          approvedRecipients: true,
          usedPaymentIds: false,
        };
        return values[functionName];
      },
      call,
    } as unknown as PublicClient;
  }

  it("reports a successful simulation as advisory", async () => {
    const report = await preflightPayment(client(async () => ({ data: "0x" })), {
      vault,
      caller: agent,
      recipient,
      amount: 250_000n,
      paymentId,
    });
    expect(report.status).toBe("passed");
    expect(report.advisory).toBe(true);
    expect(report.message).toMatch(/must still enforce/i);
  });

  it("returns the decoded contract error when the simulation reverts", async () => {
    const data = encodeErrorResult({ abi: vaultAbi, errorName: "RecipientNotApproved" });
    const report = await preflightPayment(
      client(async () => {
        throw { cause: { data } };
      }),
      {
        vault,
        caller: agent,
        recipient,
        amount: 250_000n,
        paymentId,
      },
    );
    expect(report.status).toBe("simulation_reverted");
    expect(report.errorName).toBe("RecipientNotApproved");
  });
});

describe("createArcBondClient", () => {
  it("rejects an unsupported chain, a zero factory, and a missing signer", async () => {
    expect(() => createArcBondClient({ chainId: 1, publicClient: {} as PublicClient })).toThrow(ArcBondError);
    expect(() =>
      createArcBondClient({
        chainId: 5042002,
        publicClient: {} as PublicClient,
        factory: `0x${"00".repeat(20)}`,
      }),
    ).toThrow(/factory/i);
    const client = createArcBondClient({ chainId: 5042002, publicClient: {} as PublicClient });
    expect(() => client.listVaults(owner)).toThrow(/factory/i);
    await expect(
      client.submitPayment({
        vault,
        recipient,
        amount: 1n,
        paymentId,
      }),
    ).rejects.toMatchObject({ code: "missing_signer" });
  });

  it("compiles the documented payment request example", () => {
    expect(examplePaymentRequest(vault).amount).toBe(10_000n);
    expect(examplePaymentRequest(vault).paymentId).toBe(paymentIdFromLabel("invoice-1"));
  });
});
