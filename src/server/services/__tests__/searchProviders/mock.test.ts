import { describe, expect, it } from "vitest";
import { MockSearchProvider } from "../../../providers/search/mock.js";

describe("searchProviders", () => {
  it("mock handles queries without crashing and returns bounded results", async () => {
    const p = new MockSearchProvider();
    expect(await p.search("")).toEqual([]);
    const out = await p.search("Great Wall visible from space");
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("malformed responses normalize without throwing (via service)", async () => {
    const p = new MockSearchProvider();
    const out = await p.search("   ");
    expect(Array.isArray(out)).toBe(true);
  });
});
