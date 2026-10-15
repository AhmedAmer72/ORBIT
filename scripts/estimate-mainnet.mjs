import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { arcMainnet, USDC_ADDRESS } from "@arcbond/sdk";
import { createPublicClient, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const index = trimmed.indexOf("=");
  env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
}
const publicClient = createPublicClient({ chain: arcMainnet, transport: http("https://rpc.mainnet.arc.io") });
const chainId = await publicClient.getChainId();
const account = privateKeyToAccount(env.PRIVATE_KEY);
const gasPrice = await publicClient.getGasPrice();
const floor = 20_000_000_000n;
const maxFee = (gasPrice > floor ? gasPrice : floor) + 10_000_000_000n;
const balance = await publicClient.getBalance({ address: account.address });
const names = [
  "ArcBondVaultFactory.sol/ArcBondVaultFactory.json",
  "ArcBondWorkspaceFactory.sol/ArcBondWorkspaceFactory.json",
];
let total = 0n;
const rows = [];
for (const name of names) {
  const artifact = JSON.parse(fs.readFileSync(path.join(root, "contracts", "out", name), "utf8"));
  const gas = await publicClient.estimateGas({ account, data: artifact.bytecode.object });
  const buffered = (gas * 12n) / 10n;
  const cost = buffered * maxFee;
  total += cost;
  rows.push({ contract: name.split("/")[0], gas: gas.toString(), cost: formatUnits(cost, 18) });
}
console.log(JSON.stringify({ chainId, usdc: USDC_ADDRESS, deployer: account.address, balance: formatUnits(balance, 18), rows, total: formatUnits(total, 18) }, null, 2));
