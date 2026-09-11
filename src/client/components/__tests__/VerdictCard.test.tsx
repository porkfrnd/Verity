import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ClaimVerdict } from "../../../shared/types.js";
import { VERDICT_LABELS } from "../../../shared/types.js";
import { VerdictCard } from "../VerdictCard.js";

function verdict(over: Partial<ClaimVerdict["analysis"]> = {}): ClaimVerdict {
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
});
