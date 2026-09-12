import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SidebarNav } from "../Sidebar.js";
import { UtilityPanel } from "../UtilityPanel.js";
import type { Investigation } from "../../../shared/types.js";

function renderNav(props?: Partial<Parameters<typeof SidebarNav>[0]>) {
  return render(
    <SidebarNav
      active="investigate"
      onNavigate={() => {}}
      onOpenSettings={() => {}}
      theme="light"
      onToggleTheme={() => {}}
      pending={false}
      {...props}
    />
  );
}

describe("SidebarNav", () => {
  it("navigates to real sections with a visible active state", async () => {
    const onNavigate = vi.fn();
    renderNav({ onNavigate });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("button", { name: "Go to investigation form" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(nav).getByRole("button", { name: "Go to research history" }));
    expect(onNavigate).toHaveBeenCalledWith("history");
  });

  it("exposes settings and theme controls", async () => {
    const onOpenSettings = vi.fn();
    const onToggleTheme = vi.fn();
    renderNav({ onOpenSettings, onToggleTheme, theme: "dark" });
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });
});

function inv(): Investigation {
  return {
    id: "inv-1",
    originalClaim: "Water boils.",
    depth: "deep",
    extraction: { original_claim: "Water boils.", claims: [], searchQueries: {}, verifiability: {} },
    results: [
      {
        claim: { id: "claim-1", text: "Water boils.", type: "scientific", importance: "primary" },
        analysis: {
          claimId: "claim-1",
          verdict: "true",
          confidence: "high",
          summary: "Established.",
          evidence: [{ sourceId: "source-1", stance: "supports", strength: "strong", reason: "Lab." }],
          contradictions: [],
          missing_information: [],
          reasoning_summary: "Unanimous.",
        },
        sources: [
          { id: "source-1", title: "Lab reference", url: "https://lab.example/x", domain: "lab.example", sourceType: "academic", snippet: "100C.", quality: "High confidence" },
          { id: "source-2", title: "Blog кипяток", url: "https://blog.example/y", domain: "blog.example", sourceType: "blog", snippet: "Yep." },
        ],
        contradictions: [],
        verifiedAt: "2026-09-11T06:00:00.000Z",
        searchFailed: false,
        searchReport: { providers: [], totalFound: 2, uniqueCount: 2, budgetExhausted: false },
        confidence: { percentage: 91, breakdown: {} },
      },
    ],
    createdAt: "2026-09-11T06:00:00.000Z",
  };
}

describe("UtilityPanel", () => {
  it("shows a compact empty state when idle", () => {
    render(<UtilityPanel stage="idle" investigation={null} />);
    expect(screen.getByText(/populate this panel/)).toBeInTheDocument();
  });

  it("surfaces real status, depth, confidence, counts, strongest source, quality", () => {
    const { container } = render(<UtilityPanel stage="done" investigation={inv()} />);
    const panel = within(container).getByLabelText("Investigation details");
    expect(within(panel).getByText("DEEP")).toBeInTheDocument();
    expect(within(panel).getByText("TRUE")).toBeInTheDocument();
    expect(within(panel).getByText("91%")).toBeInTheDocument();
    expect(within(panel).getByText("lab.example")).toBeInTheDocument();
    expect(within(panel).getByText("Lab reference")).toBeInTheDocument();
    expect(within(panel).getByText(/High confidence/)).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/MOSTLY|UNVERIFIED/);
  });
});
