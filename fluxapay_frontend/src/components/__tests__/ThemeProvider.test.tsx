import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../ThemeProvider";

function ThemeControls() {
  const { theme, isDark, setTheme } = useTheme();
  return (
    <div>
      <span>{theme}</span>
      <span>{isDark ? "dark-resolved" : "light-resolved"}</span>
      <button onClick={() => setTheme("light")}>Choose light</button>
      <button onClick={() => setTheme("dark")}>Choose dark</button>
      <button onClick={() => setTheme("system")}>Choose system</button>
    </div>
  );
}

describe("ThemeProvider", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
    vi.restoreAllMocks();
  });

  it("applies a saved dark preference on mount", async () => {
    localStorage.setItem("theme", "dark");
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>,
    );

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(screen.getByText("dark-resolved")).toBeInTheDocument();
  });

  it("persists and applies a changed preference", async () => {
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose dark" }));

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("resolves system preference from the operating system", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      () =>
        ({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    localStorage.setItem("theme", "system");
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>,
    );

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(screen.getByText("system")).toBeInTheDocument();
    expect(screen.getByText("dark-resolved")).toBeInTheDocument();
  });
});