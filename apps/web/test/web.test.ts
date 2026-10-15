import { describe, expect, it } from "vitest";

import { floorMaxFeePerGas, formatUsdc, isConfiguredChain } from "@arcbond/sdk";

import { loadAppConfig } from "../src/lib/config";
import { mergeVaults } from "../src/lib/known-vaults";
import { cappedLogRanges, logBlockRanges } from "../src/lib/log-ranges";

describe("app config", () => {
  it("defaults to Arc testnet and an empty factory", () => {
    const config = loadAppConfig();
    expect(config.chainId).toBe(5042002);
    expect(config.factory).toBeUndefined();
    expect(config.usdc).toBe("0x3600000000000000000000000000000000000000");
  });
});

describe("write gate helpers", () => {
  it("disables writes on the wrong chain", () => {
    expect(isConfiguredChain(1, 5042)).toBe(false);
    expect(isConfiguredChain(5042, 5042)).toBe(true);
  });

  it("keeps the 20 gwei fee floor", () => {
    expect(floorMaxFeePerGas(0n)).toBe(20_000_000_000n);
  });

  it("formats 6-decimal USDC", () => {
    expect(formatUsdc(1_000_000n)).toBe("1");
  });
});

describe("known vaults", () => {
  it("keeps the first copy of a vault address", () => {
    const first = "0x0000000000000000000000000000000000000001" as const;
    const second = "0x0000000000000000000000000000000000000002" as const;
    expect(mergeVaults([first], [first, second])).toEqual([first, second]);
  });
});

describe("log ranges", () => {
  it("splits a span the Arc testnet RPC rejects into 10,000-block windows", () => {
    const ranges = logBlockRanges(67_052_589n, 67_063_078n);
    expect(ranges).toEqual([
      { fromBlock: 67_052_589n, toBlock: 67_062_588n },
      { fromBlock: 67_062_589n, toBlock: 67_063_078n },
    ]);
  });

  it("returns one window when the span already fits", () => {
    expect(logBlockRanges(5n, 5n)).toEqual([{ fromBlock: 5n, toBlock: 5n }]);
  });

  it("keeps only the newest log windows", () => {
    const capped = cappedLogRanges(0n, 49_999n, 2, 10_000n);
    expect(capped.truncated).toBe(true);
    expect(capped.ranges).toEqual([
      { fromBlock: 30_000n, toBlock: 39_999n },
      { fromBlock: 40_000n, toBlock: 49_999n },
    ]);
  });
});
