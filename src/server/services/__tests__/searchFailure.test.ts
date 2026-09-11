import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLLMProvider } from "../../providers/llm/mock.js";
import type { SearchRunResult } from "../search.js";

const { runSearchAllWithMock } = vi.hoisted(() => ({ runSearchAllWithMock: vi.fn() }));

vi.mock("../search.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../search.js")>();
  return { ...actual, runSearchAllWith: runSearchAllWithMock };
});

import { investigate } from "../evidence.js";
import { clearCache } from "../cache.js";

function reportsFor(statuses: Array<"success" | "timeout" | "error">): SearchRunResult {
  return {
    results: [],
    providersUsed: [],
    errors: [],
    reports: statuses.map((status, i) => ({
      provider: `p${i}`,
      status,
      latencyMs: 100,
      sources: 0,
      retries: status === "success" ? 0 : 1,
      error: status === "success" ? null : "timed out",
    })),
  };
}

const openAlexHits = [
  { title: "Study on colds", url: "https://journal.example.com/study", snippet: "Peer-reviewed evidence shows vitamin C does not prevent colds.", sourceType: "academic" as const },
  { title: "Meta analysis", url: "https://archive.example.org/meta", snippet: "Meta-analysis contradicts routine supplementation claims.", sourceType: "academic" as const },
];

beforeEach(() => {
  clearCache();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("search failure vs insufficient evidence", () => {
  it("KEY ACCEPTANCE: DDG+Wikipedia timeout but another provider succeeds → normal analysis, never SEARCH FAILED", async () => {
    const analyzeSpy = vi.spyOn(MockLLMProvider.prototype, "analyzeEvidence");
    runSearchAllWithMock.mockImplementation(async (_providers: unknown, _queries: unknown) => ({
      ...reportsFor(["timeout", "timeout", "success", "success"]),
      results: [...openAlexHits],
      providersUsed: ["openalex", "gdelt"],
      errors: ["duckduckgo: timed out", "wikipedia: timed out"],
    }));
    const inv = await investigate(`Vitamin C prevents colds ${Date.now()}`, { depth: "deep" });
    expect(inv.results).toHaveLength(1);
    const r = inv.results[0];
    expect(r.searchFailed).toBe(false);
    expect(r.sources.length).toBeGreaterThan(0);
    expect(r.searchReport.providers.filter((p) => p.status === "timeout")).toHaveLength(2);
    expect(r.searchReport.providers.filter((p) => p.status === "success")).toHaveLength(2);
    // The verdict model was actually consulted over the surviving evidence.
    expect(analyzeSpy).toHaveBeenCalledTimes(1);
  });

  it("KEY ACCEPTANCE: ALL providers fail → SEARCH FAILED, LLM never consulted", async () => {
    const analyzeSpy = vi.spyOn(MockLLMProvider.prototype, "analyzeEvidence");
    runSearchAllWithMock.mockResolvedValue({
      ...reportsFor(["timeout", "timeout", "error"]),
      errors: ["duckduckgo: timed out", "wikipedia: timed out", "openalex: status 503"],
    });
    const inv = await investigate(`Some novel claim ${Date.now()}`, { depth: "deep" });
    expect(inv.results).toHaveLength(1);
    const r = inv.results[0];
    expect(r.searchFailed).toBe(true);
    expect(r.sources).toHaveLength(0);
    expect(r.analysis.summary).toMatch(/Search failed/);
    expect(analyzeSpy).not.toHaveBeenCalled();
  });

  it("providers succeed but find nothing → INSUFFICIENT EVIDENCE (unverified), not SEARCH FAILED", async () => {
    runSearchAllWithMock.mockResolvedValue({
      ...reportsFor(["success", "success"]),
      errors: [],
    });
    const inv = await investigate(`Unfindable but searchable ${Date.now()}`, { depth: "flash" });
    const r = inv.results[0];
    expect(r.searchFailed).toBe(false);
    expect(r.analysis.verdict).toBe("unverified");
    expect(r.analysis.summary).toMatch(/completed successfully/);
  });

  it("extended mode cannot exceed its hard source budget", async () => {
    const flood = Array.from({ length: 100 }, (_, i) => ({
      title: `Hit ${i}`,
      url: `https://news.example.com/hit-${i}`,
      snippet: "Evidence shows the effect is real and confirmed by measurement.",
      sourceType: "news" as const,
    }));
    runSearchAllWithMock.mockImplementation(async () => ({
      results: [...flood],
      providersUsed: ["duckduckgo"],
      errors: [],
      reports: [{ provider: "duckduckgo", status: "success" as const, latencyMs: 100, sources: 100, retries: 0, error: null }],
    }));
    const inv = await investigate(`Flood claim ${Date.now()}`, { depth: "extended" });
    expect(inv.depth).toBe("extended");
    expect(inv.results[0].sources.length).toBeLessThanOrEqual(40);
    expect(inv.results[0].sources.length).toBeGreaterThan(0);
    expect(inv.results[0].searchReport.totalFound).toBeGreaterThan(0);
    expect(inv.results[0].searchReport.uniqueCount).toBeLessThanOrEqual(inv.results[0].searchReport.totalFound);
  });
});
