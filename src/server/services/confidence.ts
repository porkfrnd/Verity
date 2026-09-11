import type {
  ConfidenceScore,
  Contradiction,
  EvidenceItem,
  Source,
  Verdict,
} from "../../shared/types.js";

/**
 * Deterministic verdict-confidence scorer.
 *
 * The LLM NEVER chooses the percentage: it only supplies structured evidence
 * assessments (stance/strength per source). This module converts those, plus
 * source metadata, into an integer score with a signed breakdown. Pure
 * function of its inputs — same normalized evidence always yields the same
 * percentage. No randomness, no model judgment.
 *
 * The score is confidence IN THE VERDICT, not probability the claim is true
 * and not a measure of search health (search failure is a separate state
 * with no percentage at all).
 */

export interface ConfidenceInput {
  verdict: Verdict;
  evidence: EvidenceItem[];
  /** The analyzed source set (post-normalization). */
  sources: Source[];
  contradictions: Contradiction[];
  missingInformation: number;
  /** ISO timestamp the verdict was produced (anchors freshness deterministically). */
  nowIso: string;
}

const WEIGHTS = {
  supportStrong: 3,
  supportMedium: 2,
  supportWeak: 1,
} as const;

function weightOf(strength: string): number {
  if (strength === "strong") return WEIGHTS.supportStrong;
  if (strength === "medium") return WEIGHTS.supportMedium;
  return WEIGHTS.supportWeak;
}

function sourceQualityScore(s: Source): number {
  const body = `${s.content ?? ""} ${s.snippet ?? ""}`;
  const hasBody = body.trim().length > 200;
  let score: number;
  switch (s.sourceType) {
    case "academic":
    case "government":
      score = hasBody ? 5 : 4;
      break;
    case "news":
    case "organization":
      score = hasBody ? 3 : 2;
      break;
    default:
      score = 1;
  }
  if (s.isFactCheck) score = Math.min(5, score + 1);
  return score;
}

export function calculateConfidence(input: ConfidenceInput): ConfidenceScore {
  const { verdict, contradictions, missingInformation, nowIso } = input;
  // Deterministic order regardless of input ordering.
  const evidence = [...input.evidence].sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const byId = new Map(input.sources.map((s) => [s.id, s]));

  let aligned = 0;
  let opposed = 0;
  for (const e of evidence) {
    const w = weightOf(e.strength);
    const onTrueSide =
      verdict === "true" || verdict === "mostly_true"
        ? e.stance === "supports"
        : verdict === "false" || verdict === "mostly_false"
          ? e.stance === "contradicts"
          : null; // mixed: both sides count (see below)
    if (onTrueSide === null) {
      if (e.stance === "supports" || e.stance === "contradicts") aligned += w;
    } else if (onTrueSide) {
      aligned += w;
    } else if (e.stance === "supports" || e.stance === "contradicts") {
      opposed += w;
    }
  }
  // For mixed, confidence grows when BOTH sides have substance: a mixed verdict
  // on one-sided evidence is barely supported. Contradictions between the
  // sides still penalize via the contradictions component below.
  if (verdict === "mixed") {
    const s = evidence.filter((e) => e.stance === "supports").reduce((n, e) => n + weightOf(e.strength), 0);
    const c = evidence.filter((e) => e.stance === "contradicts").reduce((n, e) => n + weightOf(e.strength), 0);
    aligned = Math.min(s, c);
    opposed = 0;
  }
  if (verdict === "unverified" || verdict === "not_a_factual_claim") {
    aligned = 0;
    opposed = 0;
  }

  const breakdown: Record<string, number> = {};

  breakdown["evidence_strength"] = Math.max(0, Math.min(30, 10 * aligned - 5 * opposed));

  const cited = evidence.map((e) => byId.get(e.sourceId)).filter((s): s is Source => !!s);
  breakdown["source_quality"] = Math.min(20, cited.reduce((n, s) => n + sourceQualityScore(s), 0));

  const domains = new Set(cited.map((s) => s.domain)).size;
  let independence = domains <= 0 ? 0 : domains === 1 ? 3 : domains === 2 ? 7 : domains === 3 ? 11 : 15;
  const domainCounts = new Map<string, number>();
  for (const s of cited) domainCounts.set(s.domain, (domainCounts.get(s.domain) ?? 0) + 1);
  if ([...domainCounts.values()].some((n) => n >= 3)) independence -= 4; // same report repeated
  breakdown["source_independence"] = Math.max(0, independence);

  breakdown["cross_source_agreement"] =
    opposed === 0 ? (aligned >= 2 ? 12 : aligned >= 1 ? 6 : 0) : Math.max(0, 10 - 5 * opposed);

  const strongCount = evidence.filter((e) => e.strength === "strong").length;
  const directness = (evidence.length > 0 && strongCount / evidence.length >= 0.5 ? 6 : strongCount > 0 ? 3 : 0) +
    (missingInformation === 0 ? 4 : missingInformation <= 2 ? 2 : 0);
  breakdown["directness_coverage"] = Math.min(10, directness);

  breakdown["primary_sources"] = cited.some((s) => s.sourceType === "academic" || s.sourceType === "government" || s.isFactCheck) ? 5 : 0;

  const now = Date.parse(nowIso);
  const oneYearMs = 365 * 24 * 3600 * 1000;
  breakdown["freshness"] = cited.some((s) => {
    if (!s.publishedAt) return false;
    const t = Date.parse(s.publishedAt);
    return !Number.isNaN(t) && !Number.isNaN(now) && now - t >= 0 && now - t <= oneYearMs;
  }) ? 3 : 0;

  let contra = 0;
  for (const c of contradictions) {
    if (c.status === "unresolved") contra -= 6;
    else if (c.status === "partially_resolved") contra -= 2;
  }
  breakdown["contradictions"] = Math.max(-12, contra);

  const raw = Object.values(breakdown).reduce((n, v) => n + v, 0);
  const clamped = Math.max(3, Math.min(97, raw));
  if (clamped !== raw) breakdown["bounds_clamp"] = clamped - raw;

  return { percentage: clamped, breakdown };
}
