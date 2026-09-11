import { describe, expect, it } from "vitest";
import { buildQueriesForClaim } from "../claimExtractor.js";

describe("queryGeneration", () => {
  it("produces neutral/supporting/contradicting queries per claim", () => {
    const q = buildQueriesForClaim("The Great Wall is visible from space.");
    expect(Object.keys(q).sort()).toEqual(["contradicting", "neutral", "supporting"]);
    expect(q.contradicting[0]).toMatch(/myth|debunked|false|no evidence/i);
    expect(q.supporting[0]).toMatch(/evidence/i);
  });

  it("handles short claims without throwing", () => {
    expect(() => buildQueriesForClaim("Hi.")).not.toThrow();
  });
});
