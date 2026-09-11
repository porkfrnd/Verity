import type { Investigation, ProviderReport, SearchDepth } from "../../shared/types.js";

const KEY_STORAGE = "verity.byok.key";
const MODEL_STORAGE = "verity.byok.model";

export const API_UNREACHABLE_MESSAGE =
  "Cannot reach the API server. Start it with `npm run dev:server` in a second terminal (keep `npm run dev` running too), then retry.";

export function getStoredKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setStoredKey(key: string): void {
  try {
    if (key) sessionStorage.setItem(KEY_STORAGE, key);
    else sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    // session-only; ignore storage failures
  }
}

export function getStoredModel(): string {
  try {
    return sessionStorage.getItem(MODEL_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setStoredModel(model: string): void {
  try {
    if (model) sessionStorage.setItem(MODEL_STORAGE, model);
    else sessionStorage.removeItem(MODEL_STORAGE);
  } catch {
    // ignore
  }
}

async function parseError(res: Response): Promise<Error> {
  let body: unknown = null;
  let json = false;
  try {
    body = await res.json();
    json = true;
  } catch {
    // Non-JSON error body (e.g. the dev proxy's 500 page when the API is down).
  }
  if (
    json &&
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as { message: unknown }).message === "string"
  ) {
    return new Error((body as { message: string }).message);
  }
  // Our API always answers JSON errors; a non-JSON 5xx means the request never
  // reached it (dev proxy ECONNREFUSED → 500). Say so actionably.
  if (!json && res.status >= 500) return new Error(API_UNREACHABLE_MESSAGE);
  return new Error(`Request failed with status ${res.status}`);
}

async function fetchJson(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (e) {
    // Intentional cancellations are the caller's to handle, not outages.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error(API_UNREACHABLE_MESSAGE);
  }
}

export async function investigateClaim(claim: string, depth?: SearchDepth): Promise<Investigation> {
  const res = await fetchJson("/api/investigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claim, apiKey: getStoredKey() || undefined, model: getStoredModel() || undefined, depth }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as Investigation;
}

export type StreamEvent =
  | { type: "provider"; claimId: string; wave: number; report: ProviderReport }
  | { type: "dedup"; claimId: string; totalFound: number; uniqueCount: number }
  | { type: "early_stop"; claimId: string; reason: string }
  | { type: "budget_exhausted"; claimId: string }
  | { type: "analyzing"; claimId: string }
  | { type: "claim"; claimId: string; verdict: string; searchFailed: boolean }
  | { type: "done"; investigation: Investigation }
  | { type: "error"; message: string };

/** Parse one SSE buffer into complete events (exported for tests). */
export function parseSseBuffer(buffer: string): { events: Array<{ type: string; data: unknown }>; rest: string } {
  const events: Array<{ type: string; data: unknown }> = [];
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  for (const frame of frames) {
    let type = "message";
    let data = "";
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) continue;
    try {
      events.push({ type, data: JSON.parse(data) });
    } catch {
      // Ignore malformed frames; the stream continues.
    }
  }
  return { events, rest };
}

/**
 * Stream an investigation, invoking onEvent for live progress. Resolves with
 * the final investigation on `done`, rejects on `error`/abort/failure.
 */
export async function investigateClaimStream(
  claim: string,
  depth: SearchDepth,
  onEvent: (e: StreamEvent) => void,
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<Investigation> {
  const timeout = AbortSignal.timeout(opts?.timeoutMs ?? 170_000);
  const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch("/api/investigate/stream", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ claim, apiKey: getStoredKey() || undefined, model: getStoredModel() || undefined, depth }),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new Error(API_UNREACHABLE_MESSAGE);
  }
  if (!res.ok) throw await parseError(res);
  if (!res.body) throw new Error(API_UNREACHABLE_MESSAGE);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseBuffer(buffer);
        buffer = parsed.rest;
        for (const { type, data } of parsed.events) {
          if (type === "done") return (data as { investigation?: Investigation }).investigation ?? (data as unknown as Investigation);
          if (type === "error") throw new Error((data as { message?: string }).message ?? "Investigation failed.");
          onEvent({ type: type as StreamEvent["type"], ...(data as object) } as StreamEvent);
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  // Server closed the stream without a verdict — fall back to plain POST upstream.
  throw new Error("STREAM_INCOMPLETE");
}

export async function recheckInvestigation(id: string): Promise<Investigation> {
  const res = await fetchJson(`/api/investigations/${encodeURIComponent(id)}/recheck`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: getStoredKey() || undefined, model: getStoredModel() || undefined }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as Investigation;
}

export async function fetchHistoryItem(id: string): Promise<Investigation> {
  const res = await fetchJson(`/api/investigations/${encodeURIComponent(id)}`);
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as Investigation;
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  let res: Response;
  try {
    res = await fetchJson("/api/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: getStoredKey() || undefined, model: getStoredModel() || undefined }),
    });
  } catch {
    // fetchJson only throws Error (AbortError aside, which has no caller yet).
    return { ok: false, message: API_UNREACHABLE_MESSAGE };
  }
  if (!res.ok) {
    const err = await parseError(res);
    return { ok: false, message: err.message };
  }
  return (await res.json()) as { ok: boolean; message: string };
}

export async function fetchHealth(): Promise<{ ok: boolean; llm: { provider: string; ok: boolean; message: string }; searchProviders: string[] }> {
  const res = await fetchJson("/api/health");
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { ok: boolean; llm: { provider: string; ok: boolean; message: string }; searchProviders: string[] };
}
