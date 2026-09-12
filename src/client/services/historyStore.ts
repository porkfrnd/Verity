import type { Investigation } from "../../shared/types.js";

/**
 * User-owned client-side history. Completed investigations are persisted in
 * the END USER'S browser localStorage only — the server never receives,
 * stores, or maintains history. All functions are total: storage failures,
 * malformed data, and quota errors degrade to best-effort behavior and never
 * throw, so Verity keeps working with persistence silently unavailable.
 */

export const HISTORY_STORAGE_KEY = "verity.history.v1";
export const MAX_HISTORY_ITEMS = 50;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // private/restricted environments — persistence unavailable, app unaffected
  }
  return null;
}

const SECRET_KEY_PATTERN = /api.?key|token|secret|password|credential|authorization|session/i;

/** Defensive deep-strip of anything credential-shaped (responses must never contain these). */
export function sanitizeInvestigation(inv: Investigation): Investigation {
  const scrub = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (SECRET_KEY_PATTERN.test(k)) continue;
        out[k] = scrub(v);
      }
      return out;
    }
    return value;
  };
  return scrub(inv) as Investigation;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Structural gate: only records that can actually render are restorable. */
export function isValidInvestigation(v: unknown): v is Investigation {
  if (!isRecord(v)) return false;
  if (typeof v.id !== "string" || v.id.length === 0) return false;
  if (typeof v.originalClaim !== "string" || v.originalClaim.length === 0) return false;
  if (!Array.isArray(v.results)) return false;
  if (typeof v.createdAt !== "string" || Number.isNaN(Date.parse(v.createdAt))) return false;
  if (v.depth !== undefined && v.depth !== "flash" && v.depth !== "deep" && v.depth !== "extended") return false;
  return true;
}

function byNewest(a: Investigation, b: Investigation): number {
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/** Load newest-first history. Corrupt/missing storage yields [] — never throws. */
export function loadHistory(storage: StorageLike | null = defaultStorage()): Investigation[] {
  try {
    const raw = storage?.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidInvestigation).sort(byNewest).slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

/**
 * Persist newest-first history. On quota errors, evict the oldest half and
 * retry once. Returns whether persistence is active. Never throws.
 */
export function saveHistory(items: Investigation[], storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return false;
  const attempt = (list: Investigation[]): boolean => {
    try {
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(list.slice(0, MAX_HISTORY_ITEMS)));
      return true;
    } catch {
      return false;
    }
  };
  if (attempt(items)) return true;
  // Likely quota: drop the oldest half and retry once before giving up.
  if (items.length > 1 && attempt(items.slice(0, Math.ceil(items.length / 2)))) return true;
  try {
    storage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // ignore — persistence simply unavailable
  }
  return false;
}

/** Prepend (dedupe by id, cap, persist best-effort). Returns the new list. */
export function addToHistory(
  items: Investigation[],
  inv: Investigation,
  storage: StorageLike | null = defaultStorage()
): Investigation[] {
  const next = [sanitizeInvestigation(inv), ...items.filter((h) => h.id !== inv.id)].slice(0, MAX_HISTORY_ITEMS);
  saveHistory(next, storage);
  return next;
}

/** Remove one record by id, persist best-effort. Returns the new list. */
export function removeFromHistory(
  items: Investigation[],
  id: string,
  storage: StorageLike | null = defaultStorage()
): Investigation[] {
  const next = items.filter((h) => h.id !== id);
  saveHistory(next, storage);
  return next;
}

/** Clear all records (caller confirms first). Returns []. */
export function clearHistory(storage: StorageLike | null = defaultStorage()): Investigation[] {
  try {
    storage?.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    // ignore
  }
  return [];
}
