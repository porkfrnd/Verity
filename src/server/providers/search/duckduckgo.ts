import * as cheerio from "cheerio";
import type { SearchResultItem } from "../../../shared/types.js";
import { safeError } from "../../utils/redact.js";
import { describeError, ProviderError, type SearchProvider } from "./types.js";

export const DDG_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Verity/0.1";

// Brief per-query cache: identical queries reuse results to reduce request
// volume against the free/scraped source. Module-level so it survives the
// per-request provider instances built by getSearchProviders().
const queryCache = new Map<string, { expires: number; results: SearchResultItem[] }>();
const QUERY_CACHE_TTL_MS = 10 * 60 * 1000;
const QUERY_CACHE_MAX = 200;

export function clearDuckDuckGoCache(): void {
  queryCache.clear();
}

function getCachedQuery(query: string): SearchResultItem[] | undefined {
  const entry = queryCache.get(query.toLowerCase().trim());
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    queryCache.delete(query.toLowerCase().trim());
    return undefined;
  }
  return entry.results.map((r) => ({ ...r }));
}

function setCachedQuery(query: string, results: SearchResultItem[]): void {
  queryCache.set(query.toLowerCase().trim(), {
    expires: Date.now() + QUERY_CACHE_TTL_MS,
    results: results.map((r) => ({ ...r })),
  });
  if (queryCache.size > QUERY_CACHE_MAX) {
    const first = queryCache.keys().next().value;
    if (first) queryCache.delete(first);
  }
}

