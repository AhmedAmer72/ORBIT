import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC,
  USDC_ADDRESS,
  chainById,
  encodeExecutePayment,
  erc20Abi,
  factoryAbi,
  floorMaxFeePerGas,
  formatUsdc,
  parseUsdc,
  paymentIdFromLabel,
  readVault,
  simulateVaultCall,
  vaultAbi,
} from "../packages/sdk/src/index";

const envPath = resolve(process.cwd(), ".env");

function loadEnv(path: string) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].trim();
  }
}

function ensureAgentKey() {
  if (process.env.AGENT_PRIVATE_KEY) return;
  const key = generatePrivateKey();
  appendFileSync(envPath, `\nAGENT_PRIVATE_KEY=${key}\n`);
  process.env.AGENT_PRIVATE_KEY = key;
}

loadEnv(envPath);
ensureAgentKey();

const chain = chainById(ARC_TESTNET_CHAIN_ID);
const factory = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as Address;
const owner = privateKeyToAccount(process.env.PRIVATE_KEY as Hex);
const agent = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as Hex);
const publicClient = createPublicClient({ chain, transport: http(ARC_TESTNET_RPC) });
const walletClient = createWalletClient({ chain, transport: http(ARC_TESTNET_RPC) });

const report: string[] = [];

function note(line: string) {
  report.push(line);
  console.log(line);
}

