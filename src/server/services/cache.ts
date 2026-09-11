import { createHash } from "node:crypto";
import type { Investigation } from "../../shared/types.js";
import { normalizeClaimText } from "../utils/text.js";

const cache = new Map<string, { investigation: Investigation; expires: number }>();
const TTL_MS = 1000 * 60 * 30; // 30 minutes

export function cacheKeyForClaim(claim: string): string {
  return createHash("sha256").update(normalizeClaimText(claim)).digest("hex").slice(0, 32);
}

export function getCached(key: string): Investigation | undefined {
  const cacheKey = cacheKeyForClaim(key);
  const entry = cache.get(cacheKey);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(cacheKey);
    return undefined;
  }
  // Deep copy: callers must not mutate the cached entry through shared refs.
  return { ...structuredClone(entry.investigation), cached: true };
}

export function setCached(key: string, investigation: Investigation): void {
  const cacheKey = cacheKeyForClaim(key);
  cache.set(cacheKey, { investigation: structuredClone(investigation), expires: Date.now() + TTL_MS });
  // Bound size
  if (cache.size > 200) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
}

export function clearCache(): void {
  cache.clear();
}
