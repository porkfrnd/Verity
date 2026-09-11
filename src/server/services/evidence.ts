import { claimExtractionSchema, evidenceAnalysisSchema } from "../../shared/schemas.js";
import type {
  ClaimVerdict,
  EvidenceAnalysis,
  Investigation,
  SearchDepth,
  SearchReport,
  Source,
  SubClaim,
} from "../../shared/types.js";
import { calculateConfidence } from "./confidence.js";
import { detectContradictions } from "./contradiction.js";
import { getCached, setCached } from "./cache.js";
import { getLLMProvider } from "./llmFactory.js";
import { runSearchAllWith } from "./search.js";
import { getSearchProviders } from "./search.js";
import { buildQueriesForClaim, checkVerifiability, splitClaimsHeuristic } from "./claimExtractor.js";
import { deduplicateSources, normalizeResults, rankSources, resetSourceCounter, withQuality } from "./sources.js";
import { enrichSources } from "./sourceFetch.js";
import { SEARCH_MODES, assessEarlyStop, expandQueryVariants, planWaves } from "./searchModes.js";

export interface InvestigateOptions {
  apiKey?: string;
  model?: string;
  claimId?: string;
  skipCache?: boolean;
  depth?: SearchDepth;
  events?: (event: PipelineEvent) => void;
}

export type PipelineEvent =
  | { type: "provider"; claimId: string; wave: number; report: SearchReport["providers"][number] }
  | { type: "dedup"; claimId: string; wave: number; totalFound: number; uniqueCount: number }
  | { type: "early_stop"; claimId: string; reason: string }
  | { type: "budget_exhausted"; claimId: string }
  | { type: "analyzing"; claimId: string }
  | { type: "claim"; claimId: string; verdict: string; searchFailed: boolean };

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

function emptyReport(): SearchReport {
  return { providers: [], totalFound: 0, uniqueCount: 0, budgetExhausted: false };
}

function isTimeSensitive(text: string): boolean {
  return /\b(now|currently|today|this year|president|prime minister|ceo|price|election|ongoing|latest|current)\b/i.test(text);
}

