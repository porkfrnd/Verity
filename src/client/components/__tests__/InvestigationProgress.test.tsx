import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProgress } from "../InvestigationProgress.js";

describe("InvestigationProgress", () => {
  it("reflects each pipeline stage and never marks verdict complete early", () => {
    const { rerender } = render(<InvestigationProgress stage="searching" />);
    expect(screen.getByText(/Searching sources/)).toBeInTheDocument();
    // "Preparing verdict" must not show as done while searching
    expect(screen.getByText(/Preparing verdict/).textContent).not.toMatch(/^✓/);
    rerender(<InvestigationProgress stage="done" />);
    expect(screen.getByText(/✓ Preparing verdict/)).toBeInTheDocument();
  });
});
