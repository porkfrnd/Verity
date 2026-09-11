import { describe, expect, it } from "vitest";
import { calculateConfidence, type ConfidenceInput } from "../confidence.js";
import type { Source } from "../../../shared/types.js";

function src(id: string, sourceType: Source["sourceType"], domain: string, extra?: Partial<Source>): Source {
  return {
    id,
    title: id,
    url: `https://${domain}/${id}`,
    domain,
    sourceType,
    content: "x ".repeat(300),
    ...extra,
  } as Source;
}

function base(over?: Partial<ConfidenceInput>): ConfidenceInput {
  const sources = [
    src("source-1", "government", "nasa.gov"),
    src("source-2", "academic", "uni.edu"),
    src("source-3", "news", "reuters.com"),
  ];
  return {
    verdict: "false",
    evidence: [
      { sourceId: "source-1", stance: "contradicts", strength: "strong", reason: "r1" },
      { sourceId: "source-2", stance: "contradicts", strength: "strong", reason: "r2" },
      { sourceId: "source-3", stance: "context", strength: "medium", reason: "r3" },
    ],
    sources,
    contradictions: [],
    missingInformation: 0,
    nowIso: "2026-09-11T00:00:00.000Z",
    ...over,
  };
}

describe("calculateConfidence", () => {
  it("is deterministic: same evidence always yields the identical percentage", () => {
    const a = calculateConfidence(base());
    const shuffled = base({
      evidence: [...base().evidence].reverse(),
      sources: [...base().sources].reverse(),
    });
    const b = calculateConfidence(shuffled);
    expect(b.percentage).toBe(a.percentage);
    expect(b.breakdown).toEqual(a.breakdown);
    // And across repeated calls.
    expect(calculateConfidence(base()).percentage).toBe(a.percentage);
  });

  it("breakdown sums to the percentage", () => {
    const out = calculateConfidence(base());
    const sum = Object.values(out.breakdown).reduce((n, v) => n + v, 0);
    expect(sum).toBe(out.percentage);
  });

  it("rewards strong unanimous authoritative support highly", () => {
    const out = calculateConfidence(base());
    expect(out.percentage).toBeGreaterThanOrEqual(70);
    expect(out.percentage).toBeLessThanOrEqual(97);
  });

  it("penalizes opposing evidence and unresolved contradictions", () => {
    const clean = calculateConfidence(base()).percentage;
    const opposed = calculateConfidence(
      base({
        evidence: [
          ...base().evidence,
          { sourceId: "source-3", stance: "supports", strength: "strong", reason: "contra" },
        ],
      })
    ).percentage;
    expect(opposed).toBeLessThan(clean);
    const contradicted = calculateConfidence(
      base({
        contradictions: [
          { topic: "t", sourceA: "source-1", sourceB: "source-2", conflict: "x", resolution: "", status: "unresolved" },
        ],
      })
    ).percentage;
    expect(contradicted).toBeLessThan(clean);
    expect(contradicted).toBe(clean - 6);
  });

  it("never exceeds 97 or drops below 3", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      src(`source-${i}`, "academic", `uni${i}.edu`)
    );
    const high = calculateConfidence({
      verdict: "true",
      evidence: many.map((s) => ({ sourceId: s.id, stance: "supports" as const, strength: "strong" as const, reason: "r" })),
      sources: many,
      contradictions: [],
      missingInformation: 0,
      nowIso: "2026-09-11T00:00:00.000Z",
    });
    expect(high.percentage).toBeLessThanOrEqual(97);
    const empty = calculateConfidence({
      verdict: "unverified",
      evidence: [],
      sources: [],
      contradictions: [],
      missingInformation: 3,
      nowIso: "2026-09-11T00:00:00.000Z",
    });
    expect(empty.percentage).toBeGreaterThanOrEqual(3);
  });

  it("is NOT influenced by LLM free text (reasons/summaries)", () => {
    const a = calculateConfidence(base());
    const b = calculateConfidence(
      base({
        evidence: base().evidence.map((e) => ({ ...e, reason: "COMPLETELY DIFFERENT prose that must not matter 91.4%" })),
      })
    );
    expect(b).toEqual(a);
  });

  it("scores mixed verdicts from both sides, not one-sided evidence", () => {
    const oneSided = calculateConfidence({
      ...base(),
      verdict: "mixed",
      evidence: [{ sourceId: "source-1", stance: "supports", strength: "strong", reason: "r" }],
    });
    const bothSides = calculateConfidence({
      ...base(),
      verdict: "mixed",
      evidence: [
        { sourceId: "source-1", stance: "supports", strength: "strong", reason: "r" },
        { sourceId: "source-2", stance: "contradicts", strength: "strong", reason: "r" },
      ],
    });
    expect(bothSides.percentage).toBeGreaterThan(oneSided.percentage);
  });
});
