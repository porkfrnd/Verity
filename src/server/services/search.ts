import type { SearchResultItem } from "../../shared/types.js";
import { FactCheckProvider, WebSearchProvider } from "../providers/search/web.js";
import { MockSearchProvider } from "../providers/search/mock.js";
import type { SearchProvider } from "../providers/search/types.js";
import { safeError } from "../utils/redact.js";

export function getSearchProviders(): SearchProvider[] {
  const providers: SearchProvider[] = [];
  if (process.env.TAVILY_API_KEY?.trim()) {
    providers.push(new WebSearchProvider());
  }
  if (process.env.FACTCHECK_API_KEY?.trim()) {
    providers.push(new FactCheckProvider());
  }
  // Mock always present as fallback so demos/tests work without keys.
  // When real providers exist, mock results are deprioritized by merging real first.
  providers.push(new MockSearchProvider());
  return providers;
}

export async function runSearchAll(
  queries: string[],
  opts?: { count?: number }
): Promise<{ results: SearchResultItem[]; providersUsed: string[]; errors: string[] }> {
  const providers = getSearchProviders();
  const providersUsed: string[] = [];
  const errors: string[] = [];
  // Run neutral/supporting/contradicting queries concurrently per claim, across providers.
  const jobs: Promise<SearchResultItem[]>[] = [];
  for (const q of queries) {
    for (const p of providers) {
      // Skip mock when a real provider handles the same query (avoid noise),
      // unless no real provider is configured at all.
      const hasReal = providers.some((x) => x.id !== "mock");
      if (hasReal && p.id === "mock") continue;
      jobs.push(
        p.search(q, { count: opts?.count ?? 5 }).then(
          (r) => {
            providersUsed.push(p.id);
            return r;
          },
          (e) => {
            safeError("Search provider failed", { provider: p.id });
            errors.push(`${p.id}: ${e instanceof Error ? e.message : "search failed"}`);
            return [];
          }
        )
      );
    }
  }
  // If every real provider failed, fall back to mock so the pipeline degrades visibly, not silently.
  let results = (await Promise.all(jobs)).flat();
  if (results.length === 0 && providers.some((p) => p.id !== "mock")) {
    try {
      const mock = new MockSearchProvider();
      results = (await Promise.all(queries.map((q) => mock.search(q)))).flat();
      providersUsed.push("mock(fallback)");
    } catch {
      // ignore
    }
  }
  return { results, providersUsed: [...new Set(providersUsed)], errors };
}
