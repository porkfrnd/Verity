import { act, render, screen, within } from "@testing-library/react";
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

  it("marks the in-focus card active as it enters the focus band", async () => {
    const seen: Array<(entries: Array<{ isIntersecting: boolean; target: HTMLElement }>) => void> = [];
    const RealIO = (globalThis as Record<string, unknown>).IntersectionObserver;
    (globalThis as Record<string, unknown>).IntersectionObserver = class {
      constructor(cb: (entries: Array<{ isIntersecting: boolean; target: HTMLElement }>) => void) {
        seen.push(cb);
      }
      observe() {}
      disconnect() {}
    };
    try {
      const sources = [src("source-1", "Strongest"), src("source-2", "Weakest")];
      const { container } = render(<SourceStack sources={sources} />);
      const cards = within(container).getAllByRole("listitem");
      const fire = seen[0];
      // Weakest card enters focus band while strongest leaves it.
      const el = (i: number) => cards[i] as HTMLElement;
      await act(async () => {
        fire([
          { isIntersecting: false, target: el(0) },
          { isIntersecting: true, target: el(1) },
        ]);
      });
      const updated = within(container).getAllByRole("listitem");
      expect(updated[1].className).toMatch(/is-active/);
      expect(updated[1].className).not.toMatch(/is-past/);
    } finally {
      if (RealIO === undefined) delete (globalThis as Record<string, unknown>).IntersectionObserver;
      else (globalThis as Record<string, unknown>).IntersectionObserver = RealIO;
    }
  });

  it("falls back gracefully without IntersectionObserver", () => {
    const RealIO = (globalThis as Record<string, unknown>).IntersectionObserver;
    delete (globalThis as Record<string, unknown>).IntersectionObserver;
    try {
      const { container } = render(<SourceStack sources={[src("source-1", "Only")]} />);
      expect(within(container).getByRole("listitem").className).toMatch(/is-active/);
    } finally {
      if (RealIO !== undefined) (globalThis as Record<string, unknown>).IntersectionObserver = RealIO;
    }
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
