import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchOverlay } from "../ResearchOverlay.js";
import type { Investigation } from "../../../shared/types.js";

function investigation(): Investigation {
  return {
    id: "inv-1",
    originalClaim: "Water boils at 100°C at sea level.",
    depth: "deep",
    extraction: { original_claim: "Water boils.", claims: [], searchQueries: {}, verifiability: {} },
    results: [
      {
        claim: { id: "claim-1", text: "Water boils.", type: "scientific", importance: "primary" },
        analysis: {
          claimId: "claim-1",
          verdict: "true",
          confidence: "high",
          summary: "Well established.",
          evidence: [{ sourceId: "source-1", stance: "supports", strength: "strong", reason: "Lab data." }],
          contradictions: [],
          missing_information: [],
          reasoning_summary: "Unanimous lab evidence.",
        },
        sources: [
          { id: "source-1", title: "Boiling point reference", url: "https://example.edu/boil", domain: "example.edu", sourceType: "academic", snippet: "100°C at sea level.", quality: "High confidence" },
          { id: "source-2", title: "Kitchen blog", url: "https://blog.example.com/boil", domain: "blog.example.com", sourceType: "blog", snippet: "Yep, boils." },
        ],
        contradictions: [],
        verifiedAt: "2026-09-11T06:00:00.000Z",
        searchFailed: false,
        searchReport: { providers: [], totalFound: 2, uniqueCount: 2, budgetExhausted: false },
        confidence: { percentage: 91, breakdown: { evidence_strength: 30 } },
      },
    ],
    createdAt: "2026-09-11T06:00:00.000Z",
  };
}

afterEach(() => {
  document.body.style.overflow = "";
});

describe("ResearchOverlay", () => {
  it("renders the complete stored record without refetching", () => {
    const { container } = render(<ResearchOverlay investigation={investigation()} onClose={() => {}} />);
    const dialog = within(container).getByRole("dialog");
    expect(within(dialog).getByText(/Water boils at 100°C at sea level/)).toBeInTheDocument();
    expect(within(dialog).getByText("TRUE")).toBeInTheDocument();
    expect(within(dialog).getByText("91%")).toBeInTheDocument();
    expect(within(dialog).getByText("Unanimous lab evidence.")).toBeInTheDocument();
    expect(within(dialog).getByText("Boiling point reference")).toBeInTheDocument();
    expect(within(dialog).getByText("Kitchen blog")).toBeInTheDocument();
    expect(within(dialog).getByText(/DEEP/)).toBeInTheDocument();
    // Strongest source first.
    const stack = within(dialog).getByRole("list", { name: /strongest first/ });
    const items = within(stack).getAllByRole("listitem");
    expect(items[0].textContent).toMatch(/Boiling point reference/);
  });

  it("closes via button and Escape, locks body scroll while open", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<ResearchOverlay investigation={investigation()} onClose={onClose} />);
    expect(document.body.style.overflow).toBe("hidden");
    await userEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    document.body.style.overflow = "";
    const onClose2 = vi.fn();
    const { unmount: unmount2 } = render(<ResearchOverlay investigation={investigation()} onClose={onClose2} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose2).toHaveBeenCalledTimes(1);
    unmount2();
    expect(document.body.style.overflow).toBe("");
  });
});
