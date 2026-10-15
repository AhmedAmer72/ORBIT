import { isAddress, zeroAddress, type Address } from "viem";

import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_EXPLORER, ARC_TESTNET_RPC, USDC_ADDRESS } from "@arcbond/sdk";

export type AppConfig = {
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  usdc: Address;
  factory: Address | undefined;
  factoryDeployBlock: bigint | undefined;
  walletConnectProjectId: string | undefined;
  privyAppId: string | undefined;
  privyClientId: string | undefined;
  payApiUrl: string | undefined;
  workspaceFactory: Address | undefined;
  workspaceDeployBlock: bigint | undefined;
  guardianUrl: string | undefined;
};

function env(name: keyof ImportMetaEnv): string | undefined {
  if (typeof process !== "undefined" && process.env.VITEST) {
    const value = process.env[name];
    return value && value.length > 0 ? value : undefined;
  }
  const value = import.meta.env[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function loadAppConfig(): AppConfig {
  const chainId = Number(env("NEXT_PUBLIC_ARC_CHAIN_ID") ?? ARC_TESTNET_CHAIN_ID);
  const factoryRaw = env("NEXT_PUBLIC_FACTORY_ADDRESS") ?? "";
  const blockRaw = env("NEXT_PUBLIC_FACTORY_DEPLOY_BLOCK") ?? "";
  const factory = isAddress(factoryRaw) && factoryRaw.toLowerCase() !== zeroAddress ? factoryRaw : undefined;
  return {
    chainId,
    rpcUrl: env("NEXT_PUBLIC_ARC_RPC_URL") ?? ARC_TESTNET_RPC,
    explorerUrl: env("NEXT_PUBLIC_ARC_EXPLORER_URL") ?? ARC_TESTNET_EXPLORER,
    usdc: (env("NEXT_PUBLIC_USDC_ADDRESS") as Address | undefined) ?? USDC_ADDRESS,
    factory,
    factoryDeployBlock: blockRaw ? BigInt(blockRaw) : undefined,
    walletConnectProjectId: env("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"),
    privyAppId: env("NEXT_PUBLIC_PRIVY_APP_ID"),
    privyClientId: env("NEXT_PUBLIC_PRIVY_CLIENT_ID"),
    payApiUrl: env("NEXT_PUBLIC_PAY_API_URL"),
    workspaceFactory: addressOrUndefined(env("NEXT_PUBLIC_WORKSPACE_FACTORY_ADDRESS")),
    workspaceDeployBlock: env("NEXT_PUBLIC_WORKSPACE_DEPLOY_BLOCK")
      ? BigInt(env("NEXT_PUBLIC_WORKSPACE_DEPLOY_BLOCK") as string)
      : undefined,
    guardianUrl: env("NEXT_PUBLIC_GUARDIAN_URL"),
  };
}

function addressOrUndefined(value: string | undefined): Address | undefined {
  return value && isAddress(value) && value.toLowerCase() !== zeroAddress ? value : undefined;
}

export const appConfig = loadAppConfig();
