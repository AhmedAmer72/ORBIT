import {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_EXPLORER,
  ARC_MAINNET_RPC,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER,
  ARC_TESTNET_RPC,
  NATIVE_USDC_DECIMALS,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from "@arcbond/sdk";
import { keccak256, stringToBytes, type Hex } from "viem";

export const RECORD_KEYS = ["testnet", "mainnet"] as const;
export type RecordKey = (typeof RECORD_KEYS)[number];

export type NetworkRecord = {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  usdc: typeof USDC_ADDRESS;
  usdcDecimals: number;
  nativeGasDecimals: number;
};

export function isRecordKey(value: unknown): value is RecordKey {
  return value === "testnet" || value === "mainnet";
}

export function networkRecord(key: RecordKey): NetworkRecord {
  if (key === "mainnet") {
    return {
      name: "Arc",
      chainId: ARC_MAINNET_CHAIN_ID,
      rpcUrl: ARC_MAINNET_RPC,
      explorerUrl: ARC_MAINNET_EXPLORER,
      usdc: USDC_ADDRESS,
      usdcDecimals: USDC_DECIMALS,
      nativeGasDecimals: NATIVE_USDC_DECIMALS,
    };
  }
  return {
    name: "Arc Testnet",
    chainId: ARC_TESTNET_CHAIN_ID,
    rpcUrl: ARC_TESTNET_RPC,
    explorerUrl: ARC_TESTNET_EXPLORER,
    usdc: USDC_ADDRESS,
    usdcDecimals: USDC_DECIMALS,
    nativeGasDecimals: NATIVE_USDC_DECIMALS,
  };
}

export function recordChecksum(record: NetworkRecord): Hex {
  return keccak256(stringToBytes(JSON.stringify(record)));
}
