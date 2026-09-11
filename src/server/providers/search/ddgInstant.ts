import type { SearchResultItem } from "../../../shared/types.js";
import { safeError } from "../../utils/redact.js";
import { decodeEntities, normalizeWhitespace } from "../../utils/text.js";
import { describeError, ProviderError, type SearchProvider } from "./types.js";

interface DdgInstantResponse {
  AbstractText?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
    Topics?: Array<{ Text?: string; FirstURL?: string }>;
  }>;
}

/**
 * DuckDuckGo Instant Answer API — official, free, no key. Returns curated
 * abstract + related topics for well-known entities only (no general web
 * results). Runs on different infrastructure than the HTML scrape, so it
 * survives HTML blocks/markup changes. Query budget: neutral queries only.
 */
export class DuckDuckGoInstantProvider implements SearchProvider {
  id = "ddg-instant";
  queryBudget = 2;
  private fetchFn: typeof fetch;

  constructor(opts?: { fetchFn?: typeof fetch }) {
    this.fetchFn = opts?.fetchFn ?? fetch;
  }

  async search(query: string, opts?: { count?: number; signal?: AbortSignal; timeoutMs?: number }): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q) return [];
    if (opts?.signal?.aborted) throw new ProviderError("Instant Answer search aborted", { timeout: true });
    const timeout = AbortSignal.timeout(opts?.timeoutMs ?? 10000);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const res = await this.fetchFn(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,
        { signal, headers: { "User-Agent": "Verity/0.1", Accept: "application/json" } }
      );
      if (!res.ok) throw new ProviderError(`Instant Answer search failed with status ${res.status}`, { httpStatus: res.status, category: "http" });
      const data = (await res.json()) as DdgInstantResponse;
      const out: SearchResultItem[] = [];
      if (data.AbstractText && data.AbstractURL && /^https?:\/\//i.test(data.AbstractURL)) {
        out.push({
          title: `${data.AbstractSource || "Reference"}: ${normalizeWhitespace(decodeEntities(data.AbstractText)).slice(0, 120)}`,
          url: data.AbstractURL,
          snippet: normalizeWhitespace(decodeEntities(data.AbstractText)).slice(0, 800),
          sourceType: "organization",
        });
      }
      for (const topic of data.RelatedTopics ?? []) {
        const flat = topic.Topics ?? [{ Text: topic.Text, FirstURL: topic.FirstURL }];
        for (const t of flat) {
          if (!t.FirstURL || !/^https?:\/\//i.test(t.FirstURL) || !t.Text) continue;
          out.push({
            title: normalizeWhitespace(decodeEntities(t.Text)).slice(0, 200),
            url: t.FirstURL,
            snippet: normalizeWhitespace(decodeEntities(t.Text)).slice(0, 800),
          });
          if (out.length >= (opts?.count ?? 5)) break;
        }
        if (out.length >= (opts?.count ?? 5)) break;
      }
      return out.slice(0, opts?.count ?? 5);
    } catch (e) {
      if (e instanceof ProviderError) {
        safeError("InstantAnswerProvider failed", { queryLength: q.length, reason: e.message, cause: describeError(e) });
        throw e;
      }
      const timeoutFailure = e instanceof DOMException && e.name === "AbortError";
      const err = new ProviderError(
        timeoutFailure ? "Instant Answer search timed out" : `Instant Answer search failed: ${e instanceof Error ? e.message : "unknown error"}`,
        timeoutFailure ? { timeout: true } : undefined
      );
      safeError("InstantAnswerProvider failed", { queryLength: q.length, reason: err.message, cause: describeError(e) });
      throw err;
    }
  }
}
