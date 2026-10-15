import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { erc20Abi, factoryAbi, readFactoryVersion, USDC_ADDRESS, vaultAbi } from "@arcbond/sdk";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEventLogs,
  publicActions,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

import { chainFor, startPaymentsApp, type PaymentsApp } from "./app";
import { SERVICE_PRICE, type PayConfig } from "./config";
import type { PaymentsDb } from "./db";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Public Anvil development keys. They are the default local accounts and must never be used on Arc.
 * https://book.getfoundry.sh/anvil/
 */
const LOCAL_KEYS = {
  owner: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  agent: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  provider: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  relayer: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
} as const;

const mintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export type LocalPayments = {
  rpcUrl: string;
  baseUrl: string;
  publicClient: PublicClient;
  factory: Address;
  vault: Address;
  lowCapVault: Address;
  owner: PrivateKeyAccount;
  agent: PrivateKeyAccount;
  provider: PrivateKeyAccount;
  relayer: PrivateKeyAccount;
  db: PaymentsDb;
  stop: () => Promise<void>;
};

function anvilBinary(): string {
  const local = path.join(process.env.LOCALAPPDATA ?? "", "foundry-bin", "anvil.exe");
  if (fs.existsSync(local)) return local;
  return "anvil";
}

function artifactBytecode(file: string, field: "bytecode" | "deployedBytecode"): Hex {
  const json = JSON.parse(fs.readFileSync(path.join(repoRoot, "contracts", "out", file), "utf8")) as {
    bytecode?: { object?: string };
    deployedBytecode?: { object?: string };
  };
  const value = json[field]?.object;
  if (!value) throw new Error(`Missing ${field} in contracts/out/${file}. Run npm run test:contracts so Forge writes the artifacts.`);
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not reserve a local port."));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function stopProcess(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

async function waitForChain(rpcUrl: string): Promise<void> {
  const probe = createPublicClient({ transport: http(rpcUrl) });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const id = await probe.getChainId();
      if (id === 5042002) return;
    } catch {
      // Anvil is still opening the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Anvil did not accept RPC connections.");
}

async function send(
  wallet: WalletClient,
  client: PublicClient,
  account: PrivateKeyAccount,
  to: Address | undefined,
  data: Hex,
  gas?: bigint,
) {
  const hash = await wallet.sendTransaction({
    account,
    chain: wallet.chain,
    to,
    data,
    gas,
    maxFeePerGas: 30_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

async function startAnvil(): Promise<{ rpcUrl: string; stop: () => Promise<void> }> {
  const port = await freePort();
  const rpcUrl = `http://127.0.0.1:${port}`;
  let logs = "";
  const child = spawn(
    anvilBinary(),
    ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "5042002", "--base-fee", "1000000000"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stdout?.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    logs += chunk.toString();
  });
  try {
    await waitForChain(rpcUrl);
  } catch (error) {
    await stopProcess(child);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${logs.slice(-2000)}`);
  }
  return { rpcUrl, stop: () => stopProcess(child) };
}

export async function startLocalPayments(): Promise<LocalPayments> {
  const anvil = await startAnvil();
  let app: PaymentsApp | undefined;
  try {
    const configBase = {
      chainId: 5042002,
      rpcUrl: anvil.rpcUrl,
    };
    const chain = chainFor(configBase);
    const publicClient = createPublicClient({ chain, transport: http(anvil.rpcUrl) });
    const testClient = createTestClient({ chain, mode: "anvil", transport: http(anvil.rpcUrl) }).extend(publicActions);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const block = await publicClient.getBlock();
    if (block.timestamp + 30n < now || block.timestamp > now + 300n) {
      await testClient.setNextBlockTimestamp({ timestamp: now });
      await testClient.mine({ blocks: 1 });
    }

    await testClient.setCode({
      address: USDC_ADDRESS,
      bytecode: artifactBytecode("MockUSDC.sol/MockUSDC.json", "deployedBytecode"),
    });
    const decimals = await publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "decimals" });
    if (decimals !== 6) throw new Error("Etched USDC did not report 6 decimals.");

    const owner = privateKeyToAccount(LOCAL_KEYS.owner);
    const agent = privateKeyToAccount(LOCAL_KEYS.agent);
    const provider = privateKeyToAccount(LOCAL_KEYS.provider);
    const relayer = privateKeyToAccount(LOCAL_KEYS.relayer);
    const ownerWallet = createWalletClient({ account: owner, chain, transport: http(anvil.rpcUrl) });

    const deployed = await send(
      ownerWallet,
      publicClient,
      owner,
      undefined,
      artifactBytecode("ArcBondVaultFactory.sol/ArcBondVaultFactory.json", "bytecode"),
      12_000_000n,
    );
    if (!deployed.contractAddress) throw new Error("Factory deployment did not return an address.");
    const factory = deployed.contractAddress;
    const version = await readFactoryVersion(publicClient, factory);
    if (!version.supportsPaymentIntents || version.version !== 2n) {
      throw new Error("The local factory is not version 2. Rebuild contracts with Forge and rerun the test.");
    }

    await send(
      ownerWallet,
      publicClient,
      owner,
      USDC_ADDRESS,
      encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [owner.address, 1_000_000_000n] }),
    );

    const expiresAt = now + 86_400n;
    const vault = await createFundedVault(ownerWallet, publicClient, owner, factory, agent.address, provider.address, expiresAt, 1_000_000n);
    const lowCapVault = await createFundedVault(ownerWallet, publicClient, owner, factory, agent.address, provider.address, expiresAt, 1n);

    const config: PayConfig = {
      chainId: 5042002,
      rpcUrl: anvil.rpcUrl,
      recipient: provider.address,
      relayerKey: LOCAL_KEYS.relayer,
      factory,
      port: 0,
      host: "127.0.0.1",
      quoteTtlSeconds: 900,
      price: SERVICE_PRICE,
      token: USDC_ADDRESS,
      startBlock: 0n,
      databasePath: ":memory:",
    };
    app = await startPaymentsApp({ config, publicClient, chain });
    return {
      rpcUrl: anvil.rpcUrl,
      baseUrl: app.baseUrl,
      publicClient,
      factory,
      vault,
      lowCapVault,
      owner,
      agent,
      provider,
      relayer,
      db: app.db,
      stop: async () => {
        await app?.close();
        await anvil.stop();
      },
    };
  } catch (error) {
    await app?.close().catch(() => undefined);
    await anvil.stop();
    throw error;
  }
}

async function createFundedVault(
  ownerWallet: WalletClient,
  publicClient: PublicClient,
  owner: PrivateKeyAccount,
  factory: Address,
  agent: Address,
  recipient: Address,
  expiresAt: bigint,
  maxPerPayment: bigint,
): Promise<Address> {
  const created = await send(
    ownerWallet,
    publicClient,
    owner,
    factory,
    encodeFunctionData({ abi: factoryAbi, functionName: "createVault" }),
  );
  const events = parseEventLogs({ abi: factoryAbi, logs: created.logs, eventName: "VaultCreated" });
  const vault = events[0]?.args.vault;
  if (!vault) throw new Error("VaultCreated was not emitted.");
  const deposit = 5_000_000n;
  await send(
    ownerWallet,
    publicClient,
    owner,
    vault,
    encodeFunctionData({
      abi: vaultAbi,
      functionName: "updatePolicy",
      args: [maxPerPayment, 10_000_000n, expiresAt],
    }),
  );
  await send(
    ownerWallet,
    publicClient,
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "setRecipient", args: [recipient, true] }),
  );
  await send(
    ownerWallet,
    publicClient,
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "authorizeAgent", args: [agent] }),
  );
  await send(
    ownerWallet,
    publicClient,
    owner,
    USDC_ADDRESS,
    encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, deposit] }),
  );
  await send(
    ownerWallet,
    publicClient,
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [deposit] }),
  );
  return vault;
}
