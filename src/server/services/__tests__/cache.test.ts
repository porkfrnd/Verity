import { describe, expect, it } from "vitest";
import { clearCache, getCached, setCached } from "../cache.js";
import type { Investigation } from "../../../shared/types.js";

function fakeInv(claim: string): Investigation {
  return {
    id: "inv-test",
    originalClaim: claim,
    extraction: { original_claim: claim, claims: [], searchQueries: {}, verifiability: {} },
    results: [],
    createdAt: new Date().toISOString(),
  };
}

describe("cache", () => {
  it("identical claim hits cache; distinct but similar claims do not collide", () => {
    clearCache();
    setCached("Water boils at 100C.", fakeInv("Water boils at 100C."));
    expect(getCached("Water boils at 100C.")?.cached).toBe(true);
    // Trailing punctuation/case/whitespace normalize to the same claim (intended hit).
    expect(getCached("  water  BOILS at 100c ")).toBeDefined();
    // Genuinely different claims must not collide.
    expect(getCached("Water boils at 90C on Mount Everest.")).toBeUndefined();
  });
});