async function send(account: typeof owner, to: Address, data?: Hex, value?: bigint): Promise<TransactionReceipt> {
  const fees = await publicClient.estimateFeesPerGas();
  const maxFeePerGas = floorMaxFeePerGas(fees.maxFeePerGas ?? 0n);
  const quotedTip = fees.maxPriorityFeePerGas ?? 1_000_000_000n;
  const hash = await walletClient.sendTransaction({
    account,
    to,
    data,
    value,
    chain,
    maxFeePerGas,
    maxPriorityFeePerGas: quotedTip > maxFeePerGas ? maxFeePerGas : quotedTip,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted: ${hash}`);
  }
  return receipt;
}

async function expectRevert(account: typeof owner, to: Address, data: Hex, errorName: string) {
  const before = await usdcBalance(to);
  const preview = await simulateVaultCall({
    publicClient: publicClient as PublicClient,
    account: account.address,
    vault: to,
    data,
  });
  if (preview.ok || preview.errorName !== errorName) {
    throw new Error(`Expected ${errorName}, got ${preview.ok ? "success" : (preview.errorName ?? preview.message)}`);
  }
  const after = await usdcBalance(to);
  if (after !== before) throw new Error(`${errorName} changed the USDC balance`);
  note(`revert ${errorName} and USDC unchanged`);
}

async function usdcBalance(account: Address) {
  return publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account],
  });
}

async function main() {
  if (owner.address.toLowerCase() === agent.address.toLowerCase()) {
    throw new Error("The agent must be a different address from the owner.");
  }
  note(`owner ${owner.address}`);
  note(`agent ${agent.address}`);

  const implementation = await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "implementation",
  });
  const usdc = await publicClient.readContract({
    address: implementation,
    abi: vaultAbi,
    functionName: "USDC",
  });
  const decimals = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "decimals",
  });
  if (usdc.toLowerCase() !== USDC_ADDRESS.toLowerCase()) throw new Error("Vault USDC constant is not the official address.");
  if (decimals !== 6) throw new Error("USDC decimals are not 6.");
  note(`implementation ${implementation}`);
  note("USDC constant and decimals match");

  const agentGas = await publicClient.getBalance({ address: agent.address });
  if (agentGas < 5n * 10n ** 17n) {
    const fund = await send(owner, agent.address, undefined, 10n ** 18n);
    note(`fund agent gas ${fund.transactionHash}`);
  } else {
    note("agent already has gas");
  }

  let vault = process.env.SCENARIO_VAULT as Address | undefined;
  if (!vault) {
    const created = await send(
      owner,
      factory,
      encodeFunctionData({ abi: factoryAbi, functionName: "createVault" }),
    );
    vault = parseEventLogs({ abi: factoryAbi, logs: created.logs, eventName: "VaultCreated" })[0]?.args.vault;
    if (!vault) throw new Error("VaultCreated was not in the receipt.");
    note(`create ${created.transactionHash}`);
  }
  const registered = await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "isVault",
    args: [vault],
  });
  if (!registered) throw new Error("Factory did not register the clone.");
  note(`vault ${vault}`);

  const ownerAsAgent = encodeFunctionData({ abi: vaultAbi, functionName: "authorizeAgent", args: [owner.address] });
  await expectRevert(owner, vault, ownerAsAgent, "InvalidAgent");

  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);
  const policy = await send(
    owner,
    vault,
    encodeFunctionData({
      abi: vaultAbi,
      functionName: "updatePolicy",
      args: [parseUsdc("1"), parseUsdc("1"), expiresAt],
    }),
  );
  note(`policy ${policy.transactionHash}`);

  const allow = await send(
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "setRecipient", args: [owner.address, true] }),
  );
  note(`allowlist ${allow.transactionHash}`);

  const depositAmount = parseUsdc("3");
  const ownerBefore = await usdcBalance(owner.address);
  const approve = await send(
    owner,
    USDC_ADDRESS,
    encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, depositAmount] }),
  );
  const deposited = await send(
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "deposit", args: [depositAmount] }),
  );
  const ownerAfter = await usdcBalance(owner.address);
  const vaultState = await readVault(publicClient, vault);
  if (vaultState.balance !== depositAmount) throw new Error(`Vault balance is ${formatUsdc(vaultState.balance)}, expected 3.`);
  if (ownerBefore - ownerAfter < depositAmount) throw new Error("Owner ERC-20 balance did not fall by the deposit.");
  note(`approve ${approve.transactionHash}`);
  note(`deposit ${deposited.transactionHash}`);

  const authorized = await send(
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "authorizeAgent", args: [agent.address] }),
  );
  note(`authorize ${authorized.transactionHash}`);

  const payAmount = parseUsdc("0.25");
  const paymentId = paymentIdFromLabel("scenario-a");
  const ownerPayBefore = await usdcBalance(owner.address);
  const vaultPayBefore = (await readVault(publicClient, vault)).balance;
  const paid = await send(agent, vault, encodeExecutePayment(owner.address, payAmount, paymentId));
  const ownerPayAfter = await usdcBalance(owner.address);
  const vaultPayAfter = (await readVault(publicClient, vault)).balance;
  if (ownerPayAfter - ownerPayBefore !== payAmount) throw new Error("Recipient did not receive 0.25 USDC.");
  if (vaultPayBefore - vaultPayAfter !== payAmount) throw new Error("Vault balance did not fall by 0.25 USDC.");
  note(`scenario A ${paid.transactionHash}`);

  await expectRevert(
    agent,
    vault,
    encodeExecutePayment(owner.address, parseUsdc("2"), paymentIdFromLabel("scenario-b")),
    "AmountExceedsLimit",
  );
  await expectRevert(
    agent,
    vault,
    encodeExecutePayment("0x00000000000000000000000000000000000000b1", parseUsdc("0.1"), paymentIdFromLabel("scenario-c")),
    "RecipientNotApproved",
  );
  await expectRevert(
    agent,
    vault,
    encodeExecutePayment(owner.address, parseUsdc("0.8"), paymentIdFromLabel("scenario-d")),
    "PeriodLimitExceeded",
  );
  await expectRevert(agent, vault, encodeExecutePayment(owner.address, payAmount, paymentId), "PaymentIdUsed");

  const revoked = await send(owner, vault, encodeFunctionData({ abi: vaultAbi, functionName: "revokeAgent" }));
  note(`revoke ${revoked.transactionHash}`);
  await expectRevert(
    agent,
    vault,
    encodeExecutePayment(owner.address, parseUsdc("0.1"), paymentIdFromLabel("scenario-f")),
    "UnauthorizedAgent",
  );

  const paused = await send(owner, vault, encodeFunctionData({ abi: vaultAbi, functionName: "pause" }));
  note(`pause ${paused.transactionHash}`);
  await expectRevert(
    agent,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "withdraw", args: [parseUsdc("0.1")] }),
    "UnauthorizedOwner",
  );
  const remaining = (await readVault(publicClient, vault)).balance;
  const withdrawn = await send(
    owner,
    vault,
    encodeFunctionData({ abi: vaultAbi, functionName: "withdraw", args: [remaining] }),
  );
  if ((await readVault(publicClient, vault)).balance !== 0n) throw new Error("Withdraw left a vault balance.");
  note(`withdraw ${withdrawn.transactionHash}`);
  const unpaused = await send(owner, vault, encodeFunctionData({ abi: vaultAbi, functionName: "unpause" }));
  note(`unpause ${unpaused.transactionHash}`);

  const finalState = await readVault(publicClient, vault);
  if (finalState.paused) throw new Error("Vault remained paused.");
  if (finalState.agent !== "0x0000000000000000000000000000000000000000") throw new Error("Agent was not revoked.");
  note("scenarios complete");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
