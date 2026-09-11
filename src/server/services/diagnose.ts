import { connect } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";
import type { ProviderReport } from "../../shared/types.js";
import { DuckDuckGoSearchProvider } from "../providers/search/duckduckgo.js";
import { DuckDuckGoInstantProvider } from "../providers/search/ddgInstant.js";
import { FactCheckProvider } from "../providers/search/factcheck.js";
import { GdeltSearchProvider } from "../providers/search/gdelt.js";
import { OpenAlexSearchProvider } from "../providers/search/openalex.js";
import { SearXNGSearchProvider } from "../providers/search/searxng.js";
import { WikipediaSearchProvider } from "../providers/search/wikipedia.js";
import { describeError, type ErrorCauseInfo } from "../providers/search/types.js";
import { runSearchAllWith } from "./search.js";

/** The single fixed probe query used for provider diagnostics (never user input). */
export const DIAGNOSE_PROBE_QUERY = "Water boils at 100°C at sea level";

export interface DnsDiagnosis {
  host: string;
  a: string[];
  aaaa: string[];
  latencyMs: number;
  error: string | null;
}

export interface TcpDiagnosis {
  host: string;
  family: 4 | 6;
  address: string | null;
  connected: boolean;
  latencyMs: number;
  error: string | null;
}

export interface HttpDiagnosis {
  host: string;
  httpStatus: number | null;
  finalHost: string | null;
  latencyMs: number;
  error: ErrorCauseInfo | null;
}

export interface ProxyDiagnosis {
  httpProxy: boolean;
  httpsProxy: boolean;
  allProxy: boolean;
  noProxy: string | null;
  /** Node's native fetch ignores env proxies unless a ProxyAgent is configured. */
  note: string;
}

export interface NetworkDiagnosis {
  node: string;
  fetchImpl: string;
  dns: DnsDiagnosis[];
  tcp: TcpDiagnosis[];
  http: HttpDiagnosis[];
  proxy: ProxyDiagnosis;
}

function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; latencyMs: number; error: unknown }> {
  const started = Date.now();
  return fn().then(
    (result) => ({ result, latencyMs: Date.now() - started, error: null as unknown }),
    (error: unknown) => ({ result: null, latencyMs: Date.now() - started, error })
  );
}

function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([fn().finally(() => clearTimeout(timer)), timeout]);
}

async function diagnoseDns(host: string): Promise<DnsDiagnosis> {
  const started = Date.now();
  const [v4, v6] = await Promise.all([
    timed(() => withTimeout(5000, () => resolve4(host))),
    timed(() => withTimeout(5000, () => resolve6(host))),
  ]);
  const err = v4.error && v6.error ? String((v4.error as Error)?.message ?? v4.error) : null;
  return {
    host,
    a: v4.result ?? [],
    aaaa: v6.result ?? [],
    latencyMs: Date.now() - started,
    error: err,
  };
}

function tcpConnect(host: string, family: 4 | 6, address?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: address ?? host, port: 443, family, timeout: 5000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("timeout", () => {
      socket.destroy(new Error("TCP connect timed out"));
    });
    socket.once("error", (e) => reject(e));
  });
}

async function diagnoseTcp(host: string, dns: DnsDiagnosis): Promise<TcpDiagnosis[]> {
  const out: TcpDiagnosis[] = [];
  const families: Array<{ family: 4 | 6; addresses: string[] }> = [
    { family: 4, addresses: dns.a },
    { family: 6, addresses: dns.aaaa },
  ];
  for (const { family, addresses } of families) {
    if (addresses.length === 0) {
      out.push({ host, family, address: null, connected: false, latencyMs: 0, error: family === 6 ? "skipped (no AAAA records)" : "skipped (no A records)" });
      continue;
    }
    const started = Date.now();
    try {
      await tcpConnect(host, family, addresses[0]);
      out.push({ host, family, address: addresses[0], connected: true, latencyMs: Date.now() - started, error: null });
    } catch (e) {
      const d = describeError(e);
      out.push({
        host,
        family,
        address: addresses[0],
        connected: false,
        latencyMs: Date.now() - started,
        error: [d.causeMessage || d.message, d.code].filter(Boolean).join(" ").slice(0, 200) || "connect failed",
      });
    }
  }
  return out;
}

async function diagnoseHttp(host: string): Promise<HttpDiagnosis> {
  const started = Date.now();
  const timeout = AbortSignal.timeout(10000);
  try {
    const res = await fetch(`https://${host}/`, {
      signal: timeout,
      redirect: "follow",
      headers: { "User-Agent": "Verity/0.1 (diagnostic probe)" },
    });
    await res.body?.cancel().catch(() => undefined);
    let finalHost: string | null = null;
    try {
      finalHost = new URL(res.url).hostname;
    } catch {
      finalHost = null;
    }
    return { host, httpStatus: res.status, finalHost, latencyMs: Date.now() - started, error: null };
  } catch (e) {
    return { host, httpStatus: null, finalHost: null, latencyMs: Date.now() - started, error: describeError(e) };
  }
}

const DIAGNOSE_HOSTS = [
  "html.duckduckgo.com",
  "api.duckduckgo.com",
  "en.wikipedia.org",
  "api.openalex.org",
  "api.gdeltproject.org",
];

