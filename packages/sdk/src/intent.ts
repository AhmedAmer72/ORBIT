import {
  type Address,
  type Hex,
  type Log,
  type PublicClient,
  type TypedDataDomain,
  encodeFunctionData,
  hashTypedData,
  isAddress,
  parseEventLogs,
  zeroAddress,
} from "viem";

import { vaultAbi } from "./abi";
import { USDC_ADDRESS } from "./constants";
import { ArcBondError } from "./errors";
import { simulateVaultCall } from "./client";
import { parseUsdc } from "./format";
import { explainPolicyFailure, type PreflightReport } from "./policy";

export const PAYMENT_INTENT_DOMAIN_NAME = "ArcBondVault";
export const PAYMENT_INTENT_DOMAIN_VERSION = "1";

export const paymentIntentTypes = {
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
} as const;

export type PaymentIntent = {
  vault: Address;
  agent: Address;
  recipient: Address;
  token: Address;
  amount: bigint;
  paymentId: Hex;
  nonce: bigint;
  deadline: bigint;
  policyVersion: bigint;
};

export type SignedPaymentIntent = {
  intent: PaymentIntent;
  signature: Hex;
  digest: Hex;
  chainId: number;
  /** Local signature only. The contract has not accepted the payment. */
  status: "signed";
};

export type IntentSigner = {
  signTypedData: (parameters: {
    domain: TypedDataDomain;
    types: typeof paymentIntentTypes;
    primaryType: "PaymentIntent";
    message: PaymentIntent;
  }) => Promise<Hex>;
};

export function paymentIntentDomain(chainId: number, vault: Address): TypedDataDomain {
  return {
    name: PAYMENT_INTENT_DOMAIN_NAME,
    version: PAYMENT_INTENT_DOMAIN_VERSION,
    chainId,
    verifyingContract: vault,
  };
}

export function paymentIntentTypedData(intent: PaymentIntent, chainId: number) {
  return {
    domain: paymentIntentDomain(chainId, intent.vault),
    types: paymentIntentTypes,
    primaryType: "PaymentIntent" as const,
    message: intent,
  };
}

export function hashPaymentIntent(intent: PaymentIntent, chainId: number): Hex {
  return hashTypedData(paymentIntentTypedData(intent, chainId));
}

export function assertIntentUnchanged(signed: PaymentIntent, submitted: PaymentIntent): void {
  const fields: (keyof PaymentIntent)[] = [
    "vault",
    "agent",
    "recipient",
    "token",
    "amount",
    "paymentId",
    "nonce",
    "deadline",
    "policyVersion",
  ];
  for (const field of fields) {
    if (signed[field] !== submitted[field]) {
      throw new ArcBondError(
        "invalid_request",
        `Signed field ${field} changed. Sign the intent again. The previous signature is not valid for the new value.`,
      );
    }
  }
}

export async function readIntentContext(publicClient: PublicClient, vault: Address) {
  try {
    const [agent, nonce, policyVersion, token] = await Promise.all([
      publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "agent" }),
      publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "intentNonce" }),
      publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "policyVersion" }),
      publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "USDC" }),
    ]);
    return { agent, nonce, policyVersion, token };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ArcBondError(
      "intent_unavailable",
      `This vault did not return intent state. Version 1 vaults do not include executePaymentIntent. ${message}`,
    );
  }
}

export async function createPaymentIntent(
  publicClient: PublicClient,
  input: {
    vault: Address;
    recipient: Address;
    amount: bigint | string;
    paymentId: Hex;
    deadline: bigint;
  },
): Promise<PaymentIntent> {
  if (!isAddress(input.vault) || input.vault === zeroAddress) {
    throw new ArcBondError("invalid_request", "Vault address is missing.");
  }
  if (!isAddress(input.recipient) || input.recipient === zeroAddress) {
    throw new ArcBondError("invalid_request", "Recipient address is missing.");
  }
  const amount = typeof input.amount === "string" ? parseUsdc(input.amount) : input.amount;
  if (amount <= 0n) throw new ArcBondError("invalid_request", "Amount must be a positive 6-decimal base-unit integer.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.paymentId)) {
    throw new ArcBondError("invalid_request", "paymentId must be a 32-byte hex value. Hash labels with paymentIdFromLabel.");
  }
  const context = await readIntentContext(publicClient, input.vault);
  if (context.token.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
    throw new ArcBondError("invalid_request", "The vault token is not the Arc USDC address.");
  }
  return {
    vault: input.vault,
    agent: context.agent,
    recipient: input.recipient,
    token: context.token,
    amount,
    paymentId: input.paymentId,
    nonce: context.nonce,
    deadline: input.deadline,
    policyVersion: context.policyVersion,
  };
}

