import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ClaimVerdict } from "../../../shared/types.js";
import { VERDICT_LABELS } from "../../../shared/types.js";
import { VerdictCard } from "../VerdictCard.js";

function verdict(over: Partial<ClaimVerdict["analysis"]> = {}, extra?: Partial<ClaimVerdict>): ClaimVerdict {
  return {
    claim: { id: "claim-1", text: "Test claim.", type: "factual", importance: "primary" },
    analysis: {
      claimId: "claim-1",
      verdict: "mostly_false",
      confidence: "high",
      summary: "Summary.",
      evidence: [],
      contradictions: [],
      missing_information: [],
      reasoning_summary: "r",
      ...over,
    },
    sources: [],
    contradictions: [],
    verifiedAt: new Date().toISOString(),
    searchFailed: false,
    searchReport: { providers: [], totalFound: 0, uniqueCount: 0, budgetExhausted: false },
    ...extra,
  };
}

describe("VerdictCard", () => {
  it("renders each verdict type including UNVERIFIED and NOT A FACTUAL CLAIM", () => {
    for (const v of ["true", "mostly_false", "mixed", "unverified", "not_a_factual_claim"] as const) {
      const { unmount, container } = render(<VerdictCard result={verdict({ verdict: v })} />);
      expect(within(container).getByText(VERDICT_LABELS[v])).toBeInTheDocument();
      unmount();
    }
  });

  it("handles zero-evidence without breaking layout", () => {
    render(<VerdictCard result={verdict({ verdict: "unverified" })} />);
    expect(screen.getByText(/No direct evidence/)).toBeInTheDocument();
  });

  it("labels UNVERIFIED as insufficient evidence, worded as assessment uncertainty", () => {
    render(<VerdictCard result={verdict({ verdict: "unverified" })} />);
    expect(screen.getByText(/Insufficient evidence/)).toBeInTheDocument();
    expect(screen.queryByText(/87% true|% true/)).not.toBeInTheDocument();
  });

  it("shows the deterministic percentage and its breakdown when present", () => {
    const { container } = render(
      <VerdictCard
        result={verdict({}, { confidence: { percentage: 87, breakdown: { evidence_strength: 30, source_quality: 24, contradictions: -4 } } })}
      />
    );
    expect(within(container).getByText("87%")).toBeInTheDocument();
    expect(within(container).getByText(/Evidence strength/)).toBeInTheDocument();
    expect(within(container).getByText(/confidence in this verdict/)).toBeInTheDocument();
  });
});
