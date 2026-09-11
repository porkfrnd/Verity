import { createHash } from "node:crypto";
import type { Investigation } from "../../shared/types.js";
import { normalizeClaimText } from "../utils/text.js";

const cache = new Map<string, { investigation: Investigation; expires: number }>();
const TTL_MS = 1000 * 60 * 30; // 30 minutes

export function cacheKeyForClaim(claim: string): string {
  return createHash("sha256").update(normalizeClaimText(claim)).digest("hex").slice(0, 32);
}

export function getCached(claim: string): Investigation | undefined {
  const key = cacheKeyForClaim(claim);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return undefined;
  }
  return { ...entry.investigation, cached: true };
}

export function setCached(claim: string, investigation: Investigation): void {
  const key = cacheKeyForClaim(claim);
  cache.set(key, { investigation, expires: Date.now() + TTL_MS });
  // Bound size
  if (cache.size > 200) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
}

export function clearCache(): void {
  cache.clear();
}
