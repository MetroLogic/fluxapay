import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeSelector } from "../ThemeSelector";

describe("ThemeSelector", () => {
  it("renders all preferences and marks the current selection", () => {
    render(<ThemeSelector theme="system" onThemeChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
  });

  it.each(["light", "dark", "system"] as const)("selects %s", (preference) => {
    const onThemeChange = vi.fn();
    render(
      <ThemeSelector
        theme={preference === "light" ? "dark" : "light"}
        onThemeChange={onThemeChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: preference[0].toUpperCase() + preference.slice(1) }));

    expect(onThemeChange).toHaveBeenCalledWith(preference);
  });

  it("disables every option while the initial preference is loading", () => {
    render(<ThemeSelector theme="system" onThemeChange={vi.fn()} disabled />);

    expect(screen.getByRole("radio", { name: "Light" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "System" })).toBeDisabled();
  });
});