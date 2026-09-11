import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InvestigationProgress } from "../InvestigationProgress.js";

describe("InvestigationProgress", () => {
  it("reflects each pipeline stage and never marks verdict complete early", () => {
    const { rerender } = render(<InvestigationProgress stage="searching" />);
    expect(screen.getByText(/Searching sources/)).toBeInTheDocument();
    // "Preparing verdict" must not show as done while searching
    expect(screen.getByText("Preparing verdict").closest("li")).toHaveTextContent("○");
    rerender(<InvestigationProgress stage="done" />);
    expect(screen.getByText("Preparing verdict").closest("li")).toHaveTextContent("✓");
  });

  it("renders live per-provider rows with latency and source counts", () => {
    render(
      <InvestigationProgress
        stage="searching"
        providers={[
          { provider: "duckduckgo", status: "success", latencyMs: 1200, sources: 6 },
          { provider: "wikipedia", status: "timeout", latencyMs: 15000, error: "timed out" },
        ]}
        totalFound={6}
        uniqueCount={5}
      />
    );
    expect(screen.getByText("duckduckgo")).toBeInTheDocument();
    expect(screen.getByText(/1\.2s — 6 sources/)).toBeInTheDocument();
    expect(screen.getByText(/timeout/)).toBeInTheDocument();
    expect(screen.getByText(/6 sources found · 5 unique after dedup/)).toBeInTheDocument();
  });
});
