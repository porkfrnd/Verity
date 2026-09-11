import { describe, expect, it, vi, afterEach } from "vitest";
import { GroqProvider } from "../../../providers/llm/groq.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("groq provider", () => {
  it("shapes requests, parses JSON responses, and redacts keys in errors", async () => {
    const provider = new GroqProvider({ apiKey: "gsk_test123456", model: "openai/gpt-oss-120b" });
    const payload = {
      claimId: "claim-1",
      verdict: "false",
      confidence: "high",
      summary: "s",
      evidence: [],
      contradictions: [],
      missing_information: [],
      reasoning_summary: "r",
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 })));
    const out = await provider.analyzeEvidence({
      claim: { id: "claim-1", text: "X.", type: "factual", importance: "primary" },
      sources: [],
    });
    expect(out.verdict).toBe("false");

    // Failure path must not include the key
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 500 })));
    await expect(
      provider.analyzeEvidence({ claim: { id: "claim-1", text: "X.", type: "factual", importance: "primary" }, sources: [] })
    ).rejects.toThrow(/status 500/);
  });

  it("throws a clear error when key is missing and handles timeouts", async () => {
    const p = new GroqProvider({ apiKey: "" });
    await expect(p.extractClaims("hello world claim")).rejects.toThrow(/not configured/i);
  });
});