export async function signPaymentIntent(args: {
  intent: PaymentIntent;
  chainId: number;
  signer: IntentSigner;
}): Promise<SignedPaymentIntent> {
  const typed = paymentIntentTypedData(args.intent, args.chainId);
  const signature = await args.signer.signTypedData(typed);
  return {
    intent: { ...args.intent },
    signature,
    digest: hashTypedData(typed),
    chainId: args.chainId,
    status: "signed",
  };
}

export function encodeExecutePaymentIntent(intent: PaymentIntent, signature: Hex): Hex {
  return encodeFunctionData({
    abi: vaultAbi,
    functionName: "executePaymentIntent",
    args: [intent, signature],
  });
}

export async function preflightPaymentIntent(
  publicClient: PublicClient,
  signed: SignedPaymentIntent & { caller: Address; chainId: number },
): Promise<PreflightReport> {
  const localDigest = hashPaymentIntent(signed.intent, signed.chainId);
  if (signed.intent.vault === zeroAddress || localDigest.length !== 66) {
    return {
      advisory: true,
      status: "unavailable",
      source: "local",
      message: "The intent is missing a vault, so it was not simulated.",
    };
  }
  const simulation = await simulateVaultCall({
    publicClient,
    account: signed.caller,
    vault: signed.intent.vault,
    data: encodeExecutePaymentIntent(signed.intent, signed.signature),
  });
  if (simulation.ok) {
    return {
      advisory: true,
      status: "passed",
      source: "simulation",
      message: "Preflight passed. The contract must still verify the signature and the current policy at execution.",
    };
  }
  if (simulation.rpcLimited) {
    return {
      advisory: true,
      status: "unavailable",
      source: "simulation",
      message: simulation.message,
    };
  }
  return {
    advisory: true,
    status: "simulation_reverted",
    source: "simulation",
    errorName: simulation.errorName,
    message: simulation.errorName
      ? explainPolicyFailure(simulation.errorName)
      : "The simulated intent reverted, and the custom error could not be decoded.",
  };
}

export type IntentExecution = {
  agent: Address;
  recipient: Address;
  submitter: Address;
  amount: bigint;
  paymentId: Hex;
  nonce: bigint;
  policyVersion: bigint;
};

export function intentExecutionFromLogs(logs: Log[]): IntentExecution | undefined {
  const events = parseEventLogs({ abi: vaultAbi, logs, eventName: "PaymentIntentExecuted" });
  const event = events[0];
  if (!event) return undefined;
  return {
    agent: event.args.agent,
    recipient: event.args.recipient,
    submitter: event.args.submitter,
    amount: event.args.amount,
    paymentId: event.args.paymentId,
    nonce: event.args.nonce,
    policyVersion: event.args.policyVersion,
  };
}

export async function intentAlreadyConsumed(
  publicClient: PublicClient,
  intent: PaymentIntent,
): Promise<{ paymentIdUsed: boolean; nonce: bigint; nonceConsumed: boolean }> {
  const [paymentIdUsed, nonce] = await Promise.all([
    publicClient.readContract({
      address: intent.vault,
      abi: vaultAbi,
      functionName: "usedPaymentIds",
      args: [intent.paymentId],
    }),
    publicClient.readContract({ address: intent.vault, abi: vaultAbi, functionName: "intentNonce" }),
  ]);
  return { paymentIdUsed, nonce, nonceConsumed: nonce !== intent.nonce };
}
