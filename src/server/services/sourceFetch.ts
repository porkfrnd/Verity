import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { AccessStatus, Source } from "../../shared/types.js";
import { normalizeWhitespace } from "../utils/text.js";
import { isTestEnv } from "./search.js";
import { ssrfBlockReason, type DnsLookupFn } from "../utils/ssrf.js";

export const SOURCE_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Verity/0.1";

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const MIN_READABLE_CHARS = 200;

const PAYWALL_SIGNALS =
  /paywall|to continue reading|subscribe to (continue|read|reading)|sign in to (read|continue)|register to (read|continue)|you've reached your (article )?limit|articles? remaining/i;

export interface FetchedSource {
  content?: string;
  author?: string;
  publishedAt?: string;
  accessStatus: AccessStatus;
}

interface FetchOpts {
  fetchFn?: typeof fetch;
  lookupFn?: DnsLookupFn;
  timeoutMs?: number;
  maxBytes?: number;
  /** Cancels the fetch (and any archive fallback) when aborted. */
  signal?: AbortSignal;
}

function timeoutOf(opts?: FetchOpts): number {
  return opts?.timeoutMs ?? Number(process.env.SOURCE_FETCH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
}

/** Read a body stream up to maxBytes; null when capped, aborted, or failed. */
async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  res: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<string | null> {
  if (signal.aborted) return null;
  if (!body) {
    const text = await res.text().catch(() => "");
    return text.length > maxBytes ? null : text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const onAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      if (signal.aborted) return null;
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

interface HopResult {
  finalUrl: string;
  res: Response;
  blocked?: string;
}

/** GET with manual redirect handling so every hop passes the SSRF guard. */
async function guardedGet(
  url: string,
  fetchFn: typeof fetch,
  lookupFn: DnsLookupFn | undefined,
  signal: AbortSignal
): Promise<HopResult> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (signal.aborted) {
      return { finalUrl: current, res: new Response(null, { status: 599 }), blocked: "fetch timed out" };
    }
    const blocked = await ssrfBlockReason(current, lookupFn);
    if (blocked) return { finalUrl: current, res: new Response(null, { status: 451 }), blocked };
    try {
      const res = await fetchFn(current, {
        signal,
        redirect: "manual",
        headers: { "User-Agent": SOURCE_UA, Accept: "text/html,application/xhtml+xml" },
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel().catch(() => undefined);
        current = new URL(location, current).toString();
        continue;
      }
      return { finalUrl: current, res };
    } catch {
      const reason = signal.aborted ? "fetch timed out" : "fetch failed";
      return { finalUrl: current, res: new Response(null, { status: 599 }), blocked: reason };
    }
  }
  return { finalUrl: current, res: new Response(null, { status: 508 }), blocked: "too many redirects" };
}

export function extractReadable(html: string, url: string): { text?: string; author?: string; publishedAt?: string } {
  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url });
  } catch {
    return {};
  }
  const doc = dom.window.document;
  const publishedAt =
    doc.querySelector('meta[property="article:published_time"]')?.getAttribute("content")?.trim() ||
    doc.querySelector("time[datetime]")?.getAttribute("datetime")?.trim() ||
    undefined;
  let article: ReturnType<Readability["parse"]> = null;
  try {
    article = new Readability(doc).parse();
  } catch {
    article = null;
  }
  dom.window.close();
  if (!article?.textContent) return { publishedAt };
  const text = normalizeWhitespace(article.textContent).slice(0, 6000);
  if (text.length < MIN_READABLE_CHARS) return { publishedAt };
  return { text, author: article.byline?.trim() || undefined, publishedAt };
}

async function tryArchiveFallback(
  url: string,
  opts: FetchOpts | undefined,
  fetchFn: typeof fetch,
  parentSignal: AbortSignal
): Promise<FetchedSource | null> {
  if (parentSignal.aborted) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const onAbort = () => controller.abort();
    parentSignal.addEventListener("abort", onAbort, { once: true });
    let snapshotUrl: string | null = null;
    try {
      const api = await fetchFn(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.any([parentSignal, controller.signal]),
        headers: { "User-Agent": SOURCE_UA, Accept: "application/json" },
      });
      if (api.ok) {
        const data = (await api.json()) as {
          archived_snapshots?: { closest?: { url?: string; status?: string } };
        };
        const closest = data.archived_snapshots?.closest;
        if (closest?.url && closest.status === "200") snapshotUrl = closest.url;
      }
    } finally {
      parentSignal.removeEventListener("abort", onAbort);
      clearTimeout(timer);
    }
    if (!snapshotUrl) return null;
    const fetched = await fetchSourceContent(snapshotUrl, opts);
    if (!fetched.content) return null;
    return { ...fetched, accessStatus: "archived_fallback" };
  } catch {
    return null;
  }
}

