// Verity shared types — single source of truth for client + server.
export type ClaimType =
  | "factual"
  | "statistical"
  | "causal"
  | "historical"
  | "scientific"
  | "medical"
  | "legal"
  | "predictive"
  | "quote_attribution"
  | "opinion";

export type ClaimImportance = "primary" | "secondary" | "context";

export interface SubClaim {
  id: string;
  text: string;
  type: ClaimType;
  importance: ClaimImportance;
}

export interface QuerySet {
  neutral: string[];
  supporting: string[];
  contradicting: string[];
}

export interface Verifiability {
  checkable: boolean;
  reason: string;
}

export interface ClaimExtraction {
  original_claim: string;
  claims: SubClaim[];
  searchQueries: Record<string, QuerySet>;
  verifiability: Record<string, Verifiability>;
}

export type SourceType =
  | "government"
  | "academic"
  | "news"
  | "organization"
  | "blog"
  | "forum"
  | "social"
  | "unknown";

export type AccessStatus = "ok" | "paywalled" | "unreachable" | "archived_fallback";

export interface Source {
  id: string;
  title: string;
  url: string;
  domain: string;
  author?: string;
  publishedAt?: string;
  snippet?: string;
  content?: string;
  sourceType: SourceType;
  accessStatus?: AccessStatus;
  quality?: QualityLabel;
  stance?: EvidenceStance;
  /** True when the source is a prior fact-check (distinct signal, surfaced separately in the UI). */
  isFactCheck?: boolean;
}

export type QualityLabel =
  | "High confidence"
  | "Good evidence"
  | "Limited evidence"
  | "Weak source"
  | "Outdated";

export type EvidenceStance = "supports" | "contradicts" | "context" | "unclear";
export type EvidenceStrength = "strong" | "medium" | "weak";

export interface EvidenceItem {
  sourceId: string;
  stance: EvidenceStance;
  strength: EvidenceStrength;
  reason: string;
}

export type Verdict =
  | "true"
  | "mostly_true"
  | "mixed"
  | "mostly_false"
  | "false"
  | "unverified"
  | "not_a_factual_claim";

export type Confidence = "high" | "medium" | "low";

export interface EvidenceAnalysis {
  claimId: string;
  verdict: Verdict;
  confidence: Confidence;
  summary: string;
  evidence: EvidenceItem[];
  contradictions: string[];
  missing_information: string[];
  reasoning_summary: string;
}

export type ContradictionStatus =
  | "resolved"
  | "partially_resolved"
  | "unresolved"
  | "not_a_real_contradiction";

export interface Contradiction {
  topic: string;
  sourceA: string;
  sourceB: string;
  conflict: string;
  resolution: string;
  status: ContradictionStatus;
}

export interface ClaimVerdict {
  claim: SubClaim;
  analysis: EvidenceAnalysis;
  sources: Source[];
  contradictions: Contradiction[];
  verifiedAt: string;
  staleNote?: string;
  /**
   * True when retrieval itself failed (no provider succeeded). The LLM is
   * never consulted in this case — there is nothing to analyze. Distinct
   * from `unverified`, which means search worked but evidence was thin.
   */
  searchFailed: boolean;
  searchReport: SearchReport;
  /** Deterministic verdict confidence. Absent only when search failed. */
  confidence?: ConfidenceScore;
}

/** Per-provider outcome for one investigation step. Never thrown away. */
export interface ProviderReport {
  provider: string;
  status: "success" | "timeout" | "error";
  /**
   * §16 taxonomy: ok (sources returned) | empty (worked, zero hits) |
   * network (DNS/TCP/TLS/timeout) | http (provider error status) |
   * blocked (challenge/captcha/deny page) | parse (response unusable).
   */
  category: "ok" | "empty" | "network" | "http" | "blocked" | "parse";
  /** Wall-clock ms for this provider's batch (all queries). */
  latencyMs: number;
  /** Raw hits returned (pre-dedupe). */
  sources: number;
  retries: number;
  /** One entry per failed attempt, oldest first. */
  attempts: string[];
  httpStatus?: number;
  error: string | null;
}

export interface SearchReport {
  providers: ProviderReport[];
  /** Raw hits across providers, pre-dedupe. */
  totalFound: number;
  /** Sources surviving normalization + dedupe. */
  uniqueCount: number;
  /** True when the global search deadline fired before providers finished. */
  budgetExhausted: boolean;
}

export type SearchDepth = "flash" | "deep" | "extended";

/** Deterministic confidence in the verdict — computed by Verity's scorer, never by the LLM. */
export interface ConfidenceScore {
  /** Integer 3–97. Confidence in the verdict, NOT probability the claim is true. */
  percentage: number;
  /** Signed contributions that sum to `percentage`. Shown in the UI. */
  breakdown: Record<string, number>;
}

export interface Investigation {
  id: string;
  originalClaim: string;
  depth: SearchDepth;
  extraction: ClaimExtraction;
  results: ClaimVerdict[];
  createdAt: string;
  cached?: boolean;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
  author?: string;
  publishedAt?: string;
  sourceType?: SourceType;
  /** True when the hit is a prior fact-check (distinct signal, surfaced separately in the UI). */
  isFactCheck?: boolean;
}

export interface SearchOptions {
  count?: number;
  signal?: AbortSignal;
  /** Per-request provider budget in ms (mode-derived). Providers fall back to their default. */
  timeoutMs?: number;
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  true: "TRUE",
  mostly_true: "MOSTLY TRUE",
  mixed: "MIXED",
  mostly_false: "MOSTLY FALSE",
  false: "FALSE",
  unverified: "UNVERIFIED",
  not_a_factual_claim: "NOT A FACTUAL CLAIM",
};
