import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvidenceList } from "../EvidenceList.js";
import { ContradictionPanel } from "../ContradictionPanel.js";

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
});
