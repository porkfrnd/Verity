import { describe, expect, it } from "vitest";
import { formatSearchDiagnostics, type SearchDiagnostics } from "../diagnose.js";

function diag(): SearchDiagnostics {
  return {
    network: {
      node: "v24.21.0",
      fetchImpl: "native fetch",
      dns: [{ host: "en.wikipedia.org", a: ["1.2.3.4"], aaaa: [], latencyMs: 12, error: null }],
      tcp: [
        { host: "en.wikipedia.org", family: 4, address: "1.2.3.4", connected: true, latencyMs: 30, error: null },
        { host: "en.wikipedia.org", family: 6, address: null, connected: false, latencyMs: 0, error: "skipped (no AAAA records)" },
      ],
      http: [{ host: "en.wikipedia.org", httpStatus: 200, finalHost: "en.wikipedia.org", latencyMs: 200, error: null }],
      proxy: { httpProxy: false, httpsProxy: false, allProxy: false, noProxy: null, note: "n/a" },
    },
    providers: [
      { provider: "wikipedia", status: "success", category: "ok", latencyMs: 300, sources: 2, retries: 0, attempts: [], error: null },
      { provider: "duckduckgo", status: "timeout", category: "network", latencyMs: 15000, sources: 0, retries: 1, attempts: ["timeout:ETIMEDOUT", "timeout:ETIMEDOUT"], httpStatus: undefined, error: "timed out" },
    ],
  };
}

describe("formatSearchDiagnostics", () => {
  it("renders the §9 provider-health shape with PASS/FAIL, causes, and attempts", () => {
    const out = formatSearchDiagnostics(diag());
    expect(out).toContain("Verity Search Diagnostics");
    expect(out).toContain("Node: v24.21.0");
    expect(out).toContain("DNS ............ PASS");
    expect(out).toContain("IPv4 ........... PASS");
    expect(out).toContain("IPv6 ........... SKIP");
    expect(out).toContain("HTTPS .......... PASS");
    expect(out).toContain("wikipedia");
    expect(out).toContain("connection .... PASS");
    expect(out).toContain("duckduckgo");
    expect(out).toContain("connection .... FAIL");
    expect(out).toContain("attempts ...... timeout:ETIMEDOUT → timeout:ETIMEDOUT");
    expect(out).toContain("Proxy: HTTP_PROXY=unset");
  });

  it("marks global failure distinctly from provider failure", () => {
    const d = diag();
    d.network.dns = [{ host: "x", a: [], aaaa: [], latencyMs: 1, error: "EAI_AGAIN" }];
    d.network.tcp = [];
    d.network.http = [];
    const out = formatSearchDiagnostics(d);
    expect(out).toContain("DNS ............ FAIL");
    expect(out).toContain("IPv4 ........... FAIL");
  });

  it("never prints proxy values, queries, or keys", () => {
    const d = diag();
    d.network.proxy = { httpProxy: true, httpsProxy: true, allProxy: false, noProxy: "localhost", note: "n" };
    const out = formatSearchDiagnostics(d);
    expect(out).toContain("HTTP_PROXY=set");
    expect(out).not.toContain("gsk_");
  });
});
