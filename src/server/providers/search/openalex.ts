import type { SearchResultItem } from "../../../shared/types.js";
import { safeError } from "../../utils/redact.js";
import { normalizeWhitespace } from "../../utils/text.js";
import { describeError, ProviderError, type SearchProvider } from "./types.js";

interface OpenAlexWork {
  id?: string;
  doi?: string;
  title?: string;
  publication_date?: string;
  cited_by_count?: number;
  authorships?: Array<{ author?: { display_name?: string } }>;
  primary_location?: { source?: { display_name?: string } };
  abstract_inverted_index?: Record<string, number[]> | null;
}

/** Reconstruct abstract text from OpenAlex's inverted index. */
export function reconstructAbstract(index: Record<string, number[]> | null | undefined): string | undefined {
  if (!index) return undefined;
  const positioned: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) positioned.push([pos, word]);
  }
  positioned.sort((a, b) => a[0] - b[0]);
  const text = normalizeWhitespace(positioned.map(([, w]) => w).join(" "));
  return text.length >= 40 ? text.slice(0, 1200) : undefined;
}

/**
 * OpenAlex scholarly index — free, no key, independent infrastructure.
 * Strong for scientific/medical claims (peer-reviewed signal + abstracts);
 * weak for breaking news. Query budget: neutral queries only.
 */
export class OpenAlexSearchProvider implements SearchProvider {
  id = "openalex";
  queryBudget = 2;
  private fetchFn: typeof fetch;

  constructor(opts?: { fetchFn?: typeof fetch }) {
    this.fetchFn = opts?.fetchFn ?? fetch;
  }

  async search(query: string, opts?: { count?: number; signal?: AbortSignal }): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q) return [];
    if (opts?.signal?.aborted) throw new ProviderError("OpenAlex search aborted", { timeout: true });
    const timeout = AbortSignal.timeout(15000);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const res = await this.fetchFn(
        `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${opts?.count ?? 5}&select=id,doi,title,publication_date,cited_by_count,authorships,primary_location,abstract_inverted_index`,
        { signal, headers: { "User-Agent": "Verity/0.1 (evidence-based claim verification)", Accept: "application/json" } }
      );
      if (!res.ok) throw new ProviderError(`OpenAlex search failed with status ${res.status}`, { httpStatus: res.status, category: "http" });
      const data = (await res.json()) as { results?: OpenAlexWork[] };
      return (data.results ?? []).slice(0, opts?.count ?? 5).map((w) => {
        const title = (w.title ?? "Untitled").slice(0, 300);
        const url = w.doi ? `https://doi.org/${w.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}` : (w.id ?? "");
        const abstract = reconstructAbstract(w.abstract_inverted_index);
        const authors = (w.authorships ?? []).slice(0, 3).map((a) => a.author?.display_name).filter(Boolean);
        const venue = w.primary_location?.source?.display_name;
        const snippet = [
          abstract?.slice(0, 600),
          authors.length > 0 ? `Authors: ${authors.join(", ")}` : "",
          venue ? `Published in: ${venue}` : "",
          typeof w.cited_by_count === "number" ? `Cited by ${w.cited_by_count}` : "",
        ]
          .filter(Boolean)
          .join(" — ")
          .slice(0, 800) || undefined;
        return {
          title,
          url,
          snippet,
          author: authors[0],
          publishedAt: w.publication_date,
          sourceType: "academic" as const,
        };
      }).filter((r) => /^https?:\/\//i.test(r.url));
    } catch (e) {
      if (e instanceof ProviderError) {
        safeError("OpenAlexProvider failed", { queryLength: q.length, reason: e.message, cause: describeError(e) });
        throw e;
      }
      const timeoutFailure = e instanceof DOMException && e.name === "AbortError";
      const err = new ProviderError(
        timeoutFailure ? "OpenAlex search timed out" : `OpenAlex search failed: ${e instanceof Error ? e.message : "unknown error"}`,
        timeoutFailure ? { timeout: true } : undefined
      );
      safeError("OpenAlexProvider failed", { queryLength: q.length, reason: err.message, cause: describeError(e) });
      throw err;
    }
  }
}
