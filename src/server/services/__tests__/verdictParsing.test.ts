import { describe, expect, it } from "vitest";
import { verdictSchema, claimExtractionSchema, contradictionSchema } from "../../../shared/schemas.js";

describe("verdictParsing + contracts", () => {
  it("verdict enum round-trips", () => {
    for (const v of ["true", "mostly_true", "mixed", "mostly_false", "false", "unverified", "not_a_factual_claim"] as const) {
      expect(verdictSchema.parse(v)).toBe(v);
    }
  });

  it("claim extraction schema rejects non-JSON shapes", () => {
    expect(() =>
      claimExtractionSchema.parse({ original_claim: "x", claims: [], searchQueries: {}, verifiability: {} })
    ).toThrow();
  });

  it("contradiction statuses include not_a_real_contradiction", () => {
    const c = {
      topic: "t",
      sourceA: "source-1",
      sourceB: "source-2",
      conflict: "a vs b",
      resolution: "different things",
      status: "not_a_real_contradiction",
    };
    expect(contradictionSchema.parse(c).status).toBe("not_a_real_contradiction");
  });
});
