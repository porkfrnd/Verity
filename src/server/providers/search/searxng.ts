import type { SearchResultItem } from "../../../shared/types.js";
import { safeError } from "../../utils/redact.js";
import type { SearchProvider } from "./types.js";

/**
 * Self-hosted SearXNG metasearch (open-source, aggregates multiple engines,
 * JSON API, no per-query cost). Recommended upgrade path from the DuckDuckGo
 * scraper: set SEARXNG_URL to the instance base URL.
 */
export class SearXNGSearchProvider implements SearchProvider {
  id = "searxng";
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(opts?: { baseUrl?: string; fetchFn?: typeof fetch }) {
    this.baseUrl = (opts?.baseUrl ?? process.env.SEARXNG_URL ?? "").replace(/\/+$/, "");
    this.fetchFn = opts?.fetchFn ?? fetch;
  }

  async search(query: string, opts?: { count?: number; signal?: AbortSignal }): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q) return [];
    if (!this.baseUrl) throw new Error("SearXNG is not configured (missing SEARXNG_URL)");
    if (opts?.signal?.aborted) throw new Error("SearXNG search aborted");
    const timeout = AbortSignal.timeout(15000);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const res = await this.fetchFn(
        `${this.baseUrl}/search?q=${encodeURIComponent(q)}&format=json`,
        {
          signal,
          headers: { "User-Agent": "Verity/0.1", Accept: "application/json" },
        }
      );
      if (!res.ok) throw new Error(`SearXNG search failed with status ${res.status}`);
      const data = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      return (data.results ?? [])
        .map((r) => ({
          title: (r.title ?? "Untitled").slice(0, 300),
          url: (r.url ?? "").trim(),
          snippet: r.content?.slice(0, 800),
          // No sourceType: normalization infers it from the domain.
        }))
        .filter((r) => /^https?:\/\//i.test(r.url))
        .slice(0, opts?.count ?? 5);
    } catch (e) {
      safeError("SearXNGSearchProvider failed", {
        queryLength: q.length,
        reason: e instanceof Error ? e.message : "unknown",
      });
      throw e instanceof Error ? e : new Error("SearXNG search failed");
    }
  }
}
