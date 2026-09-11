import { describe, expect, it } from "vitest";
import { runSearchAllWith } from "../search.js";
import { ProviderError, type SearchProvider } from "../../providers/search/types.js";
import type { SearchResultItem } from "../../../shared/types.js";

function item(id: string): SearchResultItem {
  return { title: `Title ${id}`, url: `https://example.com/${id}`, snippet: `snippet ${id}` };
}

type Behavior = "ok" | "timeout" | "http503" | "empty" | "malformed" | "flaky-then-ok";

/** Stub provider following a per-call script. Records calls for assertions. */
function stubProvider(id: string, script: Behavior[], items: SearchResultItem[] = [item(`${id}-1`), item(`${id}-2`)]) {
  const calls: string[] = [];
  let n = 0;
  const provider: SearchProvider = {
    id,
    async search(query: string) {
      calls.push(query);
      const step = script[Math.min(n++, script.length - 1)];
      if (step === "ok") return items.map((x) => ({ ...x }));
      if (step === "empty") return [];
      if (step === "malformed") return [{ title: "", url: "" }, { title: "No url here" } as SearchResultItem];
      if (step === "http503") throw new ProviderError(`${id} search failed with status 503`, { httpStatus: 503 });
      if (step === "timeout") throw new ProviderError(`${id} search timed out`, { timeout: true });
      // flaky-then-ok: first call times out, retry succeeds
      if (n === 1) throw new ProviderError(`${id} search timed out`, { timeout: true });
      return items.map((x) => ({ ...x }));
    },
  };
  return { provider, calls };
}

const OPTS = { count: 5, retryDelayMs: 0 };

