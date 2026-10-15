import { createPublicClient, http } from "viem";
import { arcMainnet } from "@arcbond/sdk";

const client = createPublicClient({ chain: arcMainnet, transport: http("https://rpc.mainnet.arc.io") });
const versionAbi = [{ type: "function", name: "VERSION", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] }];
const implAbi = [{ type: "function", name: "implementation", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }];
const factory = "0xa9cdb36a8c1e20755ae294eff6978525a1f01a1d";
const workspace = "0x8fb1a3cff48ec873ef0526a902425813979c7b9e";
const chainId = await client.getChainId();
const factoryVersion = await client.readContract({ address: factory, abi: versionAbi, functionName: "VERSION" });
const implementation = await client.readContract({ address: factory, abi: implAbi, functionName: "implementation" });
const workspaceVersion = await client.readContract({ address: workspace, abi: versionAbi, functionName: "VERSION" });
const workspaceImpl = await client.readContract({ address: workspace, abi: implAbi, functionName: "implementation" });
const factoryCode = await client.getBytecode({ address: factory });
const implCode = await client.getBytecode({ address: implementation });
console.log(JSON.stringify({
  chainId,
  factoryVersion: factoryVersion.toString(),
  implementation,
  factoryBytes: factoryCode ? (factoryCode.length - 2) / 2 : 0,
  implBytes: implCode ? (implCode.length - 2) / 2 : 0,
  workspaceVersion: workspaceVersion.toString(),
  workspaceImpl,
}, null, 2));
