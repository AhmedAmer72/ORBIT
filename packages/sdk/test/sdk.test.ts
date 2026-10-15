import { encodeErrorResult, keccak256, stringToHex, toHex } from "viem";
import { describe, expect, it } from "vitest";

import { vaultAbi } from "../src/abi.js";
import { ARC_MAINNET_CHAIN_ID } from "../src/constants.js";
import { decodeVaultError, describeWriteFailure } from "../src/errors.js";
import { floorMaxFeePerGas } from "../src/fees.js";
import { formatUsdc, isUsdcAddress, parseUsdc } from "../src/format.js";
import { isConfiguredChain } from "../src/chain.js";

describe("formatUsdc", () => {
  it("formats and parses 6-decimal base units", () => {
    expect(formatUsdc(2_500_000n)).toBe("2.5");
    expect(parseUsdc("2.5")).toBe(2_500_000n);
    expect(formatUsdc(1n)).toBe("0.000001");
  });
});

describe("fees", () => {
  it("never returns below 20 gwei", () => {
    expect(floorMaxFeePerGas(1n)).toBe(20_000_000_000n);
    expect(floorMaxFeePerGas(25_000_000_000n)).toBe(25_000_000_000n);
  });
});

describe("errors", () => {
  it("decodes custom vault errors", () => {
    const data = encodeErrorResult({ abi: vaultAbi, errorName: "AmountExceedsLimit" });
    expect(decodeVaultError(data)).toBe("AmountExceedsLimit");
    expect(describeWriteFailure({ message: data }).kind).toBe("rejection");
  });
});

describe("chain gate", () => {
  it("accepts only the configured chain id", () => {
    expect(isConfiguredChain(5042, ARC_MAINNET_CHAIN_ID)).toBe(true);
    expect(isConfiguredChain(1, ARC_MAINNET_CHAIN_ID)).toBe(false);
    expect(isConfiguredChain(undefined, ARC_MAINNET_CHAIN_ID)).toBe(false);
  });
});

describe("addresses", () => {
  it("rejects the zero address", () => {
    expect(isUsdcAddress("0x0000000000000000000000000000000000000000")).toBe(false);
    expect(isUsdcAddress("0x3600000000000000000000000000000000000000")).toBe(true);
  });
});

describe("keccak helper sanity", () => {
  it("uses 6-decimal units rather than 18-decimal native units", () => {
    expect(parseUsdc("1")).not.toBe(10n ** 18n);
    expect(parseUsdc("1")).toBe(1_000_000n);
    expect(keccak256(stringToHex("payment-a")).startsWith("0x")).toBe(true);
    expect(toHex(1).startsWith("0x")).toBe(true);
  });
});
