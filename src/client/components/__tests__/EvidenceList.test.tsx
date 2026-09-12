import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceList, SourceStack } from "../EvidenceList.js";
import { ContradictionPanel } from "../ContradictionPanel.js";
import type { Source } from "../../../shared/types.js";

function src(id: string, title: string): Source {
  return { id, title, url: `https://example.com/${id}`, domain: "example.com", sourceType: "news", snippet: "excerpt" };
}

describe("EvidenceList + ContradictionPanel", () => {
  it("renders zero states without breaking layout", () => {
    render(<EvidenceList sources={[]} />);
    expect(screen.getByText(/insufficient evidence/)).toBeInTheDocument();
    render(<ContradictionPanel items={[]} />);
    expect(screen.getByText(/No direct contradictions/)).toBeInTheDocument();
  });

  it("renders sources with accessible open links", () => {
    render(
      <EvidenceList
        sources={[
          { id: "source-1", title: "NASA", url: "https://nasa.gov/x", domain: "nasa.gov", sourceType: "government", snippet: "hi" },
        ]}
      />
    );
    expect(screen.getByText("NASA")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open source" })).toHaveAttribute("href", "https://nasa.gov/x");
  });

  it("presents backend order unchanged, strongest first with rank labels", () => {
    const sources = [src("source-1", "Strongest"), src("source-2", "Middle"), src("source-3", "Weakest")];
    const { container } = render(<SourceStack sources={sources} />);
    const list = within(container).getByRole("list", { name: /strongest first/ });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    // DOM order == backend order: no re-sorting, no invented scores.
    expect(items[0].textContent).toMatch(/Strongest/);
    expect(items[1].textContent).toMatch(/Middle/);
    expect(items[2].textContent).toMatch(/Weakest/);
    expect(within(items[0]).getByText("#1")).toBeInTheDocument();
    expect(within(items[0]).getByText("strongest evidence")).toBeInTheDocument();
    expect(within(container).getByText("#3")).toBeInTheDocument();
  });
});
