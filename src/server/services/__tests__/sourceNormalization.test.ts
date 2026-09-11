import { describe, expect, it } from "vitest";
import { normalizeResults } from "../sources.js";

describe("sourceNormalization", () => {
  it("normalizes malformed/partial provider responses without throwing", () => {
    expect(() =>
      normalizeResults([
        { title: "", url: "not-a-url" },
        { title: "Has title", url: "https://example.com/a", snippet: "<p>Hello <b>world</b></p>" },
      ])
    ).not.toThrow();
    const out = normalizeResults([{ title: "T", url: "https://example.com/a", snippet: "<p>Hi</p>" }]);
    expect(out[0].domain).toBe("example.com");
    expect(out[0].content).not.toMatch(/<p>/);
  });

  it("drops non-http urls", () => {
    expect(normalizeResults([{ title: "x", url: "ftp://example.com/f" }])).toHaveLength(0);
  });
});
