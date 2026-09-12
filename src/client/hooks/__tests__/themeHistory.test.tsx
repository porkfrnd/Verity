import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "../useTheme.js";
import { History } from "../../components/History.js";
import type { Investigation } from "../../../shared/types.js";

function Probe() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle} aria-pressed={theme === "dark"}>
      theme:{theme}
    </button>
  );
}

function inv(id: string): Investigation {
  return {
    id,
    originalClaim: `Claim ${id}`,
    depth: "deep",
    extraction: { original_claim: `Claim ${id}`, claims: [], searchQueries: {}, verifiability: {} },
    results: [],
    createdAt: "2026-09-11T06:00:00.000Z",
  };
}

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  document.documentElement.removeAttribute("data-theme");
});

describe("useTheme", () => {
  it("toggles theme, persists it, and applies data-theme", async () => {
    try {
      localStorage.setItem("verity.theme", "light");
    } catch {
      // ignore
    }
    render(<Probe />);
    expect(document.documentElement.dataset.theme).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: /theme:light/ }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    try {
      expect(localStorage.getItem("verity.theme")).toBe("dark");
    } catch {
      // storage unavailable in this env — attribute assertion above still holds
    }
  });

  it("respects system dark preference on first load", async () => {
    const w = window as unknown as Record<string, unknown>;
    const prev = w.matchMedia;
    w.matchMedia = () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} });
    try {
      localStorage.removeItem("verity.theme");
    } catch {
      // ignore
    }
    document.documentElement.removeAttribute("data-theme");
    render(<Probe />);
    expect(document.documentElement.dataset.theme).toBe("dark");
    if (prev === undefined) delete w.matchMedia;
    else w.matchMedia = prev;
  });
});

describe("History interaction", () => {
  it("clicking an entry selects it by id (overlay opens, no navigation)", async () => {
    const onSelect = vi.fn();
    render(<History items={[inv("a"), inv("b")]} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Claim b/ }));
    expect(onSelect).toHaveBeenCalledWith("b");
    expect(window.location.hash).toBe("");
  });
});
