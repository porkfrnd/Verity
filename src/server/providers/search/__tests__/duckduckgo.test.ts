import { describe, expect, it } from "vitest";
import {
  DuckDuckGoSearchProvider,
  clearDuckDuckGoCache,
  parseDuckDuckGoHtml,
  resetDuckDuckGoSpacing,
  unwrapDuckDuckGoHref,
} from "../duckduckgo.js";
import { ProviderError } from "../types.js";

const PAGE = `
<html><body>
<div class="result">
  <a class="result__a" href="https://www.nasa.gov/great-wall">NASA on the Great Wall</a>
  <a class="result__snippet">Astronauts report it is hard to see with the naked eye.</a>
</div>
<div class="result">
  <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.edu%2Fpaper&amp;rut=x">Orbital visibility study</a>
  <a class="result__snippet">Peer-reviewed review of visibility limits.</a>
</div>
</body></html>`;

function stubFetch(html: string, status = 200) {
  return (async () => new Response(html, { status, headers: { "Content-Type": "text/html" } })) as typeof fetch;
}

describe("duckduckgo provider", () => {
  it("unwraps redirect links and parses titles/snippets", () => {
    expect(unwrapDuckDuckGoHref("/l/?uddg=https%3A%2F%2Fexample.edu%2Fpaper&rut=x")).toBe("https://example.edu/paper");
    expect(unwrapDuckDuckGoHref("https://a.com/x")).toBe("https://a.com/x");
    const out = parseDuckDuckGoHtml(PAGE);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ title: "NASA on the Great Wall", url: "https://www.nasa.gov/great-wall" });
    expect(out[1].url).toBe("https://example.edu/paper");
  });

  it("returns [] for genuine no-result pages", () => {
    expect(parseDuckDuckGoHtml('<html><body><div class="no-results">No results</div></body></html>')).toEqual([]);
  });

  it("throws a provider error when markup is unrecognizable (not a crash)", () => {
    expect(() => parseDuckDuckGoHtml("<html><body><div class='captcha'>prove human</div></body></html>")).toThrow(
      /markup changed or request blocked/
    );
  });

  it("searches with UA + spacing, caches identical queries, surfaces HTTP errors", async () => {
    clearDuckDuckGoCache();
    resetDuckDuckGoSpacing();
    let calls = 0;
    const seen: string[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      calls++;
      seen.push(String((init?.headers as Record<string, string>)?.["User-Agent"] ?? ""));
      return new Response(PAGE, { status: 200, headers: { "Content-Type": "text/html" } });
    }) as typeof fetch;
    const p = new DuckDuckGoSearchProvider({ fetchFn, minGapMs: 0 });
    const first = await p.search("great wall visible", { count: 5 });
    expect(first).toHaveLength(2);
    expect(seen[0]).toMatch(/Verity/);
    const second = await p.search("great wall visible", { count: 5 });
    expect(second).toHaveLength(2);
    expect(calls).toBe(1); // served from query cache

    clearDuckDuckGoCache();
    const failing = new DuckDuckGoSearchProvider({ fetchFn: stubFetch("err", 503), minGapMs: 0 });
    await expect(failing.search("x".repeat(8))).rejects.toThrow(/status 503/);
  });

  it("caches full results so later larger-count requests are not short-changed", async () => {
    clearDuckDuckGoCache();
    resetDuckDuckGoSpacing();
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response(PAGE, { status: 200, headers: { "Content-Type": "text/html" } });
    }) as typeof fetch;
    const p = new DuckDuckGoSearchProvider({ fetchFn, minGapMs: 0 });
    expect((await p.search("great wall visible", { count: 1 })).length).toBe(1);
    expect((await p.search("great wall visible", { count: 5 })).length).toBe(2);
    expect(calls).toBe(1);
  });

  it("honors caller abort signals", async () => {
    clearDuckDuckGoCache();
    resetDuckDuckGoSpacing();
    const p = new DuckDuckGoSearchProvider({
      fetchFn: stubFetch(PAGE),
      minGapMs: 0,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(p.search("great wall visible here", { signal: controller.signal })).rejects.toThrow(/abort/i);
  });

  it("classifies HTTP 202 as blocked (throttle page), not a parse case", async () => {
    clearDuckDuckGoCache();
    resetDuckDuckGoSpacing();
    const blockPage = "<html><head><title>Attention Required</title></head><body>challenge, verify you are human</body></html>";
    const p = new DuckDuckGoSearchProvider({
      fetchFn: stubFetch(blockPage, 202),
      minGapMs: 0,
    });
    const err = await p.search("water boils deeply").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).category).toBe("blocked");
    expect((err as ProviderError).httpStatus).toBe(202);
    expect((err as ProviderError).detail).toMatchObject({ hasAnomaly: true });
    expect(JSON.stringify((err as ProviderError).detail)).not.toContain("verify you are human");
  });

  it("empty queries never hit the network", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response("", { status: 200 });
    }) as typeof fetch;
    const p = new DuckDuckGoSearchProvider({ fetchFn, minGapMs: 0 });
    expect(await p.search("   ")).toEqual([]);
    expect(calls).toBe(0);
  });
});