/** Unwrap DuckDuckGo redirect links (`/l/?uddg=<encoded-target>` or `//…/l/?uddg=…`). */
export function unwrapDuckDuckGoHref(href: string): string {
  const trimmed = href.trim();
  try {
    const absolute = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    const u = new URL(absolute, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
  } catch {
    // fall through to raw href
  }
  return trimmed;
}

/**
 * Parse DuckDuckGo HTML-results page into search hits.
 * Exported for tests. Throws a ProviderError with structural diagnostics
 * (§8: status/content-type/length/indicators, never a content dump) when the
 * markup contains no recognizable result nodes at all — callers surface that
 * as a typed provider error, never a crash. A page with result containers
 * but no usable URLs is a legitimate empty set.
 */
export function parseDuckDuckGoHtml(html: string, meta?: { httpStatus?: number; contentType?: string; finalUrl?: string }): SearchResultItem[] {
  const $ = cheerio.load(html);
  const containers = $(".result");
  if (containers.length === 0) {
    if ($(".no-results").length > 0 || /no results/i.test($.text().slice(0, 2000))) return [];
    const text = $.text().slice(0, 2000);
    const title = $("title").first().text().trim().slice(0, 120);
    throw new ProviderError("DuckDuckGo markup changed or request blocked (no result nodes found)", {
      category: "parse",
      detail: {
        httpStatus: meta?.httpStatus ?? 0,
        contentType: (meta?.contentType ?? "").slice(0, 60),
        bodyLength: html.length,
        hasAnomaly: /captcha|challenge|unusual traffic|verify you are|attention|denied|forbidden/i.test(text) ? true : false,
        pageTitle: title || "(none)",
        finalHost: (() => {
          try {
            return new URL(meta?.finalUrl ?? "").hostname;
          } catch {
            return "(unknown)";
          }
        })(),
      },
    });
  }
  const out: SearchResultItem[] = [];
  containers.each((_, el) => {
    const link = $(el).find(".result__a").first();
    const rawHref = link.attr("href") ?? "";
    const url = unwrapDuckDuckGoHref(rawHref);
    if (!/^https?:\/\//i.test(url)) return;
    const title = link.text().trim().slice(0, 300) || url;
    const snippet = $(el).find(".result__snippet").first().text().trim().slice(0, 800) || undefined;
    // No sourceType: normalization infers it from the domain (news/gov/academic…).
    out.push({ title, url, snippet });
  });
  return out;
}

// Politeness spacing between scrape requests (module-level, shared).
let lastRequestAt = 0;

export function resetDuckDuckGoSpacing(): void {
  lastRequestAt = 0;
}

/** Bounded structural probe of a block-status page (§8: indicators only, never a dump). */
async function blockDetail(res: Response): Promise<Record<string, string | number | boolean>> {
  const base = {
    httpStatus: res.status,
    contentType: (res.headers.get("content-type") ?? "").slice(0, 60),
    finalHost: (() => {
      try {
        return new URL(res.url).hostname;
      } catch {
        return "(unknown)";
      }
    })(),
  };
  const declared = Number(res.headers.get("content-length") ?? "NaN");
  let sample = "";
  try {
    // Refuse to slurp huge bodies just to confirm a block page.
    if (!Number.isFinite(declared) || declared <= 65536) {
      sample = (await res.text()).slice(0, 16384);
    }
  } catch {
    sample = "";
  }
  return {
    ...base,
    bodyLength: Number.isFinite(declared) ? declared : sample.length,
    hasAnomaly: /captcha|challenge|unusual traffic|verify you are|attention required|denied|forbidden/i.test(sample),
    pageTitle: /<title>([^<]{0,120})/i.exec(sample)?.[1]?.trim() || "(none)",
  };
}

/**
 * Default web search: DuckDuckGo HTML results, scraped — no API key.
 * Free and keyless, but fragile by nature (markup can change without notice)
 * and automated querying is against DDG's terms — kept strictly behind the
 * SearchProvider interface so it is a one-file swap (see SearXNG).
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
  id = "duckduckgo";
  private fetchFn: typeof fetch;
  private minGapMs: number;
  private timeoutMs: number;

  constructor(opts?: { fetchFn?: typeof fetch; minGapMs?: number; timeoutMs?: number }) {
    this.fetchFn = opts?.fetchFn ?? fetch;
    this.minGapMs =
      opts?.minGapMs ?? Number(process.env.DDG_REQUEST_GAP_MS ?? 1200);
    this.timeoutMs = opts?.timeoutMs ?? 15000;
  }

  async search(query: string, opts?: { count?: number; signal?: AbortSignal; timeoutMs?: number }): Promise<SearchResultItem[]> {
    const q = query.trim();
    if (!q) return [];
    const cached = getCachedQuery(q);
    if (cached) return cached.slice(0, opts?.count ?? 5);

    const gap = Date.now() - lastRequestAt;
    if (gap < this.minGapMs) {
      await new Promise((r) => setTimeout(r, this.minGapMs - gap));
    }
    if (opts?.signal?.aborted) throw new ProviderError("DuckDuckGo search aborted", { timeout: true });
    const budgetMs = opts?.timeoutMs ?? this.timeoutMs;
    const timeout = AbortSignal.timeout(budgetMs);
    const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
    try {
      const res = await this.fetchFn(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
        signal,
        headers: {
          "User-Agent": DDG_UA,
          Accept: "text/html",
        },
      });
      if (!res.ok || res.status === 202) {
        // 202 from the HTML endpoint is DDG's throttle/challenge response
        // (small page, no result nodes) — a block, not a parse problem.
        // Verify structurally (bounded probe) rather than assuming.
        const blocked = res.status === 202 || res.status === 429;
        throw new ProviderError(`DuckDuckGo search failed with status ${res.status}`, {
          httpStatus: res.status,
          category: blocked ? "blocked" : "http",
          detail: blocked ? await blockDetail(res) : undefined,
        });
      }
      const html = await res.text();
      const results = parseDuckDuckGoHtml(html, {
        httpStatus: res.status,
        contentType: res.headers.get("content-type") ?? "",
        finalUrl: res.url,
      });
      setCachedQuery(q, results);
      return results.slice(0, opts?.count ?? 5);
    } catch (e) {
      if (e instanceof ProviderError) {
        safeError("DuckDuckGoSearchProvider failed", { queryLength: q.length, reason: e.message, cause: describeError(e), detail: e.detail ?? null });
        throw e;
      }
      const timeoutFailure = e instanceof DOMException && e.name === "AbortError";
      const err = new ProviderError(
        timeoutFailure ? `DuckDuckGo search timed out after ${budgetMs}ms` : `DuckDuckGo search failed: ${e instanceof Error ? e.message : "unknown error"}`,
        timeoutFailure ? { timeout: true } : undefined
      );
      // Log length, never content: queries are user claims (privacy).
      safeError("DuckDuckGoSearchProvider failed", { queryLength: q.length, reason: err.message, cause: describeError(e) });
      throw err;
    } finally {
      lastRequestAt = Date.now();
    }
  }
}
