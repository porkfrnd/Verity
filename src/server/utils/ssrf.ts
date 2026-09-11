import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF protection for fetching arbitrary source URLs (which come from search
 * results, not the user directly). Resolves the hostname and rejects any
 * target in a non-public range before a request is issued, on every redirect
 * hop. Lookup is injectable for tests.
 *
 * IP parsing is hand-rolled (numeric comparison) rather than net.BlockList:
 * every textual spelling of an address (compressed, hex, IPv4-mapped, …)
 * reduces to the same integer, so bypass spellings cannot slip through.
 */

function parseIPv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p) || (p.length > 1 && p.startsWith("0"))) {
      // Reject leading-zero octets (ambiguity with octal parsing).
      if (!(p.length > 1 && p.startsWith("0"))) {
        const v = Number(p);
        if (Number.isInteger(v) && v >= 0 && v <= 255) {
          n = n * 256 + v;
          continue;
        }
      }
      return null;
    }
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

const V4_BLOCKS: Array<[number, number]> = (
  ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4"] as const
).map((cidr) => {
  const [base, prefix] = cidr.split("/");
  const mask = prefix === "0" ? 0 : (0xffffffff << (32 - Number(prefix))) >>> 0;
  return [(parseIPv4(base) as number) & mask, mask] as [number, number];
});

/** Expand any textual IPv6 form to its 128-bit value. Null when invalid. */
export function expandIPv6(ip: string): bigint | null {
  let s = ip;
  // Dotted-decimal embedded tail (::ffff:1.2.3.4) → two hex groups.
  const tail = s.match(/:(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const octets = tail[1].split(".").map(Number);
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = `${s.slice(0, -tail[1].length)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const hex = /^[0-9a-fA-F]{1,4}$/;
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const rest = halves.length === 2 ? (halves[1] === "" ? [] : halves[1].split(":")) : [];
  if ([...head, ...rest].some((g) => !hex.test(g))) return null;
  if (halves.length === 1 && head.length !== 8) return null;
  const missing = 8 - head.length - rest.length;
  if (missing < 0) return null;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  return groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n);
}

const V6_BLOCKS: Array<[bigint, bigint]> = (
  ["::1/128", "::/128", "::ffff:0:0/96", "64:ff9b::/96", "100::/64", "2001::/23", "2001:db8::/32", "fc00::/7", "fe80::/10", "ff00::/8"] as const
).map((cidr) => {
  const [base, prefix] = cidr.split("/");
  const p = BigInt(prefix);
  const mask = p === 0n ? 0n : ((1n << 128n) - 1n) ^ ((1n << (128n - p)) - 1n);
  return [(expandIPv6(base) as bigint) & mask, mask] as [bigint, bigint];
});

export function isBlockedIp(ip: string): boolean {
  const normalized = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost") return true;
  const family = isIP(normalized);
  if (family === 4) {
    const n = parseIPv4(normalized);
    if (n === null) return true; // fail closed
    return V4_BLOCKS.some(([base, mask]) => (n & mask) === base);
  }
  if (family === 6) {
    const v = expandIPv6(normalized);
    if (v === null) return true; // fail closed
    return V6_BLOCKS.some(([base, mask]) => (v & mask) === base);
  }
  return false;
}

export type DnsLookupFn = (hostname: string) => Promise<{ address: string }[]>;

async function defaultLookup(hostname: string): Promise<{ address: string }[]> {
  const records = await dnsLookup(hostname, { all: true });
  return records.map((r) => ({ address: r.address }));
}

/**
 * Returns null when the hostname is safe to request, or a reason string when
 * it must be blocked. DNS failures are treated as blocking (fail closed) —
 * callers translate that into an `unreachable` access status, not a crash.
 */
export async function ssrfBlockReason(
  urlString: string,
  lookupFn: DnsLookupFn = defaultLookup
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return "invalid URL";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return `disallowed protocol ${url.protocol}`;
  }
  const host = url.hostname;
  if (!host || host === "localhost") return "blocked host";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    return isBlockedIp(host) ? "blocked IP range" : null;
  }
  let records: { address: string }[];
  try {
    records = await lookupFn(host);
  } catch {
    return "DNS resolution failed";
  }
  if (records.length === 0) return "DNS resolution failed";
  if (records.some((r) => isBlockedIp(r.address))) return "blocked IP range";
  return null;
}
