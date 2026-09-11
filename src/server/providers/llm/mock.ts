// Deterministic offline fallback used for tests, CI, and no-key demos.
// Implements the same LLMProvider interface so swapping providers is one file:
// add src/server/providers/llm/anthropic.ts implementing LLMProvider and
// select it in src/server/services/llmFactory.ts — no analyzer changes needed.
import type { ClaimExtraction, EvidenceAnalysis, Source, SubClaim } from "../../../shared/types.js";
import { buildQueriesForClaim, checkVerifiability, splitClaimsHeuristic } from "../../services/claimExtractor.js";
import type { LLMProvider } from "./types.js";

export class MockLLMProvider implements LLMProvider {
  id = "mock";

  async extractClaims(rawClaim: string): Promise<ClaimExtraction> {
    const claims = splitClaimsHeuristic(rawClaim);
    const searchQueries: ClaimExtraction["searchQueries"] = {};
    const verifiability: ClaimExtraction["verifiability"] = {};
    for (const c of claims) {
      searchQueries[c.id] = buildQueriesForClaim(c.text);
      verifiability[c.id] = checkVerifiability(c);
    }
    return { original_claim: rawClaim, claims, searchQueries, verifiability };
  }

  async analyzeEvidence(input: { claim: SubClaim; sources: Source[] }): Promise<EvidenceAnalysis> {
    const { claim, sources } = input;
    if (sources.length === 0) {
      return {
        claimId: claim.id,
        verdict: "unverified",
        confidence: "low",
        summary: "No reliable sources were found, so this claim cannot be verified.",
        evidence: [],
        contradictions: [],
        missing_information: ["Independent reliable sources covering this claim."],
        reasoning_summary: "Zero sources supplied; the only honest answer is unverified.",
      };
    }
    // Keyword heuristic only — deterministic and test-friendly.
    const text = claim.text.toLowerCase();
    const blob = sources.map((s) => `${s.title} ${(s.content ?? s.snippet ?? "")}`.toLowerCase()).join("\n");
    const supports = (blob.match(/study|research|evidence shows|confirmed|peer-reviewed|official|data shows/g) ?? []).length;
    const contradicts = (blob.match(/myth|misleading|false|no evidence|debunked|incorrect|not true/g) ?? []).length;
    let verdict: EvidenceAnalysis["verdict"] = "unverified";
    let confidence: EvidenceAnalysis["confidence"] = "low";
    if (/best|favorite|should|beautiful|delicious/i.test(claim.text) && /(best|opinion)/i.test(text + blob)) {
      // handled below by opinion check
    }
    if (claim.type === "opinion") {
      verdict = "not_a_factual_claim";
      confidence = "high";
    } else if (contradicts > supports && contradicts > 0) {
      verdict = contradicts >= 2 ? "false" : "mostly_false";
      confidence = contradicts >= 2 ? "high" : "medium";
    } else if (supports > contradicts && supports > 0) {
      verdict = supports >= 2 ? "true" : "mostly_true";
      confidence = supports >= 2 ? "high" : "medium";
    } else if (supports === 0 && contradicts === 0) {
      verdict = "unverified";
      confidence = "low";
    } else {
      verdict = "mixed";
      confidence = "medium";
    }
    return {
      claimId: claim.id,
      verdict,
      confidence,
      summary:
        verdict === "unverified"
          ? "Available evidence is too thin to support a verdict."
          : `Heuristic offline analysis suggests ${verdict.replace(/_/g, " ")} based on ${sources.length} source(s).`,
      evidence: sources.slice(0, 6).map((s) => ({
        sourceId: s.id,
        stance: /myth|false|debunked|misleading|no evidence/i.test(`${s.title} ${s.snippet ?? ""}`) ? "contradicts" : "context",
        strength: s.sourceType === "academic" || s.sourceType === "government" ? "strong" : "medium",
        reason: "Offline heuristic classification (mock provider).",
      })),
      contradictions: [],
      missing_information: verdict === "unverified" ? ["More independent reliable sources."] : [],
      reasoning_summary: `Mock provider: supports signals=${supports}, contradicts signals=${contradicts}.`,
    };
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "Mock provider is always available (offline)." };
  }
}
