import { formatUsdc, vaultAbi } from "@arcbond/sdk";
import type { AbiEvent, Address, Hash, PublicClient } from "viem";

import { logBlockRanges, MAX_LOG_BLOCK_SPAN } from "./log-ranges";

const activityEventNames = ["Deposited", "Withdrawn", "PaymentExecuted"] as const;

type ActivityEventName = (typeof activityEventNames)[number];

const activityEvents = activityEventNames.map((name) => {
  const item = vaultAbi.find((entry) => entry.type === "event" && entry.name === name);
  if (!item) throw new Error(`Missing ${name} event.`);
  return item;
}) as unknown as readonly AbiEvent[];

export type ActivityRow = {
  type: ActivityEventName;
  block: bigint | null;
  index: number;
  hash: Hash | null;
  detail: string;
};

type ActivityArgs = {
  amount?: bigint;
  recipient?: Address;
  from?: Address;
  to?: Address;
};

export async function readVaultActivity(publicClient: PublicClient, vault: Address, fromBlock: bigint, toBlock: bigint) {
  const ranges = logBlockRanges(fromBlock, toBlock, MAX_LOG_BLOCK_SPAN);
  const logs = [];
  for (const range of ranges) {
    logs.push(...(await readRange(publicClient, vault, range.fromBlock, range.toBlock)));
  }
  return logs
    .map(toRow)
    .filter((row) => row.hash)
    .sort((a, b) => Number((b.block ?? 0n) - (a.block ?? 0n)) || b.index - a.index);
}

async function readRange(publicClient: PublicClient, vault: Address, fromBlock: bigint, toBlock: bigint): Promise<ActivitySource[]> {
  try {
    return (await publicClient.getLogs({
      address: vault,
      events: activityEvents,
      fromBlock,
      toBlock,
    })) as ActivitySource[];
  } catch (error) {
    const span = toBlock - fromBlock + 1n;
    const message = error instanceof Error ? error.message : "";
    if (span <= 1n || !/range too large/i.test(message)) throw error;
    const mid = fromBlock + span / 2n - 1n;
    const leftEnd = mid < fromBlock ? fromBlock : mid;
    const rightStart = leftEnd + 1n;
    const left = await readRange(publicClient, vault, fromBlock, leftEnd);
    const right = rightStart <= toBlock ? await readRange(publicClient, vault, rightStart, toBlock) : [];
    return [...left, ...right];
  }
}

type ActivitySource = {
  eventName: string;
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: Hash | null;
  args: ActivityArgs;
};

function toRow(log: ActivitySource): ActivityRow {
  const amount = formatUsdc(log.args.amount ?? 0n);
  const detail =
    log.eventName === "PaymentExecuted"
      ? `${amount} USDC to ${log.args.recipient}`
      : log.eventName === "Deposited"
        ? `${amount} USDC from ${log.args.from}`
        : `${amount} USDC to ${log.args.to}`;
  return {
    type: log.eventName as ActivityEventName,
    block: log.blockNumber,
    index: log.logIndex ?? 0,
    hash: log.transactionHash,
    detail,
  };
}
