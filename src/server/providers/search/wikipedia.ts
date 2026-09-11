import type { SearchResultItem } from "../../../shared/types.js";
import { safeError } from "../../utils/redact.js";
import { decodeEntities, normalizeWhitespace } from "../../utils/text.js";
import type { SearchProvider } from "./types.js";

/** Strip HTML highlight tags from MediaWiki search snippets. */
export function cleanWikiSnippet(html: string): string {
  return normalizeWhitespace(decodeEntities(html.replace(/<[^>]+>/g, " "))).slice(0, 800);
}

/**
 * Wikipedia reference search via the public MediaWiki API — free, no key,
 * no scraping. Best for well-known factual entities (people, places, events,
 * concepts); weak for breaking news or niche claims, which is why it runs
 * alongside web search rather than replacing it.
 */
export class WikipediaSearchProvider implements SearchProvider {
  id = "wikipedia";
  private fetchFn: typeof fetch;
  private language: string;

  constructor(opts?: { fetchFn?: typeof fetch; language?: string }) {
    this.fetchFn = opts?.fetchFn ?? fetch;
    this.language = opts?.language ?? process.env.WIKIPEDIA_LANG ?? "en";
  }

  async search(query: string, opts?: { count?: number; signal?: AbortSignal }): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q) return [];
    if (opts?.signal?.aborted) throw new Error("Wikipedia search aborted");
    const timeout = AbortSignal.timeout(15000);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const url =
        `https://${this.language}.wikipedia.org/w/api.php` +
        `?action=query&list=search&srsearch=${encodeURIComponent(q)}` +
        `&srlimit=${opts?.count ?? 5}&format=json&origin=*`;
      const res = await this.fetchFn(url, {
        signal,
        headers: { "User-Agent": "Verity/0.1 (evidence-based claim verification)", Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Wikipedia search failed with status ${res.status}`);
      const data = (await res.json()) as {
        query?: { search?: Array<{ title?: string; snippet?: string }> };
      };
      return (data.query?.search ?? []).slice(0, opts?.count ?? 5).map((r) => {
        const title = (r.title ?? "Untitled").slice(0, 300);
        return {
          title,
          url: `https://${this.language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
          snippet: r.snippet ? cleanWikiSnippet(r.snippet) : undefined,
          sourceType: "organization" as const,
        };
      });
    } catch (e) {
      safeError("WikipediaSearchProvider failed", {
        queryLength: q.length,
        reason: e instanceof Error ? e.message : "unknown",
      });
      throw e instanceof Error ? e : new Error("Wikipedia search failed");
    }
  }
}
