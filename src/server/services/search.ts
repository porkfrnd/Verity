import type { ProviderReport, SearchResultItem } from "../../shared/types.js";
import { DuckDuckGoSearchProvider } from "../providers/search/duckduckgo.js";
import { DuckDuckGoInstantProvider } from "../providers/search/ddgInstant.js";
import { FactCheckProvider } from "../providers/search/factcheck.js";
import { GdeltSearchProvider } from "../providers/search/gdelt.js";
import { MockSearchProvider } from "../providers/search/mock.js";
import { OpenAlexSearchProvider } from "../providers/search/openalex.js";
import { SearXNGSearchProvider } from "../providers/search/searxng.js";
import { WikipediaSearchProvider } from "../providers/search/wikipedia.js";
import { ProviderError, causeFingerprint, describeError, httpStatusOf, isTimeoutError, type SearchProvider } from "../providers/search/types.js";
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
  // replaces the DuckDuckGo scraper when SEARXNG_URL is set.
  if (process.env.SEARXNG_URL?.trim()) {
    providers.push(new SearXNGSearchProvider());
  } else {
    providers.push(new DuckDuckGoSearchProvider());
  }
  // Independent free infrastructures: reference, scholarly, news, instant.
  providers.push(new DuckDuckGoInstantProvider());
  providers.push(new WikipediaSearchProvider());
  providers.push(new OpenAlexSearchProvider());
  providers.push(new GdeltSearchProvider());
  if (process.env.FACTCHECK_API_KEY?.trim()) {
    providers.push(new FactCheckProvider());
  }
  return providers;
}

export interface SearchRunOptions {
  count?: number;
  signal?: AbortSignal;
  /** Max attempts per (provider, query). Default 2 (one retry). */
  maxAttempts?: number;
  /** Base backoff between attempts. Default 400ms (0 in tests). */
  retryDelayMs?: number;
  /** Per-attempt provider budget, forwarded as the request timeout. No default (providers use theirs). */
  providerBudgetMs?: number;
  /** Max in-flight search requests across all providers. Default: unbounded. */
  maxConcurrentJobs?: number;
  /** Per-provider report callback (powers live progress + SSE). */
  onProvider?: (report: ProviderReport) => void;
}

export interface SearchRunResult {
  results: SearchResultItem[];
  providersUsed: string[];
  errors: string[];
  reports: ProviderReport[];
}

function shouldRetry(e: unknown, attempt: number, maxAttempts: number, signal?: AbortSignal): boolean {
  if (attempt + 1 >= maxAttempts) return false;
  if (signal?.aborted) return false; // caller cancelled: never retry
  // Retry timeouts, network failures, and 5xx. Never retry caller aborts,
  // 4xx, or parse/markup errors (retrying those is pointless).
  if (e instanceof DOMException && e.name === "AbortError") return false;
  const status = httpStatusOf(e);
  if (status !== undefined && status < 500) return false;
  if (e instanceof Error && /markup changed|not configured|aborted by caller/i.test(e.message)) return false;
  return true;
}

interface JobOutcome {
  provider: string;
  items: SearchResultItem[];
  latencyMs: number;
  retries: number;
  /** Fingerprint per failed attempt, oldest first (§13: retries never hide causes). */
  attempts: string[];
  error: unknown;
}

/** One (provider, query) job with bounded retry + backoff. Never throws. */
async function runJob(
  provider: SearchProvider,
  query: string,
  opts: Required<Pick<SearchRunOptions, "count" | "maxAttempts" | "retryDelayMs">> & {
    signal?: AbortSignal;
    timeoutMs?: number;
  }
): Promise<JobOutcome> {
  const started = Date.now();
  let retries = 0;
  const attempts: string[] = [];
  // Race the provider against caller cancellation so a hung provider that
  // ignores its signal cannot stall the investigation forever. The thunk
  // defers invocation so a pre-aborted signal never starts (or orphans) work.
  const withCancel = <T>(fn: () => Promise<T>): Promise<T> => {
    // Message says cancelled (not timed out): the flag stays timeout:true so
    // downstream status mapping still yields "timeout", while the attempts
    // fingerprint (see below) records the true origin.
    const cancelledError = () =>
      new ProviderError(`${provider.id} search cancelled (global deadline)`, { timeout: true });
    if (!opts.signal) return fn();
    if (opts.signal.aborted) return Promise.reject(cancelledError());
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        opts.signal!.addEventListener("abort", () => reject(cancelledError()), { once: true });
      }),
    ]);
  };
  for (let attempt = 0; ; attempt++) {
    try {
      const items = await withCancel(() =>
        provider.search(query, { count: opts.count, signal: opts.signal, timeoutMs: opts.timeoutMs })
      );
      return { provider: provider.id, items, latencyMs: Date.now() - started, retries, attempts, error: null };
    } catch (e) {
      // §6: an abort observed while OUR signal is aborted is global-deadline
      // cancellation, not a provider timeout. Anything else keeps the
      // provider's own classification (timeout/http/parse).
      const cancelled =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof ProviderError && !!e.timeout);
      attempts.push(opts.signal?.aborted && cancelled ? "cancelled (global deadline)" : causeFingerprint(e));
      if (shouldRetry(e, attempt, opts.maxAttempts, opts.signal)) {
        retries++;
        const delay = opts.retryDelayMs * 2 ** attempt;
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return { provider: provider.id, items: [], latencyMs: Date.now() - started, retries, attempts, error: e };
    }
  }
}

