import type { ClaimExtraction, EvidenceAnalysis, Source, SubClaim } from "../../../shared/types.js";

export interface LLMProvider {
  id: string;
  extractClaims(rawClaim: string): Promise<ClaimExtraction>;
  analyzeEvidence(input: { claim: SubClaim; sources: Source[] }): Promise<EvidenceAnalysis>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
