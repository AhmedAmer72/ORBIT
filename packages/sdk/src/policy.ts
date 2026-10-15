import { type Address, type Hex, type PublicClient, zeroAddress } from "viem";

import { vaultAbi } from "./abi";
import { ZERO_HASH } from "./constants";
import { decodeVaultError, revertDataFromError, type VaultErrorName } from "./errors";
import { formatUsdc, parseUsdc } from "./format";
import { encodeExecutePayment, readVault, simulateVaultCall } from "./client";

export type ObservedPolicyFailure = VaultErrorName | "InsufficientBalance";

export type PolicyObservation = {
  caller: Address;
  agent: Address;
  paused: boolean;
  expiresAt: bigint;
  now: bigint;
  amount: bigint;
  maxPerPayment: bigint;
  periodLimit: bigint;
  displayedSpent: bigint;
  recipientApproved: boolean;
  paymentId: Hex;
  paymentIdUsed: boolean;
  balance: bigint;
};

export type LocalPolicyResult = { ok: true } | { ok: false; errorName: ObservedPolicyFailure };

export type PaymentRequest = {
  vault: Address;
  recipient: Address;
  amount: bigint;
  paymentId: Hex;
};

export type PreflightReport = {
  /** Advisory only. The contract checks again when the transaction executes. */
  advisory: true;
  status: "passed" | "rejected" | "simulation_reverted" | "unavailable";
  source: "local" | "simulation" | "read";
  errorName?: string;
  localErrorName?: string;
  message: string;
};

const FAILURE_TEXT: Record<ObservedPolicyFailure, string> = {
  VaultPaused: "The vault is paused. executePayment reverts until the owner unpauses. Withdrawal stays available to the owner.",
  UnauthorizedAgent: "The caller is not the vault's single authorized agent.",
  AuthorizationExpired: "expiresAt is unset or already reached. Payments at or after that timestamp revert.",
  AmountExceedsLimit: "The amount is above maxPerPayment.",
  PeriodLimitExceeded: "The amount would push the current UTC day above periodLimit. The window resets at 00:00 UTC.",
  RecipientNotApproved: "The recipient is not on the vault allowlist.",
  PaymentIdUsed: "This payment id was already used on this vault. A new id does not bypass the other rules.",
  ZeroAmount: "The amount is zero.",
  ZeroPaymentId: "The payment id is bytes32(0).",
  InvalidSignature: "The signature does not recover to the agent named in the intent.",
  IntentExpired: "block.timestamp is at or after the intent deadline.",
  WrongVault: "The intent names a different vault.",
  WrongToken: "The intent token is not this vault's USDC.",
  PolicyVersionMismatch: "The owner changed policy after this intent was signed. Sign a new intent at the current policy version.",
  InvalidNonce: "The intent nonce is not the vault's current intentNonce. A consumed intent cannot be replayed.",
  AlreadyInitialized: "The vault is already initialized.",
  UnauthorizedOwner: "The caller is not the owner.",
  TransferAmountMismatch: "The USDC balance did not change by the expected amount.",
  InvalidTokenDecimals: "USDC decimals were not 6.",
  InvalidOwner: "That owner address is not allowed.",
  InvalidAgent: "The owner, the zero address, and the vault itself cannot be the agent.",
  InvalidRecipient: "The zero address and the vault itself cannot be allowlisted.",
  InsufficientBalance: "The vault USDC balance is below the requested amount. The token transfer would revert.",
};

export function explainPolicyFailure(name: string): string {
  if (name in FAILURE_TEXT) return FAILURE_TEXT[name as ObservedPolicyFailure];
  return name;
}

export function remainingAllowance(periodLimit: bigint, displayedSpent: bigint): bigint {
  return periodLimit > displayedSpent ? periodLimit - displayedSpent : 0n;
}

/// Mirrors ArcBondVault.executePayment order. Stale if chain state changes before the transaction.
export function evaluatePolicyLocally(input: PolicyObservation): LocalPolicyResult {
  if (input.paused) return { ok: false, errorName: "VaultPaused" };
  if (input.caller.toLowerCase() !== input.agent.toLowerCase() || input.agent.toLowerCase() === zeroAddress) {
    return { ok: false, errorName: "UnauthorizedAgent" };
  }
  if (input.now >= input.expiresAt) return { ok: false, errorName: "AuthorizationExpired" };
  if (input.amount === 0n) return { ok: false, errorName: "ZeroAmount" };
  if (input.amount > input.maxPerPayment) return { ok: false, errorName: "AmountExceedsLimit" };
  if (!input.recipientApproved) return { ok: false, errorName: "RecipientNotApproved" };
  if (input.paymentId.toLowerCase() === ZERO_HASH) return { ok: false, errorName: "ZeroPaymentId" };
  if (input.paymentIdUsed) return { ok: false, errorName: "PaymentIdUsed" };
  if (input.displayedSpent + input.amount > input.periodLimit) return { ok: false, errorName: "PeriodLimitExceeded" };
  if (input.balance < input.amount) return { ok: false, errorName: "InsufficientBalance" };
  return { ok: true };
}