describe("fault-tolerant search orchestration", () => {
  it("all providers succeed: results merged, reports success", async () => {
    const a = stubProvider("a", ["ok"]);
    const b = stubProvider("b", ["ok"]);
    const out = await runSearchAllWith([a.provider, b.provider], ["q1", "q2"], OPTS);
    expect(out.results).toHaveLength(8); // 2 providers x 2 queries x 2 items
    expect(out.reports).toHaveLength(2);
    expect(out.reports.every((r) => r.status === "success")).toBe(true);
    expect(out.errors).toHaveLength(0);
  });

  it("one provider timeout: other providers' results are kept", async () => {
    const slow = stubProvider("slow", ["timeout"]);
    const good = stubProvider("good", ["ok"]);
    const out = await runSearchAllWith([slow.provider, good.provider], ["q1"], { ...OPTS, maxAttempts: 1 });
    expect(out.results).toHaveLength(2);
    expect(out.reports.find((r) => r.provider === "slow")).toMatchObject({ status: "timeout", sources: 0 });
    expect(out.reports.find((r) => r.provider === "good")).toMatchObject({ status: "success", sources: 2 });
  });

  it("multiple providers time out: survivors still used", async () => {
    const out = await runSearchAllWith(
      [stubProvider("s1", ["timeout"]).provider, stubProvider("s2", ["timeout"]).provider, stubProvider("ok1", ["ok"]).provider],
      ["q1"],
      { ...OPTS, maxAttempts: 1 }
    );
    expect(out.results).toHaveLength(2);
    expect(out.reports.filter((r) => r.status === "timeout")).toHaveLength(2);
  });

  it("all providers time out: empty results with per-provider timeout reports", async () => {
    const out = await runSearchAllWith(
      [stubProvider("s1", ["timeout"]).provider, stubProvider("s2", ["timeout"]).provider],
      ["q1", "q2"],
      { ...OPTS, maxAttempts: 1 }
    );
    expect(out.results).toHaveLength(0);
    expect(out.reports).toHaveLength(2);
    expect(out.reports.every((r) => r.status === "timeout")).toBe(true);
    expect(out.errors).toHaveLength(4); // 2 providers x 2 queries, none discarded silently
  });

  it("HTTP errors carry status into the report and trigger one retry", async () => {
    const { provider, calls } = stubProvider("flaky", ["http503"]);
    const out = await runSearchAllWith([provider], ["q1"], OPTS);
    const report = out.reports[0];
    expect(report.status).toBe("error");
    expect(report.httpStatus).toBe(503);
    expect(report.retries).toBe(1);
    expect(calls).toHaveLength(2); // initial + one retry
  });

  it("timeout retries succeed: flaky provider recovers", async () => {
    const { provider } = stubProvider("flaky", ["timeout", "ok"]);
    const out = await runSearchAllWith([provider], ["q1"], OPTS);
    expect(out.results).toHaveLength(2);
    expect(out.reports[0]).toMatchObject({ status: "success", retries: 1 });
  });

  it("malformed provider data never crashes the run", async () => {
    const out = await runSearchAllWith([stubProvider("bad", ["malformed"]).provider], ["q1"], OPTS);
    expect(out.reports[0].status).toBe("success");
  });

  it("zero results is success-with-zero, not failure", async () => {
    const out = await runSearchAllWith([stubProvider("quiet", ["empty"]).provider], ["q1"], OPTS);
    expect(out.reports[0]).toMatchObject({ status: "success", sources: 0 });
    expect(out.errors).toHaveLength(0);
  });

  it("queryBudget limits queries for budgeted providers", async () => {
    const budgeted = stubProvider("ref", ["ok"]);
    budgeted.provider.queryBudget = 2;
    await runSearchAllWith([budgeted.provider], ["q1", "q2", "q3", "q4"], OPTS);
    expect(budgeted.calls).toHaveLength(2);
  });

  it("caller abort cancels without retries", async () => {
    const { provider, calls } = stubProvider("slow", ["timeout"]);
    const controller = new AbortController();
    controller.abort();
    const out = await runSearchAllWith([provider], ["q1"], { ...OPTS, signal: controller.signal });
    // Providers see the aborted signal; no result, no retry storm.
    expect(out.results).toHaveLength(0);
    expect(calls.length).toBeLessThanOrEqual(2);
    expect(out.reports[0].retries).toBe(0);
  });

  it("a hung provider cannot stall the run: global cancellation wins", async () => {
    const hanging: SearchProvider = {
      id: "hang",
      search: () => new Promise(() => {}), // never settles, ignores signal
    };
    const good = stubProvider("good", ["ok"]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const out = await runSearchAllWith([hanging, good.provider], ["q1"], { ...OPTS, signal: controller.signal });
    expect(out.results).toHaveLength(2); // survivor kept
    expect(out.reports.find((r) => r.provider === "hang")?.status).toBe("timeout");
  });

  it("global timeout terminates search even when providers hang", async () => {
    const hanging: SearchProvider = {
      id: "hang",
      search: () => new Promise(() => {}),
    };
    const started = Date.now();
    const out = await runSearchAllWith([hanging], ["q1"], { ...OPTS, signal: AbortSignal.timeout(100) });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(out.results).toHaveLength(0);
    expect(out.reports[0].status).toBe("timeout");
  });

  it("latency and error diagnostics are recorded per provider", async () => {
    const out = await runSearchAllWith([stubProvider("s", ["timeout"]).provider], ["q1"], { ...OPTS, maxAttempts: 1 });
    const r = out.reports[0];
    expect(typeof r.latencyMs).toBe("number");
    expect(r.error).toMatch(/timed out/);
    expect(r.retries).toBe(0);
  });

  it("bounds in-flight requests to maxConcurrentJobs", async () => {    let inFlight = 0;
    let peak = 0;
    const gate = (id: string): SearchProvider => ({
      id,
      search: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight--;
        return [{ title: id, url: `https://${id}.example.com/` }];
      },
    });
    const providers = [gate("a"), gate("b"), gate("c"), gate("d")];
    const out = await runSearchAllWith(providers, ["q1", "q2", "q3"], { ...OPTS, maxConcurrentJobs: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(out.results).toHaveLength(12);
  });

  it("clamps non-positive concurrency to serial execution (never a silent no-op)", async () => {
    const good = stubProvider("good", ["ok"]);
    const out = await runSearchAllWith([good.provider], ["q1", "q2"], { ...OPTS, maxConcurrentJobs: 0 });
    expect(out.results).toHaveLength(4);
    expect(out.reports[0].status).toBe("success");
  });

  it("forwards the mode provider budget to every provider request", async () => {
    const seen: Array<number | undefined> = [];
    const probe: SearchProvider = {
      id: "probe",
      search: async (_q: string, opts?: { timeoutMs?: number }) => {
        seen.push(opts?.timeoutMs);
        return [];
      },
    };
    await runSearchAllWith([probe], ["q1", "q2"], { ...OPTS, providerBudgetMs: 12_000 });
    expect(seen).toEqual([12_000, 12_000]);
  });

  it("distinguishes global-deadline cancellation from provider timeouts", async () => {
    const hanging: SearchProvider = { id: "hang", search: () => new Promise(() => {}) };
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const out = await runSearchAllWith([hanging], ["q1"], { ...OPTS, signal: controller.signal });
    expect(out.reports[0].attempts).toContain("cancelled (global deadline)");
    // A provider-side timeout with a live signal keeps the timeout label.
    const slow = stubProvider("slow", ["timeout"]);
    const out2 = await runSearchAllWith([slow.provider], ["q1"], { ...OPTS, maxAttempts: 1 });
    expect(out2.reports[0].attempts).toEqual(["timeout"]);
    expect(out2.reports[0].status).toBe("timeout");
  });
});
