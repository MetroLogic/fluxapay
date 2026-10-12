/**
 * Debounce behaviour for the command palette search input (#779).
 *
 * The failure mode is one search per keystroke, so these count handler calls
 * across a burst of typing rather than asserting on rendered output alone.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import {
  CommandPalette,
  COMMAND_PALETTE_DEBOUNCE_MS,
} from "@/components/CommandPalette";

vi.mock("@/lib/auth", () => ({ isAdmin: () => false }));

/** Open the palette with its Cmd+K shortcut. */
function openPalette() {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true }),
    );
  });
}

/** Type `text` one character at a time, with no time passing between them. */
function typeQuickly(input: HTMLElement, text: string) {
  for (const char of text) {
    fireEvent.change(input, {
      target: { value: (input as HTMLInputElement).value + char },
    });
  }
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CommandPalette search debounce", () => {
  it("fires the search handler once when five characters are typed quickly", () => {
    const onSearch = vi.fn();
    render(<CommandPalette onSearch={onSearch} />);
    openPalette();

    const input = screen.getByRole("combobox");
    typeQuickly(input, "payme");

    // Nothing has settled yet, so nothing has been searched.
    expect(onSearch).not.toHaveBeenCalled();

    advance(COMMAND_PALETTE_DEBOUNCE_MS);

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("payme");
  });

  it("does not search a palette that was opened but never typed in", () => {
    const onSearch = vi.fn();
    render(<CommandPalette onSearch={onSearch} />);
    openPalette();

    advance(COMMAND_PALETTE_DEBOUNCE_MS * 4);

    expect(onSearch).not.toHaveBeenCalled();
  });

  it("searches again once typing resumes after a pause", () => {
    const onSearch = vi.fn();
    render(<CommandPalette onSearch={onSearch} />);
    openPalette();

    const input = screen.getByRole("combobox");
    typeQuickly(input, "pay");
    advance(COMMAND_PALETTE_DEBOUNCE_MS);
    expect(onSearch).toHaveBeenCalledTimes(1);

    typeQuickly(input, "ments");
    advance(COMMAND_PALETTE_DEBOUNCE_MS);

    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(onSearch).toHaveBeenLastCalledWith("payments");
  });

  it("honours a caller-supplied debounce delay", () => {
    const onSearch = vi.fn();
    render(<CommandPalette onSearch={onSearch} debounceMs={1000} />);
    openPalette();

    typeQuickly(screen.getByRole("combobox"), "refund");

    advance(COMMAND_PALETTE_DEBOUNCE_MS);
    expect(onSearch).not.toHaveBeenCalled();

    advance(1000);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("keeps the input responsive while the search is still settling", () => {
    render(<CommandPalette />);
    openPalette();

    const input = screen.getByRole("combobox") as HTMLInputElement;
    typeQuickly(input, "invo");

    // The field shows every keystroke immediately; only the search waits.
    expect(input.value).toBe("invo");
  });

  it("filters the route list from the settled query", () => {
    render(<CommandPalette />);
    openPalette();

    typeQuickly(screen.getByRole("combobox"), "refund");
    advance(COMMAND_PALETTE_DEBOUNCE_MS);

    expect(screen.getByRole("option", { name: "Refunds" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Invoices" })).toBeNull();
  });

  it("marks itself busy while typing has not settled", () => {
    render(<CommandPalette />);
    openPalette();

    typeQuickly(screen.getByRole("combobox"), "set");
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");

    advance(COMMAND_PALETTE_DEBOUNCE_MS);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "false");
  });

  it("works without a search handler at all", () => {
    render(<CommandPalette />);
    openPalette();

    expect(() => {
      typeQuickly(screen.getByRole("combobox"), "abc");
      advance(COMMAND_PALETTE_DEBOUNCE_MS);
    }).not.toThrow();
  });
});
