import type { SearchOptions, SearchResultItem } from "../../../shared/types.js";

/** Structured provider failure — preserved into ProviderReport, never swallowed. */
export class ProviderError extends Error {
  httpStatus?: number;
  /** True for timeouts/aborts (as opposed to HTTP or parse errors). */
  timeout?: boolean;

  constructor(message: string, opts?: { httpStatus?: number; timeout?: boolean }) {
    super(message);
    this.name = "ProviderError";
    if (opts?.httpStatus !== undefined) this.httpStatus = opts.httpStatus;
    if (opts?.timeout !== undefined) this.timeout = opts.timeout;
  }
}

export function isTimeoutError(e: unknown): boolean {
  if (e instanceof ProviderError && e.timeout) return true;
  if (e instanceof DOMException && e.name === "AbortError") return true;
  const m = e instanceof Error ? e.message : String(e);
  return /abort|timeout|timed out|timedout|etimedout|econnreset/i.test(m);
}

export function httpStatusOf(e: unknown): number | undefined {
  if (e instanceof ProviderError) return e.httpStatus;
  const m = e instanceof Error ? e.message : "";
  const match = m.match(/status\s+(\d{3})/);
  return match ? Number(match[1]) : undefined;
}

export interface SearchProvider {
  id: string;
  /**
   * Neutral/supporting/contradicting queries arrive together; providers with
   * a `queryBudget` receive only the first N (neutral queries come first).
   */
  queryBudget?: number;
  search(query: string, opts?: SearchOptions): Promise<SearchResultItem[]>;
}