function toReport(provider: string, jobs: JobOutcome[]): ProviderReport {
  const successes = jobs.filter((j) => j.error === null);
  const sources = successes.reduce((n, j) => n + j.items.length, 0);
  const retries = jobs.reduce((n, j) => n + j.retries, 0);
  const attempts = jobs.flatMap((j) => j.attempts);
  const latencyMs = jobs.reduce((n, j) => Math.max(n, j.latencyMs), 0);
  if (successes.length > 0) {
    const failed = jobs.length - successes.length;
    return {
      provider,
      status: "success",
      category: sources > 0 ? "ok" : "empty",
      latencyMs,
      sources,
      retries,
      attempts,
      error: failed > 0 ? `${failed} of ${jobs.length} queries failed` : null,
    };
  }
  const first = jobs[0]?.error;
  const timeout = jobs.some((j) => isTimeoutError(j.error));
  const httpStatus = httpStatusOf(first);
  const blocked =
    first instanceof ProviderError
      ? first.category === "blocked"
      : /captcha|challenge|blocked|denied|forbidden|unusual traffic/i.test(first instanceof Error ? first.message : "");
  return {
    provider,
    status: timeout ? "timeout" : "error",
    category: blocked ? "blocked" : timeout ? "network" : httpStatus !== undefined ? "http" : first instanceof ProviderError && first.category === "parse" ? "parse" : "network",
    latencyMs,
    sources: 0,
    retries,
    attempts,
    httpStatus,
    error: first instanceof Error ? first.message : "search failed",
  };
}

/**
 * Run providers concurrently with fault isolation: one provider's failure
 * (timeout/HTTP/parse) never discards another provider's results. Uses
 * allSettled-style per-job handling — the returned promise never rejects.
 */
export async function runSearchAllWith(
  providers: SearchProvider[],
  queries: string[],
  opts?: SearchRunOptions
): Promise<SearchRunResult> {
  const count = opts?.count ?? 5;
  const maxAttempts = opts?.maxAttempts ?? 2;
  const retryDelayMs = opts?.retryDelayMs ?? 400;
  const limit = Math.max(1, opts?.maxConcurrentJobs ?? Number.POSITIVE_INFINITY);
  const providerBudgetMs = opts?.providerBudgetMs;
  // Flat deferred task list: jobs only start when a pool worker picks them
  // up, so in-flight requests never exceed the mode's bound no matter how
  // many providers × queries are configured.
  const tasks: Array<{ provider: SearchProvider; query: string; index: number }> = [];
  for (const p of providers) {
    const qs = p.queryBudget ? queries.slice(0, p.queryBudget) : queries;
    for (const q of qs) tasks.push({ provider: p, query: q, index: tasks.length });
  }
  const outcomes = new Array<JobOutcome | undefined>(tasks.length);
  const providerIdx = new Map<string, number[]>();
  for (const t of tasks) {
    const list = providerIdx.get(t.provider.id) ?? [];
    list.push(t.index);
    providerIdx.set(t.provider.id, list);
  }
  const reports: ProviderReport[] = [];
  const errors: string[] = [];
  const providersUsed: string[] = [];
  const settledProviders = new Set<string>();
  const settleProvider = (id: string) => {
    if (settledProviders.has(id)) return;
    const idxs = providerIdx.get(id) ?? [];
    if (!idxs.every((j) => outcomes[j] !== undefined)) return;
    settledProviders.add(id);
    const jobs = idxs.map((j) => outcomes[j] as JobOutcome);
    const report = toReport(id, jobs);
    reports.push(report);
    for (const j of jobs) {
      if (j.error === null) {
        providersUsed.push(id);
      } else {
        // Typed provider error: surfaced in reports + verdict summary,
        // never a silent empty result and never a raw stack trace.
        // The cause breakdown (§1) is what answers "why exactly did fetch fail?".
        safeError("Search provider failed", { provider: id, cause: describeError(j.error), attempts: j.attempts });
        errors.push(`${id}: ${j.error instanceof Error ? j.error.message : "search failed"}`);
      }
    }
    opts?.onProvider?.(report);
  };
  // Await per-pool-worker; each provider's report emits as soon as IT settles
  // (powers live progress); a slow provider never blocks other reports.
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const i = cursor++;
      const t = tasks[i];
      outcomes[i] = await runJob(t.provider, t.query, {
        count,
        maxAttempts,
        retryDelayMs,
        signal: opts?.signal,
        timeoutMs: providerBudgetMs,
      });
      settleProvider(t.provider.id);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(tasks.length, 1)) }, () => worker())
  );
  // Index-ordered assembly: completion order affects events only, never the
  // result set (deterministic downstream).
  const results: SearchResultItem[] = [];
  for (const o of outcomes) {
    if (o && o.error === null) results.push(...o.items);
  }
  reports.sort((a, b) => a.provider.localeCompare(b.provider));
  return { results, providersUsed: [...new Set(providersUsed)], errors, reports };
}

export async function runSearchAll(queries: string[], opts?: SearchRunOptions): Promise<SearchRunResult> {
  return runSearchAllWith(getSearchProviders(), queries, opts);
}
