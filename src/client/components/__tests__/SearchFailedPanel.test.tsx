import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SearchFailedPanel } from "../SearchFailedPanel.js";
import type { SearchReport } from "../../../shared/types.js";

const report: SearchReport = {
  providers: [
    { provider: "duckduckgo", status: "timeout", latencyMs: 15000, sources: 0, retries: 1, error: "timed out" },
    { provider: "wikipedia", status: "error", latencyMs: 200, sources: 0, retries: 1, httpStatus: 503, error: "status 503" },
  ],
  totalFound: 0,
  uniqueCount: 0,
  budgetExhausted: false,
};

describe("SearchFailedPanel", () => {
  it("shows SEARCH FAILED (never UNVERIFIED), provider statuses, and a working retry", async () => {
    const onRetry = vi.fn();
    render(<SearchFailedPanel report={report} retrying={false} onRetry={onRetry} />);
    expect(screen.getByText("SEARCH FAILED")).toBeInTheDocument();
    expect(screen.queryByText("UNVERIFIED")).not.toBeInTheDocument();
    expect(screen.getByText(/duckduckgo/)).toBeInTheDocument();
    expect(screen.getByText(/timeout/)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 503/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry search" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables retry while retrying and notes budget exhaustion", () => {
    render(<SearchFailedPanel report={{ ...report, budgetExhausted: true }} retrying={true} onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();
    expect(screen.getByText(/budget was exhausted/)).toBeInTheDocument();
  });
});
