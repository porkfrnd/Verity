import { describe, expect, it } from "vitest";
import { claimExtractionSchema, evidenceAnalysisSchema, investigateRequestSchema } from "../schemas.js";

describe("schema contracts", () => {
  it("investigate request rejects empty claims", () => {
    expect(investigateRequestSchema.safeParse({ claim: "" }).success).toBe(false);
    expect(investigateRequestSchema.safeParse({ claim: "Water boils." }).success).toBe(true);
  });

  it("claim extraction accepts the §5 example shape", () => {
    const example = {
      original_claim: "Vitamin C prevents colds and taking large doses makes you healthier.",
      claims: [
        { id: "claim-1", text: "Vitamin C prevents colds.", type: "medical", importance: "primary" },
        { id: "claim-2", text: "Large doses of vitamin C improve health.", type: "medical", importance: "primary" },
      ],
      searchQueries: {
        "claim-1": { neutral: ["vitamin C and colds"], supporting: ["evidence vitamin C prevents colds"], contradicting: ["vitamin C does not prevent colds studies"] },
        "claim-2": { neutral: ["vitamin C megadose health"], supporting: ["evidence megadose vitamin C health"], contradicting: ["vitamin C megadose no benefit"] },
      },
      verifiability: {
        "claim-1": { checkable: true, reason: "well-studied, has meta-analyses" },
        "claim-2": { checkable: true, reason: "studied" },
      },
    };
    expect(claimExtractionSchema.parse(example).claims).toHaveLength(2);
  });

  it("evidence analysis rejects hallucinated verdicts", () => {
    expect(() =>
      evidenceAnalysisSchema.parse({
        claimId: "claim-1",
        verdict: "super_true",
        confidence: "high",
        summary: "x",
        evidence: [],
        contradictions: [],
        missing_information: [],
        reasoning_summary: "y",
      })
    ).toThrow();
  });
});
