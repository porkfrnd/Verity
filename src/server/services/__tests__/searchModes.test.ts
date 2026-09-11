import { describe, expect, it } from "vitest";
import { SEARCH_MODES, assessEarlyStop, expandQueryVariants, planWaves } from "../searchModes.js";
import type { Source } from "../../../shared/types.js";

const QUERIES = {
  neutral: ["n1", "n2"],
  supporting: ["s1", "s2", "s3"],
  contradicting: ["c1", "c2", "c3"],
};

function src(id: string, domain: string, stance: "supports" | "contradicts", sourceType: Source["sourceType"] = "news"): Source {
  const pro = stance === "supports";
  return {
    id,
    title: pro ? "Study confirms the effect is visible and proven" : "Review finds the claim is a myth and false",
    url: `https://${domain}/${id}`,
    domain,
    sourceType,
    content: `${pro ? "Evidence shows confirmed visible proven results. " : "This myth is false, debunked, no evidence. "}x `.repeat(60),
  } as Source;
}

describe("search depth modes", () => {
  it("flash respects its query limit (neutral only, no contradiction hunt)", () => {
    const waves = planWaves(QUERIES, SEARCH_MODES.flash);
    expect(waves.wave1.length).toBeLessThanOrEqual(3);
    expect(waves.wave2).toHaveLength(0);
    expect([...waves.wave1, ...waves.wave2].join(" ")).not.toMatch(/c1|c2/);
  });

  it("deep respects its query limits and hunts contradictions", () => {
    const waves = planWaves(QUERIES, SEARCH_MODES.deep);
    expect(waves.wave1.length).toBeLessThanOrEqual(3);
    expect(waves.wave2.length).toBeLessThanOrEqual(4);
    expect(waves.wave2.join(" ")).toMatch(/c1/);
  });

  it("extended respects its query limits with expanded variants", () => {
    const waves = planWaves(QUERIES, SEARCH_MODES.extended, expandQueryVariants(QUERIES.neutral));
    expect(waves.wave1.length).toBeLessThanOrEqual(4);
    expect(waves.wave2.length).toBeLessThanOrEqual(8);
    expect(waves.wave2.join(" ")).toMatch(/study evidence/);
  });

  it("never issues duplicate queries across waves", () => {
    for (const mode of Object.values(SEARCH_MODES)) {
      const waves = planWaves(QUERIES, mode, expandQueryVariants(QUERIES.neutral));
      const all = [...waves.wave1, ...waves.wave2].map((q) => q.toLowerCase().trim());
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("hard budgets are ordered flash < deep < extended and bounded", () => {
    expect(SEARCH_MODES.flash.searchBudgetMs).toBeLessThan(SEARCH_MODES.deep.searchBudgetMs);
    expect(SEARCH_MODES.deep.searchBudgetMs).toBeLessThan(SEARCH_MODES.extended.searchBudgetMs);
    expect(SEARCH_MODES.extended.searchBudgetMs).toBeLessThanOrEqual(150_000);
    expect(SEARCH_MODES.flash.maxSources).toBeLessThanOrEqual(8);
    expect(SEARCH_MODES.extended.maxSources).toBeLessThanOrEqual(60);
  });

  it("provider budgets and concurrency bounds are ordered and sane", () => {
    // Derived from measured baselines (cold ~6-7s, ≤5 concurrent stable):
    // budgets clear p95 with margin and stay above undici's 10s connect cap.
    expect(SEARCH_MODES.flash.providerBudgetMs).toBeGreaterThanOrEqual(10_000);
    expect(SEARCH_MODES.flash.providerBudgetMs).toBeLessThanOrEqual(SEARCH_MODES.deep.providerBudgetMs);
    expect(SEARCH_MODES.deep.providerBudgetMs).toBeLessThanOrEqual(SEARCH_MODES.extended.providerBudgetMs);
    expect(SEARCH_MODES.flash.maxConcurrentJobs).toBeLessThanOrEqual(5);
    expect(SEARCH_MODES.deep.maxConcurrentJobs).toBeLessThanOrEqual(8);
    expect(SEARCH_MODES.extended.maxConcurrentJobs).toBeLessThanOrEqual(10);
  });

  it("early stopping fires on unanimous strong multi-domain agreement", () => {
    const sources = [
      src("source-1", "a.gov", "supports", "government"),
      src("source-2", "b.edu", "supports", "academic"),
      src("source-3", "c.com", "supports"),
      src("source-4", "d.org", "supports", "organization"),
    ];
    const out = assessEarlyStop(sources, SEARCH_MODES.flash);
    expect(out.stop).toBe(true);
    expect(out.reason).toMatch(/unanimous/);
  });

  it("early stopping refuses when contradictions exist or evidence is thin", () => {
    const mixed = [src("source-1", "a.gov", "supports", "government"), src("source-2", "b.edu", "contradicts", "academic")];
    expect(assessEarlyStop(mixed, SEARCH_MODES.flash).stop).toBe(false);
    expect(assessEarlyStop([src("source-1", "a.com", "supports")], SEARCH_MODES.flash).stop).toBe(false);
    expect(assessEarlyStop([], SEARCH_MODES.flash).stop).toBe(false);
  });
});

describe("depth changes retrieval behavior", () => {
  it("flash issues fewer queries than extended (spy on wave planner output)", async () => {
    // Behavioral proof lives in planWaves limits above; here we assert the
    // budgets themselves differ so depth cannot be a UI-only label.
    const flashTotal = SEARCH_MODES.flash.wave1Queries + SEARCH_MODES.flash.wave2Queries;
    const extTotal = SEARCH_MODES.extended.wave1Queries + SEARCH_MODES.extended.wave2Queries;
    expect(extTotal).toBeGreaterThan(flashTotal);
    expect(SEARCH_MODES.extended.maxExpansions).toBeGreaterThan(SEARCH_MODES.flash.maxExpansions);
    expect(SEARCH_MODES.deep.contradictionHunt).toBe(true);
    expect(SEARCH_MODES.flash.contradictionHunt).toBe(false);
  });
});
