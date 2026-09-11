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
}

export interface Investigation {
  id: string;
  originalClaim: string;
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
}

export interface SearchOptions {
  count?: number;
  signal?: AbortSignal;
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
