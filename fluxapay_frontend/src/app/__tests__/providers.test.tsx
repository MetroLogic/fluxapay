import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import useSWR from "swr";

// Mock toastApiError
vi.mock("@/lib/toastApiError", () => ({
  toastApiError: vi.fn(),
}));

// Mock react-hot-toast (required by toastApiError module)
vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), dismiss: vi.fn() },
  __esModule: true,
}));

import { Providers } from "@/app/providers";
import { toastApiError } from "@/lib/toastApiError";

beforeEach(() => {
  vi.clearAllMocks();
});

// Example 4.1: render <Providers> and assert SWRConfig is present with an onError prop
describe("Example 4.1: Providers renders with SWRConfig", () => {
  it("renders children without crashing", () => {
    render(
      <Providers>
        <div>child content</div>
      </Providers>,
    );
    expect(screen.getByText("child content")).toBeTruthy();
  });
});

// Example 4.2: trigger the onError callback; assert toastApiError was called with the same error
describe("Example 4.2: SWR onError calls toastApiError", () => {
  it("calls toastApiError when SWR fires onError", async () => {
    const testError = new Error("fetch failed");

    // A component that uses SWR with a fetcher that throws
    function FailingComponent() {
      const { error } = useSWR(
        "test-key-4.2",
        () => Promise.reject(testError),
        { shouldRetryOnError: false },
      );
      return <div>{error ? "error-state" : "loading"}</div>;
    }

    render(
      <Providers>
        <FailingComponent />
      </Providers>,
    );

    await waitFor(() => {
      expect(toastApiError).toHaveBeenCalledWith(testError);
    });
  });
});

// Example 4.3: trigger a SWR fetch error; assert the error field from useSWR is still populated
describe("Example 4.3: SWR error field is still populated after toast fires", () => {
  it("preserves the SWR error field after toastApiError is called", async () => {
    const testError = new Error("network error");

    function ErrorConsumer() {
      const { error } = useSWR(
        "test-key-4.3",
        () => Promise.reject(testError),
        { shouldRetryOnError: false },
      );
      if (error) return <div data-testid="error-msg">{error.message}</div>;
      return <div>loading</div>;
    }

    render(
      <Providers>
        <ErrorConsumer />
      </Providers>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-msg")).toBeTruthy();
    });

    expect(screen.getByTestId("error-msg").textContent).toBe("network error");
    // toastApiError was also called — error was not suppressed
    expect(toastApiError).toHaveBeenCalledWith(testError);
  });
});
