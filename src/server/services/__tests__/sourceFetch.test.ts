import { describe, expect, it } from "vitest";
import { extractReadable, fetchSourceContent } from "../sourceFetch.js";

const ARTICLE = `
<html><head><title>Wall study</title>
<meta property="article:published_time" content="2024-05-01" />
</head><body>
<nav>menu noise</nav>
<article>
<h1>Orbital visibility study</h1>
<p>Astronauts report the Great Wall is very difficult to see with the naked eye from low Earth orbit.</p>
<p>Photographs taken with telephoto lenses do show it under favorable conditions and careful analysis.</p>
<p>Researchers conclude that contrast and resolution limits prevent unaided visibility from the station.</p>
<p>The finding has been replicated across multiple expeditions with consistent observational records.</p>
</article>
<footer>footer noise</footer>
</body></html>`;

const publicLookup = async () => [{ address: "93.184.216.34" }];

/** Stub fetch: archive API has no snapshot; everything else returns `page`. */
function stubFetch(page: { status: number; body: string; contentType?: string }) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("archive.org/wayback/available")) {
      return new Response(JSON.stringify({ archived_snapshots: {} }), { status: 200 });
    }
    return new Response(page.body, {
      status: page.status,
      headers: { "Content-Type": page.contentType ?? "text/html" },
    });
  }) as typeof fetch;
}

describe("sourceFetch", () => {
  it("extracts readable main content, strips boilerplate, keeps metadata", () => {
    const out = extractReadable(ARTICLE, "https://example.edu/paper");
    expect(out.text).toMatch(/Astronauts report/);
    expect(out.text).not.toMatch(/menu noise/);
    expect(out.publishedAt).toBe("2024-05-01");
  });

  it("fetches + extracts article content end to end", async () => {
    const out = await fetchSourceContent("https://example.edu/paper", {
      fetchFn: stubFetch({ status: 200, body: ARTICLE }),
      lookupFn: publicLookup,
    });
    expect(out.accessStatus).toBe("ok");
    expect(out.content).toMatch(/telephoto/);
  });

  it("never throws: 404 → unreachable, paywall text → paywalled", async () => {
    const notFound = await fetchSourceContent("https://example.edu/gone", {
      fetchFn: stubFetch({ status: 404, body: "nope" }),
      lookupFn: publicLookup,
    });
    expect(notFound).toMatchObject({ accessStatus: "unreachable" });

    const paywalled = await fetchSourceContent("https://news.example.com/walled", {
      fetchFn: stubFetch({ status: 200, body: "<html><body><p>Subscribe to continue reading this exclusive story now.</p><p>" + "x ".repeat(300) + "</p></body></html>" }),
      lookupFn: publicLookup,
    });
    expect(paywalled.accessStatus).toBe("paywalled");
  });

  it("blocks redirect targets in private ranges (SSRF via redirect)", async () => {
    const redirecting = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("archive.org")) {
        return new Response(JSON.stringify({ archived_snapshots: {} }), { status: 200 });
      }
      return new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/latest/meta-data" } });
    }) as typeof fetch;
    const out = await fetchSourceContent("https://example.edu/start", {
      fetchFn: redirecting,
      lookupFn: publicLookup,
    });
    expect(out.accessStatus).toBe("unreachable");
    expect(out.content).toBeUndefined();
  });

  it("skips non-HTML bodies without failing", async () => {
    const out = await fetchSourceContent("https://example.edu/file.pdf", {
      fetchFn: stubFetch({ status: 200, body: "%PDF-1.4...", contentType: "application/pdf" }),
      lookupFn: publicLookup,
    });
    expect(out).toMatchObject({ accessStatus: "ok" });
    expect(out.content).toBeUndefined();
  });

  it("uses archive.org fallback and marks archived_fallback", async () => {
    const withArchive = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("archive.org/wayback/available")) {
        return new Response(
          JSON.stringify({ archived_snapshots: { closest: { url: "https://web.archive.org/web/20240101/https://news.example.com/w", status: "200" } } }),
          { status: 200 }
        );
      }
      if (url.includes("web.archive.org")) {
        return new Response(ARTICLE, { status: 200, headers: { "Content-Type": "text/html" } });
      }
      return new Response("down", { status: 500 });
    }) as typeof fetch;
    const out = await fetchSourceContent("https://news.example.com/w", {
      fetchFn: withArchive,
      lookupFn: publicLookup,
    });
    expect(out.accessStatus).toBe("archived_fallback");
    expect(out.content).toMatch(/Astronauts report/);
  });
});
