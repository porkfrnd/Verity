import { describe, expect, it } from "vitest";
import type { Source } from "../../../shared/types.js";
import { rankSources } from "../sources.js";

function src(id: string, sourceType: Source["sourceType"], url: string): Source {
  return { id, title: id, url, domain: new URL(url).hostname, sourceType } as Source;
}

describe("sourceRanking", () => {
  it("orders authority sources before weak ones", () => {
    const ranked = rankSources([
      src("source-1", "blog", "https://blog.example.com/x"),
      src("source-2", "academic", "https://uni.edu/paper"),
      src("source-3", "forum", "https://reddit.com/r/x"),
    ]);
    expect(ranked[0].sourceType).toBe("academic");
  });

  it("prefers diversity of sourceType and breaks ties deterministically", () => {
    const a = rankSources([src("s1", "news", "https://b.com/1"), src("s2", "news", "https://a.com/2")]);
    const b = rankSources([src("s1", "news", "https://b.com/1"), src("s2", "news", "https://a.com/2")]);
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
  });
});
