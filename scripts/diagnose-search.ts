#!/usr/bin/env tsx
/**
 * Provider-health diagnostic command (§9).
 *
 * Usage: npm run diagnose:search
 *
 * Runs entirely from this machine's Node process: DNS (A/AAAA), IPv4 vs IPv6
 * TCP connects, HTTPS probes, proxy-env inspection, then exactly ONE query
 * against each search provider. Prints per-provider connection/HTTP/parser
 * status with causes. Exits non-zero when no provider returned sources.
 */
import { diagnoseSearch, formatSearchDiagnostics } from "../src/server/services/diagnose.js";

const diag = await diagnoseSearch();
console.log(formatSearchDiagnostics(diag));
const anySources = diag.providers.some((p) => p.status === "success" && p.sources > 0);
if (!anySources) {
  console.log("\nResult: NO provider returned sources — see causes above.");
  process.exit(1);
}
console.log("\nResult: at least one provider returned sources.");
