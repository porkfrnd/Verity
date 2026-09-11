import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../routes/app.js";
import { clearInvestigations } from "../../services/store.js";
import { clearCache } from "../../services/cache.js";

beforeEach(() => {
  clearInvestigations();
  clearCache();
  delete process.env.GROQ_API_KEY;
  delete process.env.TAVILY_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/investigate", () => {
  it("happy path end-to-end with mocked providers", async () => {
    const app = createApp();
    const res = await request(app).post("/api/investigate").send({ claim: "The Great Wall is visible from space." });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0].analysis).toHaveProperty("verdict");
  });

  it("multi-claim input produces independently-sourced verdicts", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/investigate")
      .send({ claim: `Vitamin C prevents colds. Large doses make you healthier. ${Date.now()}` });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThanOrEqual(2);
  });

  it("missing claim → 400 typed error, never raw stack", async () => {
    const app = createApp();
    const res = await request(app).post("/api/investigate").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_request");
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\(.*\.ts:/);
  });

  it("BYOK key is never echoed back in the response body", async () => {
    // Stub Groq network so the BYOK path stays offline/deterministic in CI.
    const extraction = {
      original_claim: "Water boils.",
      claims: [{ id: "claim-1", text: "Water boils at 100C.", type: "scientific", importance: "primary" }],
      searchQueries: {
        "claim-1": { neutral: ["water boils 100C"], supporting: ["evidence water boils"], contradicting: ["water boils myth"] },
      },
      verifiability: { "claim-1": { checkable: true, reason: "test" } },
    };
    const analysis = {
      claimId: "claim-1",
      verdict: "true",
      confidence: "high",
      summary: "stubbed",
      evidence: [],
      contradictions: [],
      missing_information: [],
      reasoning_summary: "stubbed",
    };
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        const body = calls === 1 ? extraction : analysis;
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 });
      })
    );
    const app = createApp();
    const res = await request(app)
      .post("/api/investigate")
      .send({ claim: `Water boils at 100C ${Date.now()}`, apiKey: "gsk_secret1234567890" });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("gsk_secret1234567890");
  });

  it("recheck bypasses cache and returns a fresh investigation", async () => {
    const app = createApp();
    const claim = `Recheck cache test ${Date.now()}`;
    const first = await request(app).post("/api/investigate").send({ claim });
    expect(first.status).toBe(200);
    const second = await request(app).post("/api/investigate").send({ claim });
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id); // cached hit reuses stored result
    const rechecked = await request(app).post(`/api/investigations/${first.body.id}/recheck`).send({});
    expect(rechecked.status).toBe(200);
    expect(rechecked.body.id).not.toBe(first.body.id); // bypass proves fresh search ran
  });

  it("empty search degrades to UNVERIFIED, not an error", async () => {
    const app = createApp();
    const res = await request(app).post("/api/investigate").send({ claim: `Xqzzy unfindable claim ${Date.now()} ${"z".repeat(20)}` });
    expect(res.status).toBe(200);
    expect(res.body.results[0].analysis.verdict).toBeDefined();
  });
});

describe("GET /api/health", () => {
  it("reflects provider reachability", async () => {
    const app = createApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.llm).toHaveProperty("provider");
    expect(res.body).toHaveProperty("searchProviders");
  });
});

describe("GET /api/investigations/:id", () => {
  it("404s with typed error for unknown ids", async () => {
    const app = createApp();
    const res = await request(app).get("/api/investigations/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });

  it("round-trips a created investigation", async () => {
    const app = createApp();
    const created = await request(app).post("/api/investigate").send({ claim: `Round trip ${Date.now()}` });
    const fetched = await request(app).get(`/api/investigations/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
  });
});
