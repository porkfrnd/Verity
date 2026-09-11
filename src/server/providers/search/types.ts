import type { SearchOptions, SearchResultItem } from "../../../shared/types.js";

/** Structured provider failure — preserved into ProviderReport, never swallowed. */
export class ProviderError extends Error {
  httpStatus?: number;
  /** True for timeouts/aborts (as opposed to HTTP or parse errors). */
  timeout?: boolean;
  /** Failure class for the §16 taxonomy: network | http | blocked | parse | config. */
  category?: "network" | "http" | "blocked" | "parse" | "config";
  /** One entry per attempt, oldest first (e.g. "timeout:ECONNRESET", "http:503"). */
  attempts: string[] = [];
  /** Safe scalars only: hostname, httpStatus, lengths — never URLs, keys, or credentials. */
  detail?: Record<string, string | number | boolean>;

  constructor(
    message: string,
    opts?: { httpStatus?: number; timeout?: boolean; category?: ProviderError["category"]; detail?: ProviderError["detail"] }
  ) {
    super(message);
    this.name = "ProviderError";
    if (opts?.httpStatus !== undefined) this.httpStatus = opts.httpStatus;
    if (opts?.timeout !== undefined) this.timeout = opts.timeout;
    if (opts?.category !== undefined) this.category = opts.category;
    if (opts?.detail !== undefined) this.detail = opts.detail;
  }
}

/** Cause chain of a fetch failure, redacted to safe fields only. */
export interface ErrorCauseInfo {
  name: string;
  message: string;
  causeName?: string;
  causeMessage?: string;
  code?: string;
  errno?: string | number;
  syscall?: string;
  hostname?: string;
  address?: string;
  port?: string | number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

/**
 * Extract the diagnosable core of a fetch failure. Undici wraps syscall
 * errors as `TypeError: fetch failed` with the real cause in `.cause` —
 * logging only the outer message hides everything (§1).
 */
export function describeError(e: unknown): ErrorCauseInfo {
  const out: ErrorCauseInfo = {
    name: e instanceof Error ? e.name : typeof e,
    message: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
  };
  const cause = e instanceof Error ? (e as { cause?: unknown }).cause : undefined;
  if (!isRecord(cause) && !(cause instanceof Error)) return out;
  const c = cause as Record<string, unknown> & { name?: unknown; message?: unknown };
  if (typeof c.name === "string") out.causeName = c.name;
  const rawMessage = typeof c.message === "string" ? c.message : "";
  out.causeMessage = rawMessage.slice(0, 300);
  for (const key of ["code", "errno", "syscall", "hostname", "address", "port"] as const) {
    const v = c[key];
    if (typeof v === "string" || typeof v === "number") {
      (out as unknown as Record<string, string | number>)[key] = v;
    }
  }
  return out;
}

/** One-line cause fingerprint for attempt history (e.g. "timeout:ECONNRESET"). */
export function causeFingerprint(e: unknown): string {
  const d = describeError(e);
  const code = d.code ?? (e instanceof Error ? (e as { code?: unknown }).code : undefined);
  if (typeof code === "string") {
    return `${/timedout|timeout/i.test(code) || /timeout|timed out/i.test(d.message) ? "timeout" : "error"}:${code}`;
  }
  // Provider timeouts surface as aborts ("aborted due to timeout") — report
  // those as timeouts; only bare aborts (caller cancellation) say "aborted".
  if (/timeout|timed out/i.test(d.message)) return "timeout";
  if (/abort/i.test(d.message)) return "aborted";
  const status = d.message.match(/status\s+(\d{3})/);
  if (status) return `http:${status[1]}`;
  return d.message.slice(0, 80) || "unknown";
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
