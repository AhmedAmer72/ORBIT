/** Inclusive block span the Arc testnet public RPC accepted on 14 Oct 2026. 50,000 was rejected. */
export const MAX_LOG_BLOCK_SPAN = 10_000n;

export function logBlockRanges(fromBlock: bigint, toBlock: bigint, span = MAX_LOG_BLOCK_SPAN) {
  if (span < 1n) throw new Error("Log span must be at least 1 block.");
  if (toBlock < fromBlock) return [];
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  let start = fromBlock;
  while (start <= toBlock) {
    const end = start + span - 1n;
    const to = end > toBlock ? toBlock : end;
    ranges.push({ fromBlock: start, toBlock: to });
    start = to + 1n;
  }
  return ranges;
}
