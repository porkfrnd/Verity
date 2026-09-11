import type { SearchResultItem } from "../../../shared/types.js";
import { safeError } from "../../utils/redact.js";
import { describeError, ProviderError, type SearchProvider } from "./types.js";

// Google Fact Check Tools API — optional distinct signal ("Prior fact-checks
// found"). Requires FACTCHECK_API_KEY; returns [] when unconfigured so the
// pipeline works without it. Recoverable API failures (HTTP 4xx/5xx, network
// failure, timeout, malformed response) are logged through diagnostics and
// likewise degrade to [] so one auxiliary provider can never break the
// overall search. Only caller cancellation still rejects.
export class FactCheckProvider implements SearchProvider {
  id = "factcheck";
  queryBudget = 2;
  private apiKey: string;
  private fetchFn: typeof fetch;
  constructor(apiKey?: string, opts?: { fetchFn?: typeof fetch }) {
    this.apiKey = apiKey ?? process.env.FACTCHECK_API_KEY ?? "";
    this.fetchFn = opts?.fetchFn ?? fetch;
  }
  async search(query: string, opts?: { count?: number; signal?: AbortSignal; timeoutMs?: number }): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q || !this.apiKey) return [];
    if (opts?.signal?.aborted) throw new ProviderError("Fact-check search aborted", { timeout: true });
    const timeout = AbortSignal.timeout(opts?.timeoutMs ?? 15000);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(q)}&key=${this.apiKey}`;
      const res = await this.fetchFn(url, { signal });
      if (!res.ok) throw new ProviderError(`Fact-check search failed with status ${res.status}`, { httpStatus: res.status, category: "http" });
      const data = (await res.json()) as {
        claims?: Array<{ text?: string; claimReview?: Array<{ publisher?: { name?: string }; url?: string; title?: string; reviewRating?: { textualRating?: string } }> }>;
      };
      const out: SearchResultItem[] = [];
      for (const c of data.claims ?? []) {
        for (const r of c.claimReview ?? []) {
          if (!r.url) continue;
          out.push({
            title: r.title ?? `Fact-check: ${c.text ?? q}`,
            url: r.url,
            snippet: `Rated: ${r.reviewRating?.textualRating ?? "see review"} — ${c.text ?? ""}`,
            sourceType: "organization",
            isFactCheck: true,
          });
        }
      }
      return out.slice(0, opts?.count ?? 5);
    } catch (e) {
      // Caller cancellation is not a provider failure: preserve it so global
      // deadlines and explicit aborts keep working.
      if (opts?.signal?.aborted) throw e;
      const err =
        e instanceof ProviderError
          ? e
          : (() => {
              const timeoutFailure = e instanceof DOMException && e.name === "AbortError";
              return new ProviderError(
                timeoutFailure
                  ? "Fact-check search timed out"
                  : `Fact-check search failed: ${e instanceof Error ? e.message : "unknown error"}`,
                timeoutFailure ? { timeout: true } : undefined
              );
            })();
      safeError("FactCheckProvider failed", { queryLength: q.length, reason: err.message, cause: describeError(e) });
      return [];
    }
  }
}
