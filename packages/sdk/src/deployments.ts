import type { Address, PublicClient } from "viem";

import { factoryAbi } from "./abi";
import { ARC_TESTNET_CHAIN_ID } from "./constants";

/** Factory generation whose clones implement `executePaymentIntent`. */
export const FACTORY_VERSION_WITH_INTENTS = 2n;

/**
 * Arc Testnet factory deployed before intent support.
 * Editing the Solidity source does not change this deployment.
 */
export const arcTestnetFactoryV1 = {
  id: "arc-testnet-v1",
  chainId: ARC_TESTNET_CHAIN_ID,
  factory: "0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d",
  implementation: "0xf37409Cd3d158E1B8f88678CB711dbc206B45781",
  deployBlock: 67052589n,
  supportsPaymentIntents: false,
} as const;

/**
 * Arc Testnet factory deployed 14 October 2026. Clones implement executePaymentIntent.
 * Version 1 vaults are unchanged and are not reachable through this address.
 */
export const arcTestnetFactoryV2 = {
  id: "arc-testnet-v2",
  chainId: ARC_TESTNET_CHAIN_ID,
  version: FACTORY_VERSION_WITH_INTENTS,
  factory: "0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793",
  implementation: "0x00c1f5E6e6bF62924af5FD22234c54a04D3201CE",
  deployBlock: 67213321n,
  deployTx: "0x818d63fd71d32d145e60e971f8553b258c7dce0bb1958e155303856d7001aec4",
  supportsPaymentIntents: true,
  proofVault: "0xDA9889938B7758c484Fb5972D2569c5865689e50",
  proofRecipient: "0x39B6fd99d31A67475911D9d763B0Bd8323f99685",
} as const;

/** Source generation deployed as `arcTestnetFactoryV2`. */
export const sourceFactoryV2 = arcTestnetFactoryV2;

/**
 * Arc mainnet factory deployed 15 October 2026.
 * The address matches the testnet version 1 factory because both were the deployer's first contract.
 * Mainnet code reports VERSION() 2. Testnet code at the same address does not.
 */
export const arcMainnetFactory = {
  id: "arc-mainnet-v2",
  chainId: 5042,
  version: FACTORY_VERSION_WITH_INTENTS,
  factory: "0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d",
  implementation: "0xf37409Cd3d158E1B8f88678CB711dbc206B45781",
  deployBlock: 26000245n,
  deployTx: "0xed3ec4feb1165e858d37c231eaee0c9343431e915aaa11e4ca95bbb16a28997f",
  supportsPaymentIntents: true,
} as const;

export const arcMainnetWorkspaceFactory = {
  id: "arc-mainnet-workspace-v1",
  chainId: 5042,
  version: 1n,
  factory: "0x8fb1a3cff48ec873ef0526a902425813979c7b9e",
  implementation: "0x3be6031B7473F334D75ae69AEeCABa87ec3D93d3",
  deployBlock: 26000255n,
  deployTx: "0x2d39671efa37c2ba0241485839a7ffdb2ec9fb80a29275f34cc3e442b3567fe3",
} as const;

/**
 * Arc Testnet workspace factory deployed 15 October 2026.
 * VERSION 1 is the workspace generation. It is not an upgrade of the vault factories.
 */
export const arcTestnetWorkspaceFactory = {
  id: "arc-testnet-workspace-v1",
  chainId: ARC_TESTNET_CHAIN_ID,
  version: 1n,
  factory: "0x8F5C16679FB2b50344fBb5b599A37783613a34CD",
  implementation: "0x0cba2cd5F503a0a7b50E58dFc68533b929416C9A",
  deployBlock: 67226927n,
  deployTx: "0xf69f04999535a60ce49bee44b374fb0899f9f7fed6139f08c9a0a3a03082e54f",
  smokeWorkspace: "0xd6c3C13d6907123885a3c0E652646E2eE3a9DBA5",
  smokeTx: "0xc4fc2599a1c0eb605a6f420e3eec6f73dd77246a81b08fc034126e1619467be5",
} as const;

export async function readFactoryVersion(
  publicClient: PublicClient,
  factory: Address,
): Promise<{ version: bigint | null; supportsPaymentIntents: boolean }> {
  try {
    const version = await publicClient.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "VERSION",
    });
    return { version, supportsPaymentIntents: version >= FACTORY_VERSION_WITH_INTENTS };
  } catch {
    return { version: null, supportsPaymentIntents: false };
  }
}
