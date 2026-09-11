import type { SearchDepth, Source } from "../../shared/types.js";
import { detectContradictions, heuristicStance } from "./contradiction.js";

export interface SearchModeConfig {
  /** Hard wall-clock budget for the whole search step (queries + fetches). */
  searchBudgetMs: number;
  /**
   * Per-attempt provider budget, enforced per request. Derived from measured
   * baselines (cold ~6–7s, warm ~1s here): must clear p95 with margin, and
   * stay above undici's internal 10s connect timeout. Flash fails fast by
   * design; extended allows slow origins more room. Never a prompt hint.
   */
  providerBudgetMs: number;
  /**
   * Max in-flight search requests. Measured: ≤5 concurrent → 100% success;
   * 10 concurrent → 40% connect-timeout failures. Bounds connection/DNS
   * pressure instead of "waiting longer".
   */
  maxConcurrentJobs: number;
  /** Max queries in wave 1 (neutral) and wave 2 (supporting/contradicting + variants). */
  wave1Queries: number;
  wave2Queries: number;
  /** Max sources kept for analysis. */
  maxSources: number;
  /** Max extra page fetches beyond the analysis set (expansion budget). */
  maxExpansions: number;
  /** Per-query result cap per provider. */
  perQueryCount: number;
  /** Minimum strong same-stance sources to stop after wave 1. */
  earlyStopStrongSources: number;
  /** Boost academic/government sources when ranking (primary-source discovery). */
  primaryBoost: boolean;
  /** Include contradicting-query variants in wave 2 (contradiction hunting). */
  contradictionHunt: boolean;
}

/**
 * Hard budgets per depth mode. These control the retrieval engine directly
 * (query counts, source caps, timeouts) — they are never just prompt text.
 * Timings are ceilings, not promises: network conditions vary.
 */
export const SEARCH_MODES: Record<SearchDepth, SearchModeConfig> = {
  flash: {
    searchBudgetMs: 15_000,
    providerBudgetMs: 12_000,
    maxConcurrentJobs: 3,
    wave1Queries: 3,
    wave2Queries: 0,
    maxSources: 8,
    maxExpansions: 0,
    perQueryCount: 4,
    // Inert for flash: single wave means there is no wave 2 to stop early.
    earlyStopStrongSources: 4,
    primaryBoost: false,
    contradictionHunt: false,
  },
  deep: {
    searchBudgetMs: 60_000,
    providerBudgetMs: 15_000,
    maxConcurrentJobs: 6,
    wave1Queries: 3,
    wave2Queries: 4,
    maxSources: 20,
    maxExpansions: 4,
    perQueryCount: 4,
    earlyStopStrongSources: 6,
    primaryBoost: false,
    contradictionHunt: true,
  },
  extended: {
    searchBudgetMs: 150_000,
    providerBudgetMs: 25_000,
    maxConcurrentJobs: 8,
    wave1Queries: 4,
    wave2Queries: 8,
    maxSources: 40,
    perQueryCount: 5,
    maxExpansions: 10,
    earlyStopStrongSources: 10,
    primaryBoost: true,
    contradictionHunt: true,
  },
};

export interface QueryWaves {
  wave1: string[];
  wave2: string[];
}

/** Split neutral/supporting/contradicting queries into two waves per mode. */
export function planWaves(
  queries: { neutral: string[]; supporting: string[]; contradicting: string[] },
  mode: SearchModeConfig,
  extraVariants: string[] = []
): QueryWaves {
  const wave1 = [...queries.neutral, ...queries.supporting.slice(0, 1)].slice(0, mode.wave1Queries);
  const pool = [
    ...queries.supporting.slice(1),
    ...(mode.contradictionHunt ? queries.contradicting : []),
    ...extraVariants,
  ];
  // Duplicate-query detection: never issue the same query twice.
  const seen = new Set(wave1.map((q) => q.toLowerCase().trim()));
  const wave2 = pool.filter((q) => {
    const key = q.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, mode.wave2Queries);
  return { wave1, wave2 };
}

/** Extra query reformulations for extended mode (cheap lexical variants). */
export function expandQueryVariants(neutral: string[]): string[] {
  const out: string[] = [];
  for (const base of neutral.slice(0, 3)) {
    const clean = base.replace(/[."'`!?]+$/g, "").trim();
    if (!clean) continue;
    out.push(`${clean} study evidence`, `${clean} expert analysis review`);
  }
  return out;
}

export interface EarlyStopAssessment {
  stop: boolean;
  reason: string;
  strongSupports: number;
  strongContradicts: number;
}

/**
 * Depth is a MAXIMUM budget: stop after wave 1 when the evidence state is
 * already strong — unanimous strong same-stance coverage from distinct
 * domains with no contradictions. Uses the cheap heuristic stance (the same
 * signal as contradiction detection), never the LLM: this check must be
 * pre-analysis to actually save search budget. Never throws.
 */
export function assessEarlyStop(sources: Source[], mode: SearchModeConfig): EarlyStopAssessment {
  const strong = sources.filter((s) => {
    const body = `${s.content ?? ""} ${s.snippet ?? ""}`;
    return body.length > 200 && (s.sourceType === "academic" || s.sourceType === "government" || s.sourceType === "news" || s.sourceType === "organization");
  });
  const stanceOf = (s: Source) => heuristicStance(`${s.title} ${s.content ?? s.snippet ?? ""}`);
  const supports = strong.filter((s) => stanceOf(s) === "supports");
  const contradicts = strong.filter((s) => stanceOf(s) === "contradicts");
  const contradictions = detectContradictions(strong).filter((c) => c.status === "unresolved").length;
  const distinctDomains = (list: Source[]) => new Set(list.map((s) => s.domain)).size;
  const empty: EarlyStopAssessment = { stop: false, reason: "", strongSupports: supports.length, strongContradicts: contradicts.length };
  if (contradictions > 0) return { ...empty, reason: "contradictions present — keep investigating" };
  if (supports.length >= mode.earlyStopStrongSources && distinctDomains(supports) >= 3 && contradicts.length === 0) {
    return { stop: true, reason: `unanimous strong support from ${distinctDomains(supports)} domains`, strongSupports: supports.length, strongContradicts: 0 };
  }
  if (contradicts.length >= mode.earlyStopStrongSources && distinctDomains(contradicts) >= 3 && supports.length === 0) {
    return { stop: true, reason: `unanimous strong contradiction from ${distinctDomains(contradicts)} domains`, strongSupports: 0, strongContradicts: contradicts.length };
  }
  return empty;
}
