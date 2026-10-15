import { defineChain, type Chain } from "viem";

import {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_EXPLORER,
  ARC_MAINNET_RPC,
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER,
  ARC_TESTNET_RPC,
} from "./constants";

export const arcMainnet: Chain = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_MAINNET_RPC], webSocket: ["wss://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: ARC_MAINNET_EXPLORER },
  },
});

export const arcTestnet: Chain = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_TESTNET_RPC], webSocket: ["wss://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: ARC_TESTNET_EXPLORER },
  },
  testnet: true,
});

export function chainById(id: number): Chain {
  if (id === ARC_TESTNET_CHAIN_ID) return arcTestnet;
  return arcMainnet;
}

export function isConfiguredChain(chainId: number | undefined, expected: number): boolean {
  return chainId === expected;
}
