import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { History } from "../History.js";
import type { Investigation } from "../../../shared/types.js";

function inv(id: string): Investigation {
  return {
    id,
    originalClaim: `Claim ${id} about the world`,
    depth: "deep",
    extraction: { original_claim: `Claim ${id}`, claims: [], searchQueries: {}, verifiability: {} },
    results: [],
    createdAt: "2026-09-11T06:00:00.000Z",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("History", () => {
  it("4. clicking an entry selects it without any network call (no re-investigation)", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("network must not be touched");
  it("renders legacy records without a depth field instead of crashing", () => {
    const legacy = inv("old") as unknown as Record<string, unknown>;
    delete legacy.depth;
    render(<History items={[legacy as unknown as Investigation]} onSelect={() => {}} />);
    // Falls back to DEEP rather than throwing on .toUpperCase().
    expect(screen.getByText(/DEEP/)).toBeInTheDocument();
  });
});
    vi.stubGlobal("fetch", fetchSpy);
    const onSelect = vi.fn();
    render(<History items={[inv("a"), inv("b")]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Claim b about/ }));
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("5. individual delete removes one entry", async () => {
    const onDelete = vi.fn();
    render(<History items={[inv("a"), inv("b")]} onSelect={() => {}} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /Delete investigation: Claim a about/ }));
    expect(onDelete).toHaveBeenCalledWith("a");
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("6. clear-all asks for confirmation first, then clears", async () => {
    const onClear = vi.fn();
    render(<History items={[inv("a")]} onSelect={() => {}} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear all history" }));
    // Not cleared yet — confirmation step required.
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm clear" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("clear confirmation can be cancelled", async () => {
    const onClear = vi.fn();
    render(<History items={[inv("a")]} onSelect={() => {}} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Clear all history" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirm clear" })).not.toBeInTheDocument();
  });
});
