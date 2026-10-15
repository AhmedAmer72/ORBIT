import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ARC_MAINNET_CHAIN_ID, ARC_MAINNET_RPC, ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC, parseUsdc, USDC_ADDRESS } from "@arcbond/sdk";
import { getAddress, isAddress, type Address, type Hex } from "viem";

export const SERVICE_ID = "arc-network-record";
export const SERVICE_PRICE = parseUsdc("0.50");
export const DEFAULT_QUOTE_TTL_SECONDS = 900;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const KNOWN_TESTNET_ONLY_DEPLOYMENTS = new Set([
  "0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793",
  "0x8f5c16679fb2b50344fbb5b599a37783613a34cd",
  "0xda9889938b7758c484fb5972d2569c5865689e50",
]);

export type PayConfig = {
  chainId: number;
  rpcUrl: string;
  recipient: Address;
  relayerKey?: Hex;
  factory?: Address;
  port: number;
  host: string;
  quoteTtlSeconds: number;
  price: bigint;
  token: Address;
  startBlock: bigint;
  databasePath: string;
};

export class PayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Reads PAY_* keys from the root .env without loading owner or agent keys into the process. */
export function loadPayEnvFile(file = path.join(repoRoot, ".env")): void {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key.startsWith("PAY_") && !key.startsWith("NEXT_PUBLIC_ARC_") && key !== "NEXT_PUBLIC_FACTORY_ADDRESS") continue;
    if (process.env[key]) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value.length > 0) process.env[key] = value;
  }
}

function addressFrom(value: string | undefined, label: string): Address | undefined {
  if (!value) return undefined;
  if (!isAddress(value)) throw new PayError(500, "invalid_config", `${label} is not an address.`);
  return getAddress(value);
}

export function payConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PayConfig {
  const chainId = Number(env.PAY_CHAIN_ID ?? env.NEXT_PUBLIC_ARC_CHAIN_ID ?? ARC_TESTNET_CHAIN_ID);
  if (chainId !== ARC_TESTNET_CHAIN_ID && chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new PayError(500, "invalid_config", "PAY_CHAIN_ID must be Arc Testnet 5042002 or Arc mainnet 5042.");
  }
  const recipient = addressFrom(env.PAY_PROVIDER_RECIPIENT, "PAY_PROVIDER_RECIPIENT");
  if (!recipient) {
    throw new PayError(500, "invalid_config", "PAY_PROVIDER_RECIPIENT is required. It is the USDC address the vault pays.");
  }
  const relayerRaw = env.PAY_RELAYER_PRIVATE_KEY;
  if (relayerRaw && !/^0x[0-9a-fA-F]{64}$/.test(relayerRaw)) {
    throw new PayError(500, "invalid_config", "PAY_RELAYER_PRIVATE_KEY must be a 32-byte hex key.");
  }
  const startRaw = env.PAY_START_BLOCK ?? "0";
  const rpcUrl = env.PAY_RPC_URL ?? env.NEXT_PUBLIC_ARC_RPC_URL ?? (chainId === ARC_MAINNET_CHAIN_ID ? ARC_MAINNET_RPC : ARC_TESTNET_RPC);
  const factory = addressFrom(env.PAY_FACTORY_ADDRESS ?? env.NEXT_PUBLIC_FACTORY_ADDRESS, "PAY_FACTORY_ADDRESS");
  if (chainId === ARC_MAINNET_CHAIN_ID) {
    if (!rpcUrl.includes("rpc.mainnet.arc.io")) {
      throw new PayError(500, "invalid_config", "Mainnet payments must use https://rpc.mainnet.arc.io.");
    }
    if (factory && KNOWN_TESTNET_ONLY_DEPLOYMENTS.has(factory.toLowerCase())) {
      throw new PayError(500, "invalid_config", "Refusing a known Arc Testnet contract on mainnet.");
    }
    if (relayerRaw && !env.PAY_RELAY_MAX_NATIVE) {
      throw new PayError(500, "invalid_config", "Set PAY_RELAY_MAX_NATIVE before enabling a mainnet relayer. Unrestricted sponsorship is disabled.");
    }
  }
  return {
    chainId,
    rpcUrl,
    recipient,
    relayerKey: relayerRaw as Hex | undefined,
    factory,
    port: Number(env.PORT ?? env.PAY_API_PORT ?? 8787),
    host: env.PAY_API_HOST ?? (env.PORT ? "0.0.0.0" : "127.0.0.1"),
    quoteTtlSeconds: Number(env.PAY_QUOTE_TTL_SECONDS ?? DEFAULT_QUOTE_TTL_SECONDS),
    price: SERVICE_PRICE,
    token: USDC_ADDRESS,
    startBlock: BigInt(startRaw),
    databasePath: env.PAY_DB_PATH ?? path.join(repoRoot, "services", "payments", "data", "payments.sqlite"),
  };
}
