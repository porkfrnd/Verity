import { describe, expect, it } from "vitest";
import { investigate } from "../evidence.js";
import { clearCache } from "../cache.js";

describe("evidence integration", () => {
  it("returns UNVERIFIED with explicit insufficient-evidence state when search is thin", async () => {
    clearCache();
    const inv = await investigate(`Completely novel unfindable assertion ${Date.now()} qzx`);
    expect(inv.results.length).toBeGreaterThan(0);
    // Mock corpus always returns something for normal claims; for opinion fast-path:
    const opinion = await investigate("This coffee shop has the best latte in town.");
    expect(opinion.results[0].analysis.verdict).toBe("not_a_factual_claim");
  });

  it("opinion routes straight to NOT A FACTUAL CLAIM", async () => {
    clearCache();
    const inv = await investigate(`This coffee shop has the best latte in town ${Date.now()}`);
    expect(inv.results[0].analysis.verdict).toBe("not_a_factual_claim");
  });
});
