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

export const RPC_RATE_LIMIT_MESSAGE =
  "The Arc RPC rate-limited this request. Wait a few seconds and try again. The vault did not reject the call.";

export function isRpcRateLimit(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { status?: unknown; message?: unknown; details?: unknown; shortMessage?: unknown };
    if (record.status === 429) return true;
    const message = [record.message, record.details, record.shortMessage]
      .filter((part) => part !== undefined && part !== null)
      .join(" ");
    if (/\b429\b|too many requests|rate limit/i.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return typeof error === "string" && /\b429\b|too many requests|rate limit/i.test(error);
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
  if (isRpcRateLimit(error)) {
    return { kind: "error", message: RPC_RATE_LIMIT_MESSAGE };
  }
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
