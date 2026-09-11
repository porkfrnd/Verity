import { claimExtractionSchema, evidenceAnalysisSchema } from "../../shared/schemas.js";
import type { ClaimVerdict, EvidenceAnalysis, Investigation, Source, SubClaim } from "../../shared/types.js";
import { detectContradictions } from "./contradiction.js";
import { getCached, setCached } from "./cache.js";
import { getLLMProvider } from "./llmFactory.js";
import { runSearchAll } from "./search.js";
import { buildQueriesForClaim, checkVerifiability, splitClaimsHeuristic, stripInjectionArtifacts } from "./claimExtractor.js";
import { deduplicateSources, normalizeResults, rankSources, resetSourceCounter, withQuality } from "./sources.js";

export interface InvestigateOptions {
  apiKey?: string;
  model?: string;
  claimId?: string;
  skipCache?: boolean;
}

function verdictForUncheckable(claim: SubClaim): EvidenceAnalysis {
  if (claim.type === "opinion") {
    return {
      claimId: claim.id,
      verdict: "not_a_factual_claim",
      confidence: "high",
      summary: "This is a subjective judgment, not a checkable factual claim.",
      evidence: [],
      contradictions: [],
      missing_information: [],
      reasoning_summary: "Opinion claims are routed straight to not_a_factual_claim per taxonomy.",
    };
  }
  if (claim.type === "predictive") {
    return {
      claimId: claim.id,
      verdict: "unverified",
      confidence: "medium",
      summary: "Predictions about the future cannot be verified against current evidence.",
      evidence: [],
      contradictions: [],
      missing_information: ["Wait until the predicted event occurs or find a verifiable present-tense restatement."],
      reasoning_summary: "Predictive claims are generally unverifiable in advance.",
    };
  }
  return {
    claimId: claim.id,
    verdict: "unverified",
    confidence: "low",
    summary: "This claim is not checkable with available methods.",
    evidence: [],
    contradictions: [],
    missing_information: [],
    reasoning_summary: "Marked uncheckable by verifiability rules.",
  };
}

function isTimeSensitive(text: string): boolean {
  return /\b(now|currently|today|this year|president|prime minister|ceo|price|election|ongoing|latest|current)\b/i.test(text);
}

export async function investigate(rawClaim: string, opts?: InvestigateOptions): Promise<Investigation> {
  const trimmed = rawClaim.trim();
  if (!trimmed) throw Object.assign(new Error("Claim is required"), { status: 400 });

  if (!opts?.skipCache) {
    const cached = getCached(trimmed);
    if (cached) return cached;
  }

  const llm = getLLMProvider({ apiKey: opts?.apiKey, model: opts?.model });
  resetSourceCounter();

  // 1. Claim extraction (LLM with heuristic fallback). Runtime-validate JSON.
  let extraction;
  try {
    extraction = await llm.extractClaims(stripInjectionArtifacts(trimmed).length >= 3 ? trimmed : trimmed);
    extraction = claimExtractionSchema.parse(extraction);
  } catch {
    const claims = splitClaimsHeuristic(trimmed);
    const searchQueries: Record<string, { neutral: string[]; supporting: string[]; contradicting: string[] }> = {};
    const verifiability: Record<string, { checkable: boolean; reason: string }> = {};
    for (const c of claims) {
      searchQueries[c.id] = buildQueriesForClaim(c.text);
      verifiability[c.id] = checkVerifiability(c);
    }
    extraction = { original_claim: trimmed, claims, searchQueries, verifiability };
  }

  // Opinion fast-path: no search needed, but keep shape consistent.
  const results: ClaimVerdict[] = [];
  for (const claim of extraction.claims) {
    const ver = extraction.verifiability[claim.id];
    if (claim.type === "opinion") {
      results.push({
        claim,
        analysis: verdictForUncheckable(claim),
        sources: [],
        contradictions: [],
        verifiedAt: new Date().toISOString(),
      });
      continue;
    }
    if (ver && !ver.checkable && claim.type === "predictive") {
      results.push({
        claim,
        analysis: verdictForUncheckable(claim),
        sources: [],
        contradictions: [],
        verifiedAt: new Date().toISOString(),
        staleNote: "Predictive claim — re-check after the event.",
      });
      continue;
    }

    // 2. Search: run neutral/supporting/contradicting concurrently.
    const qs = extraction.searchQueries[claim.id] ?? buildQueriesForClaim(claim.text);
    const allQueries = [...qs.neutral, ...qs.supporting, ...qs.contradicting].slice(0, 6);
    const { results: rawResults, errors } = await runSearchAll(allQueries, { count: 4 });
    if (rawResults.length === 0) {
      const analysis: EvidenceAnalysis = {
        claimId: claim.id,
        verdict: "unverified",
        confidence: "low",
        summary:
          errors.length > 0
            ? `Search failed (${errors.join("; ")}). No evidence could be gathered.`
            : "No reliable sources were found, so this claim cannot be verified.",
        evidence: [],
        contradictions: [],
        missing_information: ["Independent reliable sources covering this claim."],
        reasoning_summary: "Zero search results; unverified is the only honest answer, not an error.",
      };
      results.push({
        claim,
        analysis,
        sources: [],
        contradictions: [],
        verifiedAt: new Date().toISOString(),
      });
      continue;
    }

    // 3. Normalize → dedupe → rank → quality.
    let sources: Source[] = normalizeResults(rawResults);
    sources = deduplicateSources(sources);
    sources = rankSources(sources).slice(0, 8);
    sources = withQuality(sources);

    // 4. Evidence analysis (LLM, schema-validated).
    let analysis: EvidenceAnalysis;
    try {
      analysis = evidenceAnalysisSchema.parse(await llm.analyzeEvidence({ claim, sources }));
      // Enforce claimId binding so a jailbroken model can't swap claims.
      analysis = { ...analysis, claimId: claim.id };
    } catch {
      // Safe degradation: never a silent wrong verdict.
      analysis = {
        claimId: claim.id,
        verdict: "unverified",
        confidence: "low",
        summary: "Evidence analysis failed validation; refusing to force a verdict.",
        evidence: [],
        contradictions: [],
        missing_information: ["A valid evidence analysis pass."],
        reasoning_summary: "Analyzer output rejected by schema validation.",
      };
    }

    // 5. Contradiction check over actual content.
    const contradictions = detectContradictions(sources);

    results.push({
      claim,
      analysis,
      sources,
      contradictions,
      verifiedAt: new Date().toISOString(),
      ...(isTimeSensitive(claim.text)
        ? { staleNote: `Verified as of ${new Date().toISOString().slice(0, 10)} — this may have changed.` }
        : {}),
    });
  }

  const investigation: Investigation = {
    id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    originalClaim: trimmed,
    extraction,
    results,
    createdAt: new Date().toISOString(),
  };
  setCached(trimmed, investigation);
  return investigation;
}
