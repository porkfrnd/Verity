import type { SearchResultItem } from "../../shared/types.js";
import { DuckDuckGoSearchProvider } from "../providers/search/duckduckgo.js";
import { FactCheckProvider } from "../providers/search/factcheck.js";
import { MockSearchProvider } from "../providers/search/mock.js";
import { SearXNGSearchProvider } from "../providers/search/searxng.js";
import { WikipediaSearchProvider } from "../providers/search/wikipedia.js";
import type { SearchProvider } from "../providers/search/types.js";
import { safeError } from "../utils/redact.js";

export function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

export function getSearchProviders(): SearchProvider[] {
  // Deterministic offline provider for tests/CI — no network allowed.
  if (isTestEnv() || process.env.SEARCH_PROVIDER === "mock") {
    return [new MockSearchProvider()];
  }
  const providers: SearchProvider[] = [];
  // Default web search is free and keyless. A self-hosted SearXNG instance
  // replaces the DuckDuckGo scraper when SEARXNG_URL is set. Wikipedia
  // reference search always runs alongside (free, no key) — strong for
  // well-known entities, weak for breaking news.
  if (process.env.SEARXNG_URL?.trim()) {
    providers.push(new SearXNGSearchProvider());
  } else {
    providers.push(new DuckDuckGoSearchProvider());
  }
  providers.push(new WikipediaSearchProvider());
  if (process.env.FACTCHECK_API_KEY?.trim()) {
    providers.push(new FactCheckProvider());
  }
  return providers;
}

export async function runSearchAll(
  queries: string[],
  opts?: { count?: number; signal?: AbortSignal }
): Promise<{ results: SearchResultItem[]; providersUsed: string[]; errors: string[] }> {
  const providers = getSearchProviders();
  const providersUsed: string[] = [];
  const errors: string[] = [];
  // Run neutral/supporting/contradicting queries concurrently per claim, across providers.
  const jobs: Promise<SearchResultItem[]>[] = [];
  for (const q of queries) {
    for (const p of providers) {
      jobs.push(
        p.search(q, { count: opts?.count ?? 5, signal: opts?.signal }).then(
          (r) => {
            providersUsed.push(p.id);
            return r;
          },
          (e) => {
            // Typed provider error (§25): surfaced in the verdict summary,
            // never a silent empty result and never a raw stack trace.
            safeError("Search provider failed", { provider: p.id });
            errors.push(`${p.id}: ${e instanceof Error ? e.message : "search failed"}`);
            return [];
          }
        )
      );
    }
  }
  const results = (await Promise.all(jobs)).flat();
  return { results, providersUsed: [...new Set(providersUsed)], errors };
}
