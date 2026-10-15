import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { arcTestnet, workspaceAbi, workspaceFactoryAbi } from "@arcbond/sdk";
import { createPublicClient, createWalletClient, encodeFunctionData, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const rpcUrl = "https://rpc.testnet.arc.io";
const chain = arcTestnet;

function readEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function upsertEnv(file, updates) {
  const original = fs.readFileSync(file, "utf8");
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.split(/\r?\n/);
  const pending = { ...updates };
  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return line;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    if (!(key in pending)) return line;
    const value = pending[key];
    delete pending[key];
    return `${key}=${value}`;
  });
  for (const [key, value] of Object.entries(pending)) next.push(`${key}=${value}`);
  fs.writeFileSync(file, next.join(eol).replace(/\s+$/, "") + eol);
}

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();
if (chainId !== 5042002) {
  throw new Error(`Refusing to broadcast. RPC chain id is ${chainId}, not Arc Testnet 5042002.`);
}

const env = readEnv(envPath);
const key = env.PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("PRIVATE_KEY is missing from .env.");
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

async function feeFields() {
  const gasPrice = await publicClient.getGasPrice();
  const floor = 20_000_000_000n;
  const maxFeePerGas = (gasPrice > floor ? gasPrice : floor) + 10_000_000_000n;
  return { maxFeePerGas, maxPriorityFeePerGas: 1_000_000_000n };
}

async function send(to, data) {
  const fees = await feeFields();
  const request = { account, data };
  if (to) request.to = to;
  const gas = await publicClient.estimateGas(request);
  const cost = gas * fees.maxFeePerGas;
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < (cost * 12n) / 10n) {
    throw new Error(`Deployer ${account.address} does not have enough testnet gas for this transaction.`);
  }
  const hash = await wallet.sendTransaction({ ...request, chain, gas: (gas * 12n) / 10n, ...fees });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

let factory = env.NEXT_PUBLIC_WORKSPACE_FACTORY_ADDRESS;
let already = false;
if (factory && /^0x[0-9a-fA-F]{40}$/.test(factory)) {
  try {
    const version = await publicClient.readContract({ address: factory, abi: workspaceFactoryAbi, functionName: "VERSION" });
    already = version === 1n;
  } catch {
    already = false;
  }
}

let deployTx = "existing";
let deployBlock = env.NEXT_PUBLIC_WORKSPACE_DEPLOY_BLOCK ?? "";
if (!already) {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(root, "contracts", "out", "ArcBondWorkspaceFactory.sol", "ArcBondWorkspaceFactory.json"), "utf8"),
  );
  console.log(`deploying workspace factory from ${account.address}`);
  const receipt = await send(undefined, artifact.bytecode.object);
  factory = receipt.contractAddress;
  if (!factory) throw new Error("Deployment did not return a contract address.");
  deployTx = receipt.transactionHash;
  deployBlock = receipt.blockNumber.toString();
  console.log(`factory=${factory}`);
  console.log(`deployTx=${deployTx}`);
  console.log(`deployBlock=${deployBlock}`);
} else {
  console.log(`workspace factory already present at ${factory}`);
}

const version = await publicClient.readContract({ address: factory, abi: workspaceFactoryAbi, functionName: "VERSION" });
const implementation = await publicClient.readContract({
  address: factory,
  abi: workspaceFactoryAbi,
  functionName: "implementation",
});
if (version !== 1n) throw new Error(`Workspace factory version is ${version}, expected 1.`);
const implArtifact = JSON.parse(
  fs.readFileSync(path.join(root, "contracts", "out", "ArcBondWorkspace.sol", "ArcBondWorkspace.json"), "utf8"),
);
const onChainCode = await publicClient.getBytecode({ address: implementation });
if (!onChainCode || onChainCode === "0x") {
  throw new Error(`Implementation ${implementation} has no code.`);
}
const implementationVersion = await publicClient.readContract({
  address: implementation,
  abi: workspaceAbi,
  functionName: "VERSION",
});
if (implementationVersion !== 1n) {
  throw new Error(`Implementation ${implementation} did not report workspace version 1.`);
}
if (!implArtifact.deployedBytecode?.object) {
  throw new Error("Compiled workspace artifact is missing deployed bytecode.");
}

const existing = await publicClient.readContract({
  address: factory,
  abi: workspaceFactoryAbi,
  functionName: "workspacesOf",
  args: [account.address],
});
let workspace = existing[0];
let createTx = "existing";
if (!workspace) {
  const created = await send(factory, encodeFunctionData({ abi: workspaceFactoryAbi, functionName: "createWorkspace" }));
  const events = parseEventLogs({ abi: workspaceFactoryAbi, logs: created.logs, eventName: "WorkspaceCreated" });
  workspace = events[0]?.args.workspace;
  createTx = created.transactionHash;
  if (!workspace) throw new Error("WorkspaceCreated was not emitted.");
}
const owner = await publicClient.readContract({ address: workspace, abi: workspaceAbi, functionName: "owner" });
const workspaceVersion = await publicClient.readContract({ address: workspace, abi: workspaceAbi, functionName: "VERSION" });
if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error("Smoke workspace owner does not match the deployer.");
if (workspaceVersion !== 1n) throw new Error("Smoke workspace did not report version 1.");

upsertEnv(envPath, {
  NEXT_PUBLIC_WORKSPACE_FACTORY_ADDRESS: factory,
  NEXT_PUBLIC_WORKSPACE_DEPLOY_BLOCK: deployBlock || env.NEXT_PUBLIC_WORKSPACE_DEPLOY_BLOCK,
  NEXT_PUBLIC_GUARDIAN_URL: "http://127.0.0.1:8788",
  GUARDIAN_WORKSPACES: workspace,
  GUARDIAN_FROM_BLOCK: deployBlock || env.NEXT_PUBLIC_WORKSPACE_DEPLOY_BLOCK || "0",
  GUARDIAN_RPC_URL: rpcUrl,
  GUARDIAN_CHAIN_ID: "5042002",
});

console.log(`implementation=${implementation}`);
console.log(`version=${version}`);
console.log(`workspace=${workspace}`);
console.log(`createTx=${createTx}`);
console.log(`chainId=${chainId}`);
