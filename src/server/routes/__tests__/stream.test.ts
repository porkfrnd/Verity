import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../routes/app.js";
import { clearInvestigations } from "../../services/store.js";
import { clearCache } from "../../services/cache.js";

const { runSearchAllWithMock } = vi.hoisted(() => ({ runSearchAllWithMock: vi.fn() }));

vi.mock("../../services/search.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/search.js")>();
  return { ...actual, runSearchAllWith: runSearchAllWithMock };
});

function okReport(provider: string) {
  return { provider, status: "success" as const, latencyMs: 50, sources: 2, retries: 0, error: null };
}

const hits = [
  { title: "Study A", url: "https://journal.example.com/a", snippet: "Evidence shows the effect is real and replicated.", sourceType: "academic" as const },
  { title: "Review B", url: "https://news.example.com/b", snippet: "Independent review confirms the finding.", sourceType: "news" as const },
];

beforeEach(() => {
  clearInvestigations();
  clearCache();
  vi.clearAllMocks();
  delete process.env.GROQ_API_KEY;
  delete process.env.SEARXNG_URL;
});

function parseSse(text: string): Array<{ event: string; data: unknown }> {
  return text
    .split("\n\n")
    .filter((f) => f.includes("data:"))
    .map((f) => {
      const event = (f.match(/^event: (.+)$/m)?.[1] ?? "message").trim();
      const data = JSON.parse((f.match(/^data: (.+)$/m)?.[1] ?? "null").trim());
      return { event, data };
    });
}

describe("POST /api/investigate/stream", () => {
  it("streams provider, dedup, and done events with the full investigation", async () => {
    runSearchAllWithMock.mockImplementation(async (providers: Array<{ id: string }>, _queries: unknown, opts?: { onProvider?: (r: unknown) => void }) => {
      const reports = providers.map((p) => okReport(p.id));
      for (const r of reports) opts?.onProvider?.(r);
      return { results: [...hits], providersUsed: providers.map((p) => p.id), errors: [], reports };
    });
    const app = createApp();
    const res = await request(app)
      .post("/api/investigate/stream")
      .send({ claim: `Streamed claim ${Date.now()}`, depth: "flash" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    const events = parseSse(res.text);
    const kinds = events.map((e) => e.event);
    expect(kinds).toContain("provider");
    expect(kinds).toContain("dedup");
    expect(kinds).toContain("done");
    const done = events.find((e) => e.event === "done")!.data as { results: Array<{ searchFailed: boolean }> };
    expect(done.results[0].searchFailed).toBe(false);
    // No API key echoed anywhere in the stream.
    expect(res.text).not.toContain("gsk_");
  });

  it("streams SEARCH FAILED when every provider fails", async () => {
    runSearchAllWithMock.mockResolvedValue({
      results: [],
      providersUsed: [],
      errors: ["duckduckgo: timed out"],
      reports: [{ provider: "duckduckgo", status: "timeout", latencyMs: 10, sources: 0, retries: 1, error: "timed out" }],
    });
    const app = createApp();
    const res = await request(app)
      .post("/api/investigate/stream")
      .send({ claim: `Doomed stream ${Date.now()}`, depth: "flash" });
    const events = parseSse(res.text);
    const done = events.find((e) => e.event === "done")!.data as { results: Array<{ searchFailed: boolean }> };
    expect(done.results[0].searchFailed).toBe(true);
  });

  it("rejects missing claims with JSON 400, not a broken stream", async () => {
    const app = createApp();
    const res = await request(app).post("/api/investigate/stream").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
  });
});
