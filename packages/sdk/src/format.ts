import {
  formatUnits,
  isAddress,
  keccak256,
  parseUnits,
  stringToBytes,
  type Address,
  type Hex,
} from "viem";

import { USDC_DECIMALS, ZERO_ADDRESS, ZERO_HASH } from "./constants";

export function formatUsdc(amount: bigint): string {
  return formatUnits(amount, USDC_DECIMALS);
}

export function parseUsdc(value: string): bigint {
  return parseUnits(value.trim(), USDC_DECIMALS);
}

export function isUsdcAddress(value: string): value is Address {
  return isAddress(value) && value.toLowerCase() !== ZERO_ADDRESS;
}

export function explorerTxUrl(explorerUrl: string, hash: Hex): string {
  return `${explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}

export function explorerAddressUrl(explorerUrl: string, address: Address): string {
  return `${explorerUrl.replace(/\/$/, "")}/address/${address}`;
}

export function paymentIdFromLabel(label: string): Hex {
  const trimmed = label.trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed as Hex;
  return keccak256(stringToBytes(trimmed));
}

export function isZeroHash(value: string): boolean {
  return value.toLowerCase() === ZERO_HASH;
}
