import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  arcTestnet,
  erc20Abi,
  factoryAbi,
  readFactoryVersion,
  USDC_ADDRESS,
  vaultAbi,
} from "@arcbond/sdk";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEventLogs,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const rpcUrl = "https://rpc.testnet.arc.io";
const chain = arcTestnet;

function readEnv(file) {
  const env = {};
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
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

function requireKey(env, name) {
  const value = env[name];
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} is missing from .env.`);
  }
  return value;
}

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const observedChainId = await publicClient.getChainId();
if (observedChainId !== 5042002 || rpcUrl !== "https://rpc.testnet.arc.io") {
  throw new Error(`Refusing testnet deploy. RPC chain id is ${observedChainId}.`);
}

async function feeFields() {
  const gasPrice = await publicClient.getGasPrice();
  const floor = 20_000_000_000n;
  const maxFeePerGas = (gasPrice > floor ? gasPrice : floor) + 10_000_000_000n;
  return { maxFeePerGas, maxPriorityFeePerGas: 1_000_000_000n };
}

async function send(wallet, account, to, data, value = 0n) {
  const fees = await feeFields();
  const request = { account, data, value };
  if (to) request.to = to;
  const gas = await publicClient.estimateGas(request);
  const hash = await wallet.sendTransaction({
    ...request,
    chain,
    gas: (gas * 12n) / 10n,
    ...fees,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

const env = readEnv(envPath);
const ownerKey = requireKey(env, "PRIVATE_KEY");
const agentKey = requireKey(env, "AGENT_PRIVATE_KEY");
const owner = privateKeyToAccount(ownerKey);
const agent = privateKeyToAccount(agentKey);
if (owner.address.toLowerCase() === agent.address.toLowerCase()) {
  throw new Error("The owner key and the agent key are the same. They must be different accounts.");
}

const ownerWallet = createWalletClient({ account: owner, chain, transport: http(rpcUrl) });
let factory = env.NEXT_PUBLIC_FACTORY_ADDRESS;
let deployment = factory ? await readFactoryVersion(publicClient, factory) : { version: null, supportsPaymentIntents: false };

if (!deployment.supportsPaymentIntents) {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(root, "contracts", "out", "ArcBondVaultFactory.sol", "ArcBondVaultFactory.json"), "utf8"),
  );
  const bytecode = artifact.bytecode.object;
  console.log(`deploying factory version 2 from ${owner.address}`);
  const receipt = await send(ownerWallet, owner, undefined, bytecode);
  factory = receipt.contractAddress;
  if (!factory) throw new Error("Factory deployment did not return an address.");
  deployment = await readFactoryVersion(publicClient, factory);
  if (!deployment.supportsPaymentIntents || deployment.version !== 2n) {
    throw new Error(`Deployed factory ${factory} did not report version 2.`);
  }
  const implementation = await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "implementation",
  });
  console.log(`factory=${factory}`);
  console.log(`implementation=${implementation}`);
  console.log(`version=${deployment.version}`);
  console.log(`deployTx=${receipt.transactionHash}`);
  console.log(`deployBlock=${receipt.blockNumber}`);
  upsertEnv(envPath, {
    NEXT_PUBLIC_FACTORY_ADDRESS: factory,
    NEXT_PUBLIC_FACTORY_DEPLOY_BLOCK: receipt.blockNumber.toString(),
    PAY_FACTORY_ADDRESS: factory,
    PAY_START_BLOCK: receipt.blockNumber.toString(),
    PAY_CHAIN_ID: "5042002",
    PAY_RPC_URL: rpcUrl,
    NEXT_PUBLIC_PAY_API_URL: "http://127.0.0.1:8787",
  });
} else {
  console.log(`factory already supports intents at ${factory} version ${deployment.version}`);
}

const fresh = readEnv(envPath);
let relayerKey = fresh.PAY_RELAYER_PRIVATE_KEY;
if (!relayerKey || !/^0x[0-9a-fA-F]{64}$/.test(relayerKey)) {
  relayerKey = generatePrivateKey();
  upsertEnv(envPath, { PAY_RELAYER_PRIVATE_KEY: relayerKey });
  console.log("created a new relayer key in .env");
}
const relayer = privateKeyToAccount(relayerKey);
if (relayer.address.toLowerCase() === owner.address.toLowerCase() || relayer.address.toLowerCase() === agent.address.toLowerCase()) {
  throw new Error("The relayer must not be the owner or the agent.");
}

const provider = fresh.PAY_PROVIDER_RECIPIENT && /^0x[0-9a-fA-F]{40}$/.test(fresh.PAY_PROVIDER_RECIPIENT)
  ? fresh.PAY_PROVIDER_RECIPIENT
  : owner.address;
upsertEnv(envPath, { PAY_PROVIDER_RECIPIENT: provider });

const relayerNative = await publicClient.getBalance({ address: relayer.address });
if (relayerNative < 500_000_000_000_000_000n) {
  console.log(`funding relayer ${relayer.address}`);
  const funded = await send(ownerWallet, owner, relayer.address, "0x", 1_000_000_000_000_000_000n);
  console.log(`relayerFundTx=${funded.transactionHash}`);
}

let vault = fresh.PAY_DEMO_VAULT;
const registered = vault
  ? await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: "isVault", args: [vault] })
  : false;
if (!registered) {
  console.log("creating a version 2 vault");
  const created = await send(
    ownerWallet,
    owner,
    factory,
    encodeFunctionData({ abi: factoryAbi, functionName: "createVault" }),
  );
  const events = parseEventLogs({ abi: factoryAbi, logs: created.logs, eventName: "VaultCreated" });
  vault = events[0]?.args.vault;
  if (!vault) throw new Error("VaultCreated was not emitted.");
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
  await send(
    ownerWallet,
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "updatePolicy", args: [1_000_000n, 5_000_000n, expiresAt] }),
  );
  await send(
    ownerWallet,
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "setRecipient", args: [provider, true] }),
  );
  await send(
    ownerWallet,
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "authorizeAgent", args: [agent.address] }),
  );
  const deposit = 1_000_000n;
  await send(
    ownerWallet,
    owner,
    USDC_ADDRESS,
    encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, deposit] }),
  );
  await send(
    ownerWallet,
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [deposit] }),
  );
  upsertEnv(envPath, { PAY_DEMO_VAULT: vault });
  console.log(`vault=${vault}`);
  console.log(`vaultCreateTx=${created.transactionHash}`);
}

console.log(`owner=${owner.address}`);
console.log(`agent=${agent.address}`);
console.log(`relayer=${relayer.address}`);
console.log(`provider=${provider}`);
console.log(`vault=${vault}`);
console.log(`factory=${factory}`);
