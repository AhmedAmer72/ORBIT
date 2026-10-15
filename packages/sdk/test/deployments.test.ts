import { describe, expect, it } from "vitest";

import {
  arcTestnetFactoryV1,
  arcTestnetFactoryV2,
  arcTestnetWorkspaceFactory,
  FACTORY_VERSION_WITH_INTENTS,
  sourceFactoryV2,
} from "../src/deployments";

describe("factory deployments", () => {
  it("keeps the live Arc Testnet factory on the pre-intent generation", () => {
    expect(arcTestnetFactoryV1.supportsPaymentIntents).toBe(false);
    expect(arcTestnetFactoryV1.factory).toBe("0xA9Cdb36A8c1E20755AE294eff6978525A1f01a1d");
    expect(arcTestnetFactoryV1.deployBlock).toBe(67052589n);
  });

  it("records the Arc Testnet version 2 factory that supports intents", () => {
    expect(sourceFactoryV2).toBe(arcTestnetFactoryV2);
    expect(arcTestnetFactoryV2.version).toBe(FACTORY_VERSION_WITH_INTENTS);
    expect(arcTestnetFactoryV2.supportsPaymentIntents).toBe(true);
    expect(arcTestnetFactoryV2.factory).toBe("0x50ab19e57dff6f2de6e8f3a17ef96417f39cb793");
    expect(arcTestnetFactoryV2.deployBlock).toBe(67213321n);
  });

  it("records the workspace factory separately from the vault factories", () => {
    expect(arcTestnetWorkspaceFactory.factory).not.toBe(arcTestnetFactoryV2.factory);
    expect(arcTestnetWorkspaceFactory.version).toBe(1n);
    expect(arcTestnetWorkspaceFactory.deployBlock).toBe(67226927n);
  });
});
