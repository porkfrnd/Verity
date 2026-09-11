import type { SearchResultItem } from "../../../shared/types.js";
import { safeError } from "../../utils/redact.js";
import type { SearchProvider } from "./types.js";

// Google Fact Check Tools API — optional distinct signal ("Prior fact-checks
// found"). Requires FACTCHECK_API_KEY; returns [] when unconfigured so the
// pipeline works without it.
export class FactCheckProvider implements SearchProvider {
  id = "factcheck";
  private apiKey: string;
  private fetchFn: typeof fetch;
  constructor(apiKey?: string, opts?: { fetchFn?: typeof fetch }) {
    this.apiKey = apiKey ?? process.env.FACTCHECK_API_KEY ?? "";
    this.fetchFn = opts?.fetchFn ?? fetch;
  }
  async search(query: string, opts?: { count?: number; signal?: AbortSignal }): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q || !this.apiKey) return [];
    const timeout = AbortSignal.timeout(15000);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(q)}&key=${this.apiKey}`;
      const res = await this.fetchFn(url, { signal });
      if (!res.ok) {
        safeError("FactCheckProvider failed", { status: res.status });
        return [];
      }
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
      safeError("FactCheckProvider failed", { message: e instanceof Error ? e.message : "unknown" });
      return [];
    }
  }
}
