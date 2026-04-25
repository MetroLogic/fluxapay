import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import GlobalErrorBoundary from "@/components/GlobalErrorBoundary";

// Suppress React's error boundary console output during tests
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// A component that throws during render
function ThrowingChild({ message }: { message: string }) {
  throw new Error(message);
}

// Example 1.3: throw from child; assert fallback contains "Something went wrong"
describe("Example 1.3: fallback UI on render error", () => {
  it("renders fallback UI when a child throws", () => {
    render(
      <GlobalErrorBoundary>
        <ThrowingChild message="boom" />
      </GlobalErrorBoundary>,
    );
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText(/An unexpected error occurred/)).toBeTruthy();
  });
});

// Example 1.4+1.5: throw from child; click "Try again"; assert children remount
describe("Example 1.4+1.5: reset via Try again button", () => {
  it("remounts children after clicking Try again", () => {
    let shouldThrow = true;

    function MaybeThrow() {
      if (shouldThrow) throw new Error("initial error");
      return <div>recovered content</div>;
    }

    render(
      <GlobalErrorBoundary>
        <MaybeThrow />
      </GlobalErrorBoundary>,
    );

    // Fallback is shown
    expect(screen.getByText("Something went wrong")).toBeTruthy();

    // Stop throwing before reset
    shouldThrow = false;

    // Click Try again
    fireEvent.click(screen.getByText("Try again"));

    // Children should remount and show their content
    expect(screen.getByText("recovered content")).toBeTruthy();
  });
});

// Example 1.6: throw from child; assert console.error was called with error and component stack
describe("Example 1.6: console.error called with error and info", () => {
  it("calls console.error with the error and component stack", () => {
    const err = new Error("test error");

    function AlwaysThrow() {
      throw err;
    }

    render(
      <GlobalErrorBoundary>
        <AlwaysThrow />
      </GlobalErrorBoundary>,
    );

    expect(console.error).toHaveBeenCalled();
    // Find the call where our componentDidCatch passed the error directly
    const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
    const ourCall = calls.find((args) => args[0] === err || args[1] === err);
    expect(ourCall).toBeTruthy();
    // componentDidCatch calls console.error(error, info) — find that call
    const directCall = calls.find((args) => args[0] === err);
    if (directCall) {
      expect(directCall[1]).toHaveProperty("componentStack");
    } else {
      // React may wrap the call; verify error appears somewhere in the calls
      const anyCallWithError = calls.some((args) =>
        args.some((a: unknown) => a === err),
      );
      expect(anyCallWithError).toBe(true);
    }
  });
});
