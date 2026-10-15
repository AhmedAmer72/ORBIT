import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { arcMainnet, USDC_ADDRESS } from "@arcbond/sdk";
import { createPublicClient, createWalletClient, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rpcUrl = "https://rpc.mainnet.arc.io";
const chain = arcMainnet;
const maxSpend = 400_000_000_000_000_000n;

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

if (process.env.ARC_MAINNET_DEPLOY !== "approved") {
  throw new Error("Set ARC_MAINNET_DEPLOY=approved to broadcast. The ceiling is 0.40 native USDC.");
}

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();
if (chainId !== 5042 || rpcUrl !== "https://rpc.mainnet.arc.io") {
  throw new Error(`Refusing broadcast. RPC chain id is ${chainId}.`);
}
const decimals = await publicClient.readContract({
  address: USDC_ADDRESS,
  abi: [{ type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }],
  functionName: "decimals",
});
if (decimals !== 6) throw new Error(`USDC decimals() returned ${decimals}.`);

const envPath = path.join(root, ".env");
const env = readEnv(envPath);
const key = env.PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("PRIVATE_KEY is missing from .env.");
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });

const jobs = [
  ["ArcBondVaultFactory.sol", "ArcBondVaultFactory.json"],
  ["ArcBondWorkspaceFactory.sol", "ArcBondWorkspaceFactory.json"],
];

async function feeFields() {
  const gasPrice = await publicClient.getGasPrice();
  const floor = 20_000_000_000n;
  const maxFeePerGas = (gasPrice > floor ? gasPrice : floor) + 10_000_000_000n;
  return { maxFeePerGas, maxPriorityFeePerGas: 1_000_000_000n };
}

let spent = 0n;
const results = [];
for (const [folder, file] of jobs) {
  const artifact = JSON.parse(fs.readFileSync(path.join(root, "contracts", "out", folder, file), "utf8"));
  const fees = await feeFields();
  const gas = await publicClient.estimateGas({ account, data: artifact.bytecode.object });
  const buffered = (gas * 12n) / 10n;
  const quote = buffered * fees.maxFeePerGas;
  if (spent + quote > maxSpend) {
    throw new Error(`Stopping. Next deploy quote would exceed the 0.40 native USDC ceiling.`);
  }
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < quote) throw new Error("Deployer balance is below the quoted fee.");
  const hash = await wallet.sendTransaction({
    account,
    chain,
    data: artifact.bytecode.object,
    gas: buffered,
    ...fees,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) {
    throw new Error(`Deployment failed: ${hash}`);
  }
  const paid = receipt.gasUsed * (receipt.effectiveGasPrice ?? fees.maxFeePerGas);
  spent += paid;
  if (spent > maxSpend) throw new Error(`Spent ${spent} wei, above the approved ceiling, after ${hash}.`);
  results.push({
    contract: file.replace(".json", ""),
    address: receipt.contractAddress,
    hash,
    block: receipt.blockNumber.toString(),
    paid: formatUnits(paid, 18),
  });
  console.log(JSON.stringify(results.at(-1)));
}

console.log(JSON.stringify({ chainId, deployer: account.address, spent: formatUnits(spent, 18), results }, null, 2));

const vaultFactory = results[0];
const workspaceFactory = results[1];
upsertEnv(envPath, {
  NEXT_PUBLIC_ARC_CHAIN_ID: "5042",
  NEXT_PUBLIC_ARC_RPC_URL: rpcUrl,
  NEXT_PUBLIC_ARC_EXPLORER_URL: "https://explorer.arc.io",
  NEXT_PUBLIC_FACTORY_ADDRESS: vaultFactory.address,
  NEXT_PUBLIC_FACTORY_DEPLOY_BLOCK: vaultFactory.block,
  NEXT_PUBLIC_WORKSPACE_FACTORY_ADDRESS: workspaceFactory.address,
  NEXT_PUBLIC_WORKSPACE_DEPLOY_BLOCK: workspaceFactory.block,
});
