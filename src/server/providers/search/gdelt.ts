import type { SearchResultItem } from "../../../shared/types.js";
import { safeError } from "../../utils/redact.js";
import { describeError, ProviderError, type SearchProvider } from "./types.js";

interface GdeltArticle {
  title?: string;
  url?: string;
  seendate?: string;
}

/**
 * GDELT 2.1 DOC API — free global news index, no key, independent
 * infrastructure. Gives news/current-events coverage that scholarly and
 * reference sources lack. Query budget: neutral queries only.
 */
export class GdeltSearchProvider implements SearchProvider {
  id = "gdelt";
  queryBudget = 2;
  private fetchFn: typeof fetch;

  constructor(opts?: { fetchFn?: typeof fetch }) {
    this.fetchFn = opts?.fetchFn ?? fetch;
  }

  async search(query: string, opts?: { count?: number; signal?: AbortSignal }): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q) return [];
    if (opts?.signal?.aborted) throw new ProviderError("GDELT search aborted", { timeout: true });
    const timeout = AbortSignal.timeout(15000);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const res = await this.fetchFn(
        `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=${opts?.count ?? 5}&format=json`,
        { signal, headers: { "User-Agent": "Verity/0.1", Accept: "application/json" } }
      );
      if (!res.ok) throw new ProviderError(`GDELT search failed with status ${res.status}`, { httpStatus: res.status, category: "http" });
      const data = (await res.json()) as { articles?: GdeltArticle[] };
      return (data.articles ?? []).slice(0, opts?.count ?? 5).map((a) => {
        const url = (a.url ?? "").trim();
        let domain = "";
        try {
          domain = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          domain = "";
        }
        const seen = (a.seendate ?? "").replace(/^(\d{4})(\d{2})(\d{2})T.*$/, "$1-$2-$3") || undefined;
        return {
          title: (a.title ?? "Untitled").slice(0, 300),
          url,
          snippet: domain ? `News coverage via ${domain}${seen ? ` — seen ${seen}` : ""}.` : undefined,
          publishedAt: seen,
          sourceType: "news" as const,
        };
      }).filter((r) => /^https?:\/\//i.test(r.url));
    } catch (e) {
      if (e instanceof ProviderError) {
        safeError("GdeltProvider failed", { queryLength: q.length, reason: e.message, cause: describeError(e) });
        throw e;
      }
      const timeoutFailure = e instanceof DOMException && e.name === "AbortError";
      const err = new ProviderError(
        timeoutFailure ? "GDELT search timed out" : `GDELT search failed: ${e instanceof Error ? e.message : "unknown error"}`,
        timeoutFailure ? { timeout: true } : undefined
      );
      safeError("GdeltProvider failed", { queryLength: q.length, reason: err.message, cause: describeError(e) });
      throw err;
    }
  }
}
