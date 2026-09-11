import { z } from "zod";

export const claimTypeSchema = z.enum([
  "factual",
  "statistical",
  "causal",
  "historical",
  "scientific",
  "medical",
  "legal",
  "predictive",
  "quote_attribution",
  "opinion",
]);

export const claimImportanceSchema = z.enum(["primary", "secondary", "context"]);

export const subClaimSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(3),
  type: claimTypeSchema,
  importance: claimImportanceSchema,
});

export const querySetSchema = z.object({
  neutral: z.array(z.string()).min(1),
  supporting: z.array(z.string()).min(1),
  contradicting: z.array(z.string()).min(1),
});

export const verifiabilitySchema = z.object({
  checkable: z.boolean(),
  reason: z.string().min(1),
});

export const claimExtractionSchema = z.object({
  original_claim: z.string().min(1),
  claims: z.array(subClaimSchema).min(1).max(10),
  searchQueries: z.record(querySetSchema),
  verifiability: z.record(verifiabilitySchema),
});

export const sourceTypeSchema = z.enum([
  "government",
  "academic",
  "news",
  "organization",
  "blog",
  "forum",
  "social",
  "unknown",
]);

export const accessStatusSchema = z.enum([
  "ok",
  "paywalled",
  "unreachable",
  "archived_fallback",
]);

export const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  domain: z.string().min(1),
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  snippet: z.string().optional(),
  content: z.string().optional(),
  sourceType: sourceTypeSchema,
  accessStatus: accessStatusSchema.optional(),
});

export const verdictSchema = z.enum([
  "true",
  "mostly_true",
  "mixed",
  "mostly_false",
  "false",
  "unverified",
  "not_a_factual_claim",
]);

export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const evidenceItemSchema = z.object({
  sourceId: z.string().min(1),
  stance: z.enum(["supports", "contradicts", "context", "unclear"]),
  strength: z.enum(["strong", "medium", "weak"]),
  reason: z.string().min(1),
});

export const evidenceAnalysisSchema = z.object({
  claimId: z.string().min(1),
  verdict: verdictSchema,
  confidence: confidenceSchema,
  summary: z.string().min(1),
  evidence: z.array(evidenceItemSchema),
  contradictions: z.array(z.string()),
  missing_information: z.array(z.string()),
  reasoning_summary: z.string().min(1),
}).strict();

export const contradictionStatusSchema = z.enum([
  "resolved",
  "partially_resolved",
  "unresolved",
  "not_a_real_contradiction",
]);

export const contradictionSchema = z.object({
  topic: z.string().min(1),
  sourceA: z.string().min(1),
  sourceB: z.string().min(1),
  conflict: z.string().min(1),
  resolution: z.string(),
  status: contradictionStatusSchema,
});

export const searchDepthSchema = z.enum(["flash", "deep", "extended"]);

export const investigateRequestSchema = z.object({
  claim: z.string().min(3).max(5000),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  depth: searchDepthSchema.optional(),
});

export type InvestigateRequest = z.infer<typeof investigateRequestSchema>;
