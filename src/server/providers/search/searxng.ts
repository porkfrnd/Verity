import type { SearchResultItem } from "../../../shared/types.js";
import { safeError } from "../../utils/redact.js";
import { describeError, ProviderError, type SearchProvider } from "./types.js";

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

  async search(query: string, opts?: { count?: number; signal?: AbortSignal; timeoutMs?: number }): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q) return [];
    if (!this.baseUrl) throw new ProviderError("SearXNG is not configured (missing SEARXNG_URL)");
    if (opts?.signal?.aborted) throw new ProviderError("SearXNG search aborted", { timeout: true });
    const timeout = AbortSignal.timeout(opts?.timeoutMs ?? 15000);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const res = await this.fetchFn(
        `${this.baseUrl}/search?q=${encodeURIComponent(q)}&format=json`,
        {
          signal,
          headers: { "User-Agent": "Verity/0.1", Accept: "application/json" },
        }
      );
      if (!res.ok) throw new ProviderError(`SearXNG search failed with status ${res.status}`, { httpStatus: res.status, category: "http" });
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
      if (e instanceof ProviderError) {
        safeError("SearXNGSearchProvider failed", { queryLength: q.length, reason: e.message, cause: describeError(e) });
        throw e;
      }
      const timeoutFailure = e instanceof DOMException && e.name === "AbortError";
      const err = new ProviderError(
        timeoutFailure ? "SearXNG search timed out" : `SearXNG search failed: ${e instanceof Error ? e.message : "unknown error"}`,
        timeoutFailure ? { timeout: true } : undefined
      );
      safeError("SearXNGSearchProvider failed", { queryLength: q.length, reason: err.message, cause: describeError(e) });
      throw err;
    }
  }
}
