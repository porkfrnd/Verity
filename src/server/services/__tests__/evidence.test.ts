import { describe, expect, it } from "vitest";
import { evidenceAnalysisSchema, verdictSchema } from "../../../shared/schemas.js";

describe("evidence analyzer schema", () => {
  const valid = {
    claimId: "claim-1",
    verdict: "mostly_false",
    confidence: "high",
    summary: "Misleading framing.",
    evidence: [{ sourceId: "source-1", stance: "contradicts", strength: "strong", reason: "Astronaut testimony." }],
    contradictions: [],
    missing_information: [],
    reasoning_summary: "Three strong contradicts.",
  };

  it("accepts valid shapes", () => {
    expect(evidenceAnalysisSchema.parse(valid).verdict).toBe("mostly_false");
  });

  it("rejects malformed LLM JSON (missing fields, wrong enums, hallucinated fields)", () => {
    expect(() => evidenceAnalysisSchema.parse({ ...valid, verdict: "87% true" })).toThrow();
    expect(() => evidenceAnalysisSchema.parse({ ...valid, confidence: "91.4%" })).toThrow();
    expect(() => evidenceAnalysisSchema.parse({ ...valid, extra: "hallucinated" })).toThrow();
    expect(() => evidenceAnalysisSchema.parse({ ...valid, evidence: [] , summary: "" })).toThrow();
  });
});

describe("verdictParsing", () => {
  it("every verdict enum value round-trips", () => {
    for (const v of ["true", "mostly_true", "mixed", "mostly_false", "false", "unverified", "not_a_factual_claim"]) {
      expect(verdictSchema.parse(v)).toBe(v);
    }
  });
  it("unknown/hallucinated verdicts are rejected", () => {
    expect(() => verdictSchema.parse("TRUE!!")).toThrow();
    expect(() => verdictSchema.parse("87% true")).toThrow();
  });
});
