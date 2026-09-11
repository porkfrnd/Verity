import { describe, expect, it } from "vitest";
import { SearXNGSearchProvider } from "../searxng.js";
import { FactCheckProvider } from "../factcheck.js";
import { WikipediaSearchProvider, cleanWikiSnippet } from "../wikipedia.js";

describe("searxng provider", () => {
  it("maps JSON results and filters non-http urls", async () => {
    const fetchFn = (async () =>
      new Response(
        JSON.stringify({
          results: [
            { title: "A", url: "https://a.com/1", content: "snippet a" },
            { title: "B", url: "ftp://b.com/2", content: "skip me" },
          ],
        }),
        { status: 200 }
      )) as typeof fetch;
    const p = new SearXNGSearchProvider({ baseUrl: "https://search.example.com", fetchFn });
    const out = await p.search("great wall");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "A", url: "https://a.com/1" });
  });

  it("requires configuration and surfaces HTTP errors", async () => {
    const p = new SearXNGSearchProvider({ baseUrl: "" });
    await expect(p.search("climate change today")).rejects.toThrow(/not configured/);
    const failing = new SearXNGSearchProvider({
      baseUrl: "https://search.example.com",
      fetchFn: (async () => new Response("nope", { status: 500 })) as typeof fetch,
    });
    await expect(failing.search("climate change today")).rejects.toThrow(/status 500/);
  });
});

describe("wikipedia provider", () => {
  it("builds article urls and strips highlight markup", async () => {
    expect(cleanWikiSnippet('The <span class="searchmatch">Great Wall</span> is &amp; long')).toBe("The Great Wall is & long");
    expect(cleanWikiSnippet("Earth&#039;s pressure &amp; water&#x27;s point")).toBe("Earth's pressure & water's point");
    const fetchFn = (async () =>
      new Response(
        JSON.stringify({ query: { search: [{ title: "Great Wall of China", snippet: 'long <span class="searchmatch">wall</span>' }] } }),
        { status: 200 }
      )) as typeof fetch;
    const p = new WikipediaSearchProvider({ fetchFn });
    const out = await p.search("great wall of china");
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://en.wikipedia.org/wiki/Great_Wall_of_China");
    expect(out[0].snippet).toBe("long wall");
  });

  it("empty queries never hit the network; HTTP errors throw typed errors", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response("", { status: 200 });
    }) as typeof fetch;
    const p = new WikipediaSearchProvider({ fetchFn });
    expect(await p.search("  ")).toEqual([]);
    expect(calls).toBe(0);
    const failing = new WikipediaSearchProvider({
      fetchFn: (async () => new Response("x", { status: 429 })) as typeof fetch,
    });
    await expect(failing.search("water boils")).rejects.toThrow(/status 429/);
  });
});

describe("factcheck provider", () => {
  const payload = {
    claims: [
      {
        text: "c1",
        claimReview: [
          { title: "R1", url: "https://fc.example.com/1", reviewRating: { textualRating: "False" } },
          { title: "R2", url: "https://fc.example.com/2", reviewRating: { textualRating: "True" } },
          { title: "R3", url: "https://fc.example.com/3" },
        ],
      },
    ],
  };

  it("returns [] without a key or for blank queries (no network)", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    expect(await new FactCheckProvider("", { fetchFn }).search("anything")).toEqual([]);
    expect(await new FactCheckProvider("k", { fetchFn }).search("   ")).toEqual([]);
    expect(calls).toBe(0);
  });

  it("respects count, flags hits, and always sends an abort signal (timeout)", async () => {
    let seenSignal: unknown = null;
    const fetchFn = (async (_input: unknown, init?: { signal?: AbortSignal }) => {
      seenSignal = init?.signal ?? null;
      return new Response(JSON.stringify(payload), { status: 200 });
    }) as typeof fetch;
    const p = new FactCheckProvider("k", { fetchFn });
    const out = await p.search("great wall", { count: 2 });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ url: "https://fc.example.com/1", isFactCheck: true });
    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });

  it("degrades to [] on API errors instead of throwing", async () => {
    const failing = new FactCheckProvider("k", {
      fetchFn: (async () => new Response("err", { status: 500 })) as typeof fetch,
    });
    await expect(failing.search("great wall")).resolves.toEqual([]);
  });
});
