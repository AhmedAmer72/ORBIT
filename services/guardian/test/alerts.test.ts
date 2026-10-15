import { describe, expect, it } from "vitest";

import { evaluateGuardian } from "@arcbond/sdk";

describe("guardian package", () => {
  it("returns no alerts when there are no facts", () => {
    expect(evaluateGuardian([], 1)).toEqual([]);
  });
});
