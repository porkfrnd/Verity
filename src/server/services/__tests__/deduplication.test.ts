import { describe, expect, it } from "vitest";
import type { Source } from "../../../shared/types.js";
import { deduplicateSources } from "../sources.js";

function src(partial: Partial<Source> & { id: string; url: string }): Source {
  return {
    title: "Title",
    domain: "example.com",
    sourceType: "news",
    ...partial,
  } as Source;
}

describe("deduplication", () => {
  it("merges canonical URL duplicates (tracking params, case, trailing slash)", () => {
    const a = src({ id: "source-1", url: "https://Example.com/article?utm_source=x", title: "Same story" });
    const b = src({ id: "source-2", url: "https://example.com/article", title: "Same story" });
    expect(deduplicateSources([a, b])).toHaveLength(1);
  });

  it("merges same-domain near-duplicate titles", () => {
    const a = src({ id: "source-1", url: "https://example.com/a", title: "NASA says wall not visible from space orbit" });
    const b = src({ id: "source-2", url: "https://example.com/b", title: "NASA says wall not visible from space orbit" });
    expect(deduplicateSources([a, b])).toHaveLength(1);
  });

  it("does NOT merge near-duplicate but distinct articles", () => {
    const a = src({ id: "source-1", url: "https://a.com/x", title: "Vitamin C prevents colds, study finds" });
    const b = src({ id: "source-2", url: "https://b.com/y", title: "Local bakery wins award for sourdough" });
    expect(deduplicateSources([a, b])).toHaveLength(2);
  });
});
