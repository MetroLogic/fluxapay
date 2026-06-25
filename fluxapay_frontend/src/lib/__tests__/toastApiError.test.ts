import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";

// Mock react-hot-toast before importing the module under test
vi.mock("react-hot-toast", () => {
  const dismiss = vi.fn();
  const error = vi.fn();
  return {
    default: { error, dismiss },
    __esModule: true,
  };
});

import toast from "react-hot-toast";
import { toastApiError, toastApiErrorWithRetry } from "@/lib/toastApiError";
import { ApiError } from "@/lib/api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toastApiError", () => {
  // Example 2.1: assert toastApiError is exported and callable
  it("is exported and callable", () => {
    expect(typeof toastApiError).toBe("function");
    expect(() => toastApiError(new Error("test"))).not.toThrow();
  });
});

describe("toastApiErrorWithRetry", () => {
  // Example 3.1: assert toastApiErrorWithRetry is exported and callable
  it("is exported and callable", () => {
    expect(typeof toastApiErrorWithRetry).toBe("function");
    expect(() => toastApiErrorWithRetry(new Error("test"), () => {})).not.toThrow();
  });

  // Example 3.3: call with a 500 error; render the toast; click "Retry"; assert onRetry and toast.dismiss called
  it("renders a Retry button for 500 errors that calls onRetry and toast.dismiss on click", () => {
    const onRetry = vi.fn();
    const err = new ApiError(500, "server error");

    toastApiErrorWithRetry(err, onRetry);

    // toast.error should have been called with a render function
    expect(toast.error).toHaveBeenCalledTimes(1);
    const renderFn = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof renderFn).toBe("function");

    // Render the toast content
    const fakeToast = { id: "toast-id-1" };
    const { getByText } = render(React.createElement(() => renderFn(fakeToast)));

    // Retry button should be present
    const retryBtn = getByText("Retry");
    expect(retryBtn).toBeTruthy();

    // Click Retry
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).toHaveBeenCalledWith("toast-id-1");
  });
});
