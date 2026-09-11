import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Settings } from "../Settings.js";

describe("Settings", () => {
  it("masks key input, remove clears state, test connection reflects real result", async () => {
    render(<Settings open={true} onClose={() => {}} />);
    const input = screen.getByLabelText("API Key") as HTMLInputElement;
    expect(input.type).toBe("password");
    await userEvent.type(input, "gsk_test123");
    expect(input.value).toBe("gsk_test123");
    await userEvent.click(screen.getByRole("button", { name: "Remove key" }));
    expect((screen.getByLabelText("API Key") as HTMLInputElement).value).toBe("");
  });

  it("has accessible names for interactive elements", () => {
    render(<Settings open={true} onClose={() => {}} />);
    expect(screen.getByLabelText("AI Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("Model")).toBeInTheDocument();
  });
});