/** §2–§6: can this Node process reach the outside internet at all? */
export async function diagnoseNetwork(): Promise<NetworkDiagnosis> {  const dns = await Promise.all(DIAGNOSE_HOSTS.map(diagnoseDns));
  const tcp = (await Promise.all(dns.map((d) => diagnoseTcp(d.host, d)))).flat();
  const http = await Promise.all(DIAGNOSE_HOSTS.map(diagnoseHttp));
  return {
    node: process.version,
    fetchImpl: `native ${typeof fetch === "function" ? (fetch.name || "fetch") : typeof fetch}`,
    dns,
    tcp,
    http,
    proxy: {
      httpProxy: !!(process.env.HTTP_PROXY || process.env.http_proxy),
      httpsProxy: !!(process.env.HTTPS_PROXY || process.env.https_proxy),
      allProxy: !!(process.env.ALL_PROXY || process.env.all_proxy),
      noProxy: process.env.NO_PROXY ?? process.env.no_proxy ?? null,
      note: "Values never printed (may contain credentials). Node native fetch ignores env proxies unless a ProxyAgent/dispatcher is configured; Verity configures none.",
    },
  };
}

/** §9/§14: exactly ONE query against each provider, individually. */
export async function diagnoseProviders(providers?: import("../providers/search/types.js").SearchProvider[]): Promise<ProviderReport[]> {
  const list =
    providers ??
    [
      new DuckDuckGoSearchProvider(),
      new DuckDuckGoInstantProvider(),
      new WikipediaSearchProvider(),
      new OpenAlexSearchProvider(),
      new GdeltSearchProvider(),
      ...(process.env.SEARXNG_URL?.trim() ? [new SearXNGSearchProvider()] : []),
      ...(process.env.FACTCHECK_API_KEY?.trim() ? [new FactCheckProvider()] : []),
    ];
  // Sequential: the point is per-provider isolation, not speed. Each provider
  // gets only the single probe query (queryBudget respected internally).
  const reports: ProviderReport[] = [];
  for (const p of list) {
    const run = await runSearchAllWith([p], [DIAGNOSE_PROBE_QUERY], { count: 3, maxAttempts: 1, retryDelayMs: 0 });
    reports.push(...run.reports);
  }
  return reports;
}

export interface SearchDiagnostics {
  network: NetworkDiagnosis;
  providers: ProviderReport[];
}

export async function diagnoseSearch(): Promise<SearchDiagnostics> {
  const [network, providers] = await Promise.all([diagnoseNetwork(), diagnoseProviders()]);
  return { network, providers };
}

function passFail(ok: boolean): string {
  return ok ? "PASS" : "FAIL";
}

/** Render the §9 provider-health report. Pure function (fully unit-tested). */
export function formatSearchDiagnostics(d: SearchDiagnostics): string {
  const lines: string[] = [];
  lines.push("Verity Search Diagnostics", "");
  lines.push(`Node: ${d.network.node} (${d.network.fetchImpl})`, "");
  lines.push("Network:");
  const dnsOk = d.network.dns.some((x) => x.a.length > 0 || x.aaaa.length > 0);
  const v4Ok = d.network.tcp.some((x) => x.family === 4 && x.connected);
  const v6Ok = d.network.tcp.some((x) => x.family === 6 && x.connected);
  const v6Attempted = d.network.tcp.some((x) => x.family === 6 && x.address !== null);
  const httpsOk = d.network.http.some((x) => x.httpStatus !== null);
  lines.push(`DNS ............ ${passFail(dnsOk)}`);
  lines.push(`IPv4 ........... ${passFail(v4Ok)}`);
  lines.push(`IPv6 ........... ${v6Attempted ? passFail(v6Ok) : "SKIP (no AAAA records)"}`);
  lines.push(`HTTPS .......... ${passFail(httpsOk)}`);
  for (const x of d.network.dns) {
    lines.push(`  ${x.host}: A=[${x.a.join(",") || "—"}] AAAA=[${x.aaaa.join(",") || "—"}] ${x.latencyMs}ms${x.error ? ` ERROR ${x.error}` : ""}`);
  }
  for (const x of d.network.tcp) {
    const state = x.connected
      ? `connected ${x.latencyMs}ms`
      : x.error?.startsWith("skipped")
        ? x.error
        : `FAILED ${x.error ?? ""}`;
    lines.push(`  TCP ${x.host} IPv${x.family}: ${state}`);
  }
  for (const x of d.network.http) {
    lines.push(
      `  HTTPS ${x.host}: ${x.httpStatus !== null ? `HTTP ${x.httpStatus} ${x.latencyMs}ms${x.finalHost && x.finalHost !== x.host ? ` → ${x.finalHost}` : ""}` : `FAILED ${x.error?.causeMessage || x.error?.message || ""}`}
    `.trimEnd()
    );
  }
  const p = d.network.proxy;
  lines.push(
    `Proxy: HTTP_PROXY=${p.httpProxy ? "set" : "unset"} HTTPS_PROXY=${p.httpsProxy ? "set" : "unset"} ALL_PROXY=${p.allProxy ? "set" : "unset"}${p.noProxy ? ` NO_PROXY=${p.noProxy}` : ""}`
  );
  lines.push("", "Providers (one query each):", "");
  for (const r of d.providers) {
    const conn = r.status === "success" ? "PASS" : "FAIL";
    lines.push(`${r.provider}`);
    lines.push(`  connection .... ${conn} (${r.category})`);
    if (typeof r.httpStatus === "number") lines.push(`  HTTP .......... ${r.httpStatus}`);
    if (r.status === "success") lines.push(`  sources ....... ${r.sources}`);
    if (r.attempts.length > 0) lines.push(`  attempts ...... ${r.attempts.join(" → ")}`);
    if (r.error) lines.push(`  cause ......... ${r.error}`);
  }
  return lines.join("\n");
}