export async function preflightPayment(
  publicClient: PublicClient,
  request: PaymentRequest & { caller: Address; now?: bigint },
): Promise<PreflightReport> {
  try {
    const [state, recipientApproved, paymentIdUsed] = await Promise.all([
      readVault(publicClient, request.vault),
      publicClient.readContract({
        address: request.vault,
        abi: vaultAbi,
        functionName: "approvedRecipients",
        args: [request.recipient],
      }),
      publicClient.readContract({
        address: request.vault,
        abi: vaultAbi,
        functionName: "usedPaymentIds",
        args: [request.paymentId],
      }),
    ]);
    const now = request.now ?? (await publicClient.getBlock()).timestamp;
    const local = evaluatePolicyLocally({
      caller: request.caller,
      agent: state.agent,
      paused: state.paused,
      expiresAt: state.expiresAt,
      now,
      amount: request.amount,
      maxPerPayment: state.maxPerPayment,
      periodLimit: state.periodLimit,
      displayedSpent: state.displayedSpent,
      recipientApproved,
      paymentId: request.paymentId,
      paymentIdUsed,
      balance: state.balance,
    });
    const simulation = await simulateVaultCall({
      publicClient,
      account: request.caller,
      vault: request.vault,
      data: encodeExecutePayment(request.recipient, request.amount, request.paymentId),
    });
    const localErrorName = local.ok ? undefined : local.errorName;
    if (simulation.ok) {
      return {
        advisory: true,
        status: "passed",
        source: "simulation",
        localErrorName,
        message: local.ok
          ? "Preflight passed. The contract must still enforce authorization at execution time."
          : `The simulated call succeeded, while the local check reported ${local.errorName}. Use the simulation for this block. The contract checks again at execution.`,
      };
    }
    const errorName = simulation.errorName ?? localErrorName;
    return {
      advisory: true,
      status: "simulation_reverted",
      source: "simulation",
      errorName,
      localErrorName,
      message: errorName
        ? explainPolicyFailure(errorName)
        : "The simulated call reverted, and the custom error could not be decoded.",
    };
  } catch (error) {
    const data = revertDataFromError(error);
    const errorName = decodeVaultError(data);
    return {
      advisory: true,
      status: "unavailable",
      source: "read",
      errorName,
      message: error instanceof Error ? error.message : "The vault state could not be read.",
    };
  }
}

export type ScenarioId = "A" | "B" | "C" | "D" | "E" | "F" | "G";

const UNAPPROVED = "0x00000000000000000000000000000000000000b1" as Address;
const STRANGER = "0x00000000000000000000000000000000000000b2" as Address;

export function suggestLiveScenario(
  id: ScenarioId,
  state: {
    agent: Address;
    owner: Address;
    maxPerPayment: bigint;
    periodLimit: bigint;
    displayedSpent: bigint;
    balance: bigint;
    paused: boolean;
    expiresAt: bigint;
    now: bigint;
  },
  ownerApproved: boolean,
): { amount: string; recipient: Address; caller: Address; paymentLabel: string; note: string } {
  const room = remainingAllowance(state.periodLimit, state.displayedSpent);
  const eligible = min(state.maxPerPayment, room, state.balance);
  if (id === "A") {
    return {
      amount: eligible > 0n ? formatUsdc(eligible > 1_000_000n ? 100_000n : eligible) : "0",
      recipient: ownerApproved ? state.owner : UNAPPROVED,
      caller: state.agent,
      paymentLabel: `lab-${state.now.toString()}`,
      note: eligible > 0n
        ? "Uses the authorized agent, an allowlisted recipient when the owner is allowlisted, and an amount inside the current caps and balance."
        : "No positive amount currently fits the cap, remaining UTC-day allowance, and vault balance.",
    };
  }
  if (id === "B") {
    return {
      amount: formatUsdc(state.maxPerPayment + 1n),
      recipient: ownerApproved ? state.owner : UNAPPROVED,
      caller: state.agent,
      paymentLabel: `lab-over-max-${state.now.toString()}`,
      note: "Requests one base unit above maxPerPayment.",
    };
  }
  if (id === "C") {
    return {
      amount: eligible > 0n ? formatUsdc(eligible > 1_000_000n ? 100_000n : eligible) : "0.01",
      recipient: UNAPPROVED,
      caller: state.agent,
      paymentLabel: `lab-recipient-${state.now.toString()}`,
      note: "Targets 0x…00b1. If that address was allowlisted on this vault, preflight will say so.",
    };
  }
  if (id === "D") {
    return {
      amount: "0.01",
      recipient: ownerApproved ? state.owner : UNAPPROVED,
      caller: state.agent,
      paymentLabel: "scenario-a",
      note: "scenario-a was consumed on the testnet proof vault. Other vaults must read usedPaymentIds for this label.",
    };
  }
  if (id === "E") {
    return {
      amount: "0.01",
      recipient: ownerApproved ? state.owner : UNAPPROVED,
      caller: STRANGER,
      paymentLabel: `lab-stranger-${state.now.toString()}`,
      note: "Simulates a caller that is not the agent. Revoke the real agent from the Agents page; this button does not send that transaction.",
    };
  }
  if (id === "F") {
    const over = room + 1n;
    return {
      amount: formatUsdc(over),
      recipient: ownerApproved ? state.owner : UNAPPROVED,
      caller: state.agent,
      paymentLabel: `lab-period-${state.now.toString()}`,
      note: "Requests one base unit above the remaining UTC-day allowance.",
    };
  }
  return {
    amount: eligible > 0n ? formatUsdc(eligible > 1_000_000n ? 100_000n : eligible) : "0.01",
    recipient: ownerApproved ? state.owner : UNAPPROVED,
    caller: state.agent,
    paymentLabel: `lab-pause-${state.now.toString()}`,
    note:
      state.paused || state.now >= state.expiresAt
        ? "The current vault is paused or the authorization timestamp has passed."
        : "This vault is not paused and the authorization timestamp is still ahead. Pause it from Vaults, or set an earlier expiry from Policies, then evaluate again.",
  };
}

function min(a: bigint, b: bigint, c: bigint): bigint {
  let value = a < b ? a : b;
  if (c < value) value = c;
  return value;
}

export function parseScenarioAmount(value: string): bigint {
  return parseUsdc(value);
}
