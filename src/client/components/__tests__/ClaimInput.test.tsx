import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClaimInput } from "../ClaimInput.js";

describe("ClaimInput", () => {
  it("submits on click and Enter; disables while pending; validates empty input", async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<ClaimInput pending={false} onSubmit={onSubmit} />);
    const box = screen.getByLabelText("Claim to investigate");
    await userEvent.type(box, "Water boils at 100C.");
    await userEvent.click(screen.getByRole("button", { name: "Investigate" }));
    expect(onSubmit).toHaveBeenCalledWith("Water boils at 100C.");

    rerender(<ClaimInput pending={true} onSubmit={onSubmit} />);
    expect(screen.getByRole("button", { name: "Investigating…" })).toBeDisabled();
  });

  it("shows validation for empty input", async () => {
    render(<ClaimInput pending={false} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Investigate" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
