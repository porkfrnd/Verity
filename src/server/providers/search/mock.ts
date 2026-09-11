import type { SearchResultItem } from "../../../shared/types.js";
import type { SearchProvider } from "./types.js";

// Deterministic offline provider for tests/CI/demos without keys.
export class MockSearchProvider implements SearchProvider {
  id = "mock";
  private corpus: SearchResultItem[] = [
    {
      title: "NASA - The Great Wall of China from space",
      url: "https://www.nasa.gov/great-wall-from-space",
      snippet: "NASA explains the Great Wall is generally not visible to the naked eye from orbit; photography with lenses is a different matter.",
      content: "Astronauts report the Great Wall is very difficult to see with the naked eye from low Earth orbit. Photographs taken with telephoto lenses do show it under favorable conditions. The claim conflates photographic detection with unaided visibility, which is misleading.",
      sourceType: "government",
    },
    {
      title: "Scientific review: visibility of ground structures from orbit",
      url: "https://example.edu/orbital-visibility-review",
      snippet: "Peer-reviewed review finds large low-contrast structures like the Great Wall are not naked-eye visible from the ISS.",
      content: "A review of orbital visibility studies concludes the Great Wall myth is false for naked-eye observation. Contrast and resolution limits prevent unaided visibility. Study evidence contradicts the claim.",
      sourceType: "academic",
    },
    {
      title: "News explainer: Can you see the Great Wall from space?",
      url: "https://news.example.com/great-wall-space-explainer",
      snippet: "Explainer: occasional radar and telephoto images show segments, but astronauts say no to naked-eye visibility.",
      content: "News explainer summarizing astronaut testimony and expert analysis. Evidence shows occasional photographic detection but contradicts naked-eye visibility.",
      sourceType: "news",
    },
    {
      title: "Blog: ten things visible from space",
      url: "https://blog.example.com/things-visible-from-space",
      snippet: "Blog post repeating the old claim without citations.",
      content: "This blog repeats the claim that the wall is visible from space but offers no evidence, no citations, weak sourcing.",
      sourceType: "blog",
    },
  ];

  async search(query: string): Promise<SearchResultItem[]> {
    const q = query.toLowerCase();
    // Empty-query guard
    if (!q.trim()) return [];
    // Simple relevance: score by token overlap, return top 3 deterministically
    const tokens = q.split(/\W+/).filter((t) => t.length > 2);
    const scored = this.corpus.map((item) => {
      const hay = `${item.title} ${item.snippet}`.toLowerCase();
      let score = 0;
      for (const t of tokens) if (hay.includes(t)) score++;
      return { item, score };
    });
    scored.sort((a, b) => b.score - a.score || a.item.url.localeCompare(b.item.url));
    return scored.slice(0, 3).map((s) => ({ ...s.item }));
  }
}