export async function investigate(rawClaim: string, opts?: InvestigateOptions): Promise<Investigation> {
  const trimmed = rawClaim.trim();
  if (!trimmed) throw Object.assign(new Error("Claim is required"), { status: 400 });
  const depth: SearchDepth = opts?.depth ?? "deep";
  const mode = SEARCH_MODES[depth];
  const emit = opts?.events;

  if (!opts?.skipCache) {
    const cached = getCached(`${depth}::${trimmed}`);
    if (cached) return cached;
  }

  const llm = getLLMProvider({ apiKey: opts?.apiKey, model: opts?.model });
  resetSourceCounter();

  // 1. Claim extraction (LLM with heuristic fallback). Runtime-validate JSON.
  let extraction;
  try {
    extraction = await llm.extractClaims(trimmed);
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

  // Global search deadline for this investigation (all claims share it).
  const deadline = Date.now() + mode.searchBudgetMs;
  const deadlineSignal = AbortSignal.timeout(mode.searchBudgetMs);
  const providers = getSearchProviders();

  const results: ClaimVerdict[] = [];
  for (const claim of extraction.claims) {
    const ver = extraction.verifiability[claim.id];
    if (claim.type === "opinion") {
      const analysis = verdictForUncheckable(claim);
      results.push({
        claim,
        analysis,
        sources: [],
        contradictions: [],
        verifiedAt: new Date().toISOString(),
        searchFailed: false,
        searchReport: emptyReport(),
      });
      emit?.({ type: "claim", claimId: claim.id, verdict: analysis.verdict, searchFailed: false });
      continue;
    }
    if (ver && !ver.checkable && claim.type === "predictive") {
      const analysis = verdictForUncheckable(claim);
      results.push({
        claim,
        analysis,
        sources: [],
        contradictions: [],
        verifiedAt: new Date().toISOString(),
        staleNote: "Predictive claim — re-check after the event.",
        searchFailed: false,
        searchReport: emptyReport(),
      });
      emit?.({ type: "claim", claimId: claim.id, verdict: analysis.verdict, searchFailed: false });
      continue;
    }

    // 2. Search in waves so strong early evidence can stop the search.
    const qs = extraction.searchQueries[claim.id] ?? buildQueriesForClaim(claim.text);
    const extra = depth === "extended" ? expandQueryVariants(qs.neutral) : [];
    const waves = planWaves(qs, mode, extra);
    const allReports: SearchReport["providers"][number][] = [];
    const rawItems: Source[] = [];
    let budgetExhausted = false;

    for (const [waveIndex, waveQueries] of [waves.wave1, waves.wave2].entries()) {
      if (waveQueries.length === 0) continue;
      if (Date.now() >= deadline) {
        budgetExhausted = true;
        emit?.({ type: "budget_exhausted", claimId: claim.id });
        break;
      }
      const run = await runSearchAllWith(providers, waveQueries, {
        count: mode.perQueryCount,
        signal: deadlineSignal,
        retryDelayMs: 400,
        maxConcurrentJobs: mode.maxConcurrentJobs,
        providerBudgetMs: mode.providerBudgetMs,
        onProvider: (report) => {
          allReports.push(report);
          emit?.({ type: "provider", claimId: claim.id, wave: waveIndex + 1, report });
        },
      });
      // Belt and suspenders: the result carries the same reports, so a
      // provider that settles without emitting still ends up recorded.
      for (const rep of run.reports) {
        if (!allReports.some((r) => r.provider === rep.provider)) allReports.push(rep);
      }
      const normalized = normalizeResults(run.results);
      rawItems.push(...normalized);
      if (waveIndex === 0 && waves.wave2.length > 0) {
        const early = assessEarlyStop(deduplicateSources(rawItems), mode);
        if (early.stop) {
          emit?.({ type: "early_stop", claimId: claim.id, reason: early.reason });
          break;
        }
      }
    }
    if (Date.now() >= deadline && waves.wave2.length > 0) {
      budgetExhausted = true;
    }

    const anySuccess = allReports.some((r) => r.status === "success");
    const totalFound = rawItems.length;

    // 3. Normalize → dedupe → rank → fetch main content → quality.
    const deduped = deduplicateSources(rawItems);
    const uniqueCount = deduped.length;
    emit?.({ type: "dedup", claimId: claim.id, wave: 0, totalFound, uniqueCount });
    const ranked = rankSources(deduped, { primaryBoost: mode.primaryBoost });
    // Expansion budget: fetch full content beyond the analysis slice so the
    // record (and any re-analysis) has more than the top-N. Bounded by mode.
    const enrichPool = ranked.slice(0, mode.maxSources + mode.maxExpansions);
    const enriched = await enrichSources(enrichPool, { maxEnrich: enrichPool.length, signal: deadlineSignal });
    const sources = withQuality(enriched.slice(0, mode.maxSources));
    const verifiedAt = new Date().toISOString();

    const searchReport: SearchReport = { providers: allReports, totalFound, uniqueCount, budgetExhausted };

    // 4. Empty evidence: was it search failure or genuinely nothing found?
    // NEVER ask the LLM to manufacture a verdict from zero sources.
    if (sources.length === 0) {
      if (!anySuccess) {
        const failed = allReports.filter((r) => r.status !== "success");
        const summary =
          failed.length > 0
            ? `Search failed (${failed.map((r) => `${r.provider}: ${r.error ?? r.status}`).join("; ")}). No evidence could be gathered.`
            : "Search providers returned nothing usable. No evidence could be gathered.";
        results.push({
          claim,
          analysis: {
            claimId: claim.id,
            verdict: "unverified",
            confidence: "low",
            summary,
            evidence: [],
            contradictions: [],
            missing_information: ["A working search step."],
            reasoning_summary: "Retrieval failed on every provider; refusing to judge without evidence.",
          },
          sources: [],
          contradictions: [],
          verifiedAt,
          searchFailed: true,
          searchReport,
        });
        emit?.({ type: "claim", claimId: claim.id, verdict: "unverified", searchFailed: true });
        continue;
      }
      results.push({
        claim,
        analysis: {
          claimId: claim.id,
          verdict: "unverified",
          confidence: "low",
          summary: "Search completed successfully, but no reliable sources were found, so this claim cannot be verified.",
          evidence: [],
          contradictions: [],
          missing_information: ["Independent reliable sources covering this claim."],
          reasoning_summary: "Providers succeeded yet yielded nothing usable; unverified is the honest answer, not an error.",
        },
        sources: [],
        contradictions: [],
        verifiedAt,
        searchFailed: false,
        searchReport,
      });
      emit?.({ type: "claim", claimId: claim.id, verdict: "unverified", searchFailed: false });
      continue;
    }

    // 5. Evidence analysis (LLM, schema-validated) + deterministic confidence.
    emit?.({ type: "analyzing", claimId: claim.id });
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

    // 6. Contradiction check over actual content.
    const contradictions = detectContradictions(sources);

    // Deterministic verdict confidence (never LLM-chosen). Skipped for
    // not_a_factual_claim: there is no evidence assessment to be confident in.
    const confidence =
      analysis.verdict === "not_a_factual_claim"
        ? undefined
        : calculateConfidence({
            verdict: analysis.verdict,
            evidence: analysis.evidence,
            sources,
            contradictions,
            missingInformation: analysis.missing_information.length,
            nowIso: verifiedAt,
          });

    results.push({
      claim,
      analysis,
      sources,
      contradictions,
      verifiedAt: verifiedAt,
      ...(isTimeSensitive(claim.text)
        ? { staleNote: `Verified as of ${verifiedAt.slice(0, 10)} — this may have changed.` }
        : {}),
      searchFailed: false,
      searchReport,
      confidence,
    });
    emit?.({ type: "claim", claimId: claim.id, verdict: analysis.verdict, searchFailed: false });
  }

  const investigation: Investigation = {
    id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    originalClaim: trimmed,
    depth,
    extraction,
    results,
    createdAt: new Date().toISOString(),
  };
  setCached(`${depth}::${trimmed}`, investigation);
  return investigation;
}
