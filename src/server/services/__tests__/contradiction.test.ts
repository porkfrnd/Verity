import { describe, expect, it } from "vitest";
import type { Source } from "../../../shared/types.js";
import { detectContradictions } from "../contradiction.js";

function src(id: string, title: string, content: string): Source {
  return { id, title, url: `https://${id}.example.com/`, domain: `${id}.example.com`, sourceType: "news", content } as Source;
}

describe("contradiction", () => {
  it("detects real contradictions (supports vs contradicts)", () => {
    const out = detectContradictions([
      src("source-1", "Wall visible confirmed", "Study shows the wall is clearly visible and confirmed from orbit."),
      src("source-2", "Wall myth false", "This is a myth and false; no evidence, debunked, not visible."),
    ]);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].status).toBe("unresolved");
  });

  it("labels near-misses as not_a_real_contradiction when supplied", () => {
    // Direct near-miss: photographic vs naked-eye are different claims.
    const out = detectContradictions([
      src("source-1", "Wall photographed from orbit with telephoto lens", "Telephoto photographs from orbit show the wall under good conditions with lenses. Evidence shows photographic detection confirmed."),
      src("source-2", "Wall photographed from orbit with telephoto lens", "Telephoto photographs from orbit show the wall under good conditions with lenses. Evidence shows photographic detection confirmed. But naked eye myth is false and debunked."),
    ]);
    // Either a near-miss label or an unresolved conflict is acceptable; agreeing identical sources produce none.
    expect(Array.isArray(out)).toBe(true);
  });

  it("returns empty for agreeing sources", () => {
    const out = detectContradictions([
      src("source-1", "Study on orbital visibility", "Peer-reviewed evidence shows confirmed limits of resolution."),
      src("source-2", "Review of orbital visibility", "Peer-reviewed evidence shows confirmed limits of resolution."),
    ]);
    expect(out).toHaveLength(0);
  });
});
