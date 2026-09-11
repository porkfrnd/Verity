import { describe, expect, it } from "vitest";
import { labelQuality, normalizeResults } from "../sources.js";

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

  it("propagates the fact-check flag so the UI can split prior fact-checks", () => {
    const out = normalizeResults([
      { title: "Rated false", url: "https://factcheck.example.com/r", sourceType: "organization", isFactCheck: true },
      { title: "Plain hit", url: "https://example.com/a" },
    ]);
    expect(out[0].isFactCheck).toBe(true);
    expect(out[1].isFactCheck).toBeUndefined();
  });

  it("labels stale dated sources Outdated instead of presenting them as current", () => {
    const old = {
      id: "source-1",
      title: "Old news",
      url: "https://news.example.com/old",
      domain: "news.example.com",
      sourceType: "news" as const,
      publishedAt: "2015-01-01",
      content: "x ".repeat(300),
    };
    expect(labelQuality(old)).toBe("Outdated");
    expect(labelQuality({ ...old, publishedAt: new Date().toISOString() })).not.toBe("Outdated");
  });
});
