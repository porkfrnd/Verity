import type { Investigation } from "../../shared/types.js";

const KEY_STORAGE = "verity.byok.key";
const MODEL_STORAGE = "verity.byok.model";

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
  try {
    body = await res.json();
  } catch {
    // ignore
  }
  const msg =
    body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
      ? (body as { message: string }).message
      : `Request failed with status ${res.status}`;
  return new Error(msg);
}

export async function investigateClaim(claim: string): Promise<Investigation> {
  const res = await fetch("/api/investigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claim, apiKey: getStoredKey() || undefined, model: getStoredModel() || undefined }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as Investigation;
}

export async function fetchHistoryItem(id: string): Promise<Investigation> {
  const res = await fetch(`/api/investigations/${encodeURIComponent(id)}`);
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as Investigation;
}

export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch("/api/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: getStoredKey() || undefined, model: getStoredModel() || undefined }),
  });
  if (!res.ok) return { ok: false, message: `Status ${res.status}` };
  return (await res.json()) as { ok: boolean; message: string };
}

export async function fetchHealth(): Promise<{ ok: boolean; llm: { provider: string; ok: boolean; message: string }; searchProviders: string[] }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as never;
}
