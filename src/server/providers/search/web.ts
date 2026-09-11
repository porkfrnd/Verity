import type { SearchResultItem } from "../../../shared/types.js";
import { safeError } from "../../utils/redact.js";
import type { SearchProvider } from "./types.js";

// Generic REST web search (Tavily-compatible). Only used when TAVILY_API_KEY is set.
// Never called from the browser bundle.
export class WebSearchProvider implements SearchProvider {
  id = "web";
  private apiKey: string;
  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.TAVILY_API_KEY ?? "";
  }
  async search(query: string, opts?: { count?: number }): Promise<SearchResultItem[]> {
    if (!this.apiKey) throw new Error("Web search is not configured (missing TAVILY_API_KEY)");
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal: opts && "signal" in opts ? (opts as { signal?: AbortSignal }).signal : undefined,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: this.apiKey, query, max_results: opts?.count ?? 5, search_depth: "advanced" }),
      });
      if (!res.ok) throw new Error(`Web search failed with status ${res.status}`);
      const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; snippet?: string; content?: string }> };
      return (data.results ?? []).slice(0, opts?.count ?? 5).map((r) => ({
        title: r.title ?? "Untitled",
        url: r.url ?? "",
        snippet: r.snippet,
        content: r.content,
        sourceType: "unknown" as const,
      })).filter((r) => r.url);
    } catch (e) {
      safeError("WebSearchProvider failed", { query });
      throw e instanceof Error ? e : new Error("Web search failed");
    }
  }
}

// Google Fact Check Tools API — optional distinct signal ("Prior fact-checks found").
export class FactCheckProvider implements SearchProvider {
  id = "factcheck";
  private apiKey: string;
  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.FACTCHECK_API_KEY ?? "";
  }
  async search(query: string): Promise<SearchResultItem[]> {
    if (!this.apiKey) return [];
    try {
      const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(query)}&key=${this.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        claims?: Array<{ text?: string; claimReview?: Array<{ publisher?: { name?: string }; url?: string; title?: string; reviewRating?: { textualRating?: string } }> }>;
      };
      const out: SearchResultItem[] = [];
      for (const c of data.claims ?? []) {
        for (const r of c.claimReview ?? []) {
          if (!r.url) continue;
          out.push({
            title: r.title ?? `Fact-check: ${c.text ?? query}`,
            url: r.url,
            snippet: `Rated: ${r.reviewRating?.textualRating ?? "see review"} — ${c.text ?? ""}`,
            sourceType: "organization",
          });
        }
      }
      return out.slice(0, 5);
    } catch {
      return [];
    }
  }
}