/**
 * Fetch a source URL and extract its main content with Readability,
 * stripping nav/ads boilerplate before it ever reaches the LLM (also caps
 * token spend). Never throws for network-level problems — those become an
 * `unreachable` (or `archived_fallback`) access status instead.
 */
export async function fetchSourceContent(url: string, opts?: FetchOpts): Promise<FetchedSource> {
  const fetchFn = opts?.fetchFn ?? fetch;
  const timeoutMs = timeoutOf(opts);
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;

  // One deadline for the whole fetch (headers + body), so slow origins fail
  // fast instead of hanging the investigation.
  const outerSignal = opts?.signal;
  if (outerSignal?.aborted) return { accessStatus: "unreachable" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  outerSignal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    return await fetchWithSignal(url, opts, fetchFn, maxBytes, controller.signal);
  } finally {
    outerSignal?.removeEventListener("abort", onOuterAbort);
    clearTimeout(timer);
  }
}

async function fetchWithSignal(
  url: string,
  opts: FetchOpts | undefined,
  fetchFn: typeof fetch,
  maxBytes: number,
  signal: AbortSignal
): Promise<FetchedSource> {
  const hop = await guardedGet(url, fetchFn, opts?.lookupFn, signal);
  if (hop.blocked) {
    return { accessStatus: "unreachable" };
  }
  const { res } = hop;
  if (res.status === 401 || res.status === 403) {
    await res.body?.cancel().catch(() => undefined);
    return (await tryArchiveFallback(url, opts, fetchFn, signal)) ?? { accessStatus: "paywalled" };
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    if (res.status === 404 || res.status === 410) return { accessStatus: "unreachable" };
    return (await tryArchiveFallback(url, opts, fetchFn, signal)) ?? { accessStatus: "unreachable" };
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
    await res.body?.cancel().catch(() => undefined);
    return { accessStatus: "ok" };
  }
  const html = await readCapped(res.body, res, maxBytes, signal).catch(() => null);
  if (html === null || !html) {
    return (await tryArchiveFallback(url, opts, fetchFn, signal)) ?? { accessStatus: "unreachable" };
  }
  if (PAYWALL_SIGNALS.test(html.slice(0, 4000))) {
    return (await tryArchiveFallback(url, opts, fetchFn, signal)) ?? { accessStatus: "paywalled" };
  }
  const { text, author, publishedAt } = extractReadable(html, hop.finalUrl);
  if (!text) {
    // Empty/JS-only content on plain fetch — try the archive before giving up.
    // (A headless-browser pass is intentionally not attempted per source: slow
    // and heavy for marginal gain.)
    return (await tryArchiveFallback(url, opts, fetchFn, signal)) ?? { accessStatus: "ok" };
  }
  return { content: text, author, publishedAt, accessStatus: "ok" };
}

const ENRICH_CONCURRENCY = 4;
const ENRICH_MAX_SOURCES = 6;

/**
 * Enrich the top-ranked sources lacking usable content by fetching their
 * pages (bounded concurrency). Fetch failures degrade the access status —
 * they never fail the investigation. Skipped in the test env, where the
 * mock corpus already carries content and network is forbidden.
 */
export async function enrichSources(sources: Source[], opts?: FetchOpts): Promise<Source[]> {
  if (isTestEnv()) return sources;
  const targets = sources
    .slice(0, ENRICH_MAX_SOURCES)
    .filter((s) => !(s.content ?? s.snippet ?? "").trim() || (s.content ?? s.snippet ?? "").length < MIN_READABLE_CHARS);
  if (targets.length === 0) return sources;
  const byId = new Map<string, FetchedSource>();
  const queue = targets.slice();
  await Promise.all(
    Array.from({ length: Math.min(ENRICH_CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const s = queue.shift();
        if (!s) break;
        if (!/^https?:\/\//i.test(s.url)) continue;
        const fetched = await fetchSourceContent(s.url, opts);
        byId.set(s.id, fetched);
      }
    })
  );
  return sources.map((s) => {
    const fetched = byId.get(s.id);
    if (!fetched) return s;
    return {
      ...s,
      content: fetched.content ?? s.content,
      author: fetched.author ?? s.author,
      publishedAt: fetched.publishedAt ?? s.publishedAt,
      accessStatus: fetched.accessStatus,
    };
  });
}
