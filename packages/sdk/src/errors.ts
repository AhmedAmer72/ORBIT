import { decodeErrorResult, type Hex } from "viem";

import { vaultAbi } from "./abi";

export type ArcBondErrorCode =
  | "unsupported_network"
  | "missing_factory"
  | "missing_signer"
  | "invalid_request"
  | "simulation_reverted"
  | "rejected"
  | "reverted"
  | "rpc"
  | "intent_unavailable";

export class ArcBondError extends Error {
  readonly code: ArcBondErrorCode;

  constructor(code: ArcBondErrorCode, message: string) {
    super(message);
    this.name = "ArcBondError";
    this.code = code;
  }
}

export const VAULT_ERROR_NAMES = [
  "AlreadyInitialized",
  "UnauthorizedOwner",
  "UnauthorizedAgent",
  "AuthorizationExpired",
  "AmountExceedsLimit",
  "PeriodLimitExceeded",
  "RecipientNotApproved",
  "PaymentIdUsed",
  "VaultPaused",
  "TransferAmountMismatch",
  "InvalidTokenDecimals",
  "InvalidOwner",
  "InvalidAgent",
  "InvalidRecipient",
  "ZeroAmount",
  "ZeroPaymentId",
  "InvalidSignature",
  "IntentExpired",
  "WrongVault",
  "WrongToken",
  "PolicyVersionMismatch",
  "InvalidNonce",
] as const;

export type VaultErrorName = (typeof VAULT_ERROR_NAMES)[number];

export function decodeVaultError(data: Hex | undefined): string | undefined {
  if (!data || data === "0x") return undefined;
  try {
    const decoded = decodeErrorResult({ abi: vaultAbi, data });
    return decoded.errorName;
  } catch {
    return undefined;
  }
}

export function revertDataFromError(error: unknown): Hex | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const data = (current as { data?: unknown }).data;
    if (typeof data === "string" && /^0x[0-9a-fA-F]{8,}$/.test(data)) return data as Hex;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function describeWriteFailure(error: unknown): { kind: "rejection" | "error"; message: string } {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
  const match = raw.match(/0x[0-9a-fA-F]{8,}/);
  const decoded = decodeVaultError(revertDataFromError(error) ?? (match ? (match[0] as Hex) : undefined));
  if (decoded) {
    return { kind: "rejection", message: decoded };
  }
  if (/User rejected|user rejected|User denied/i.test(raw)) {
    return { kind: "rejection", message: "Wallet rejected the request." };
  }
  return { kind: "error", message: raw };
}
