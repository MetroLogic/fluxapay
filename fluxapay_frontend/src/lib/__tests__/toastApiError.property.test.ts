// Feature: global-error-boundary-toast-standardization
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

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

// Feature: global-error-boundary-toast-standardization, Property 3: Defined status codes map to exact messages
describe("Property 3: Defined status codes map to exact messages", () => {
  it("maps 401 to session expired message", () => {
    toastApiError(new ApiError(401, "ignored"));
    expect(toast.error).toHaveBeenCalledWith("Session expired. Please sign in again.");
    vi.clearAllMocks();
  });

  it("maps 403 to permission denied message", () => {
    toastApiError(new ApiError(403, "ignored"));
    expect(toast.error).toHaveBeenCalledWith("You do not have permission to perform this action.");
    vi.clearAllMocks();
  });

  it("maps 404 to not found message", () => {
    toastApiError(new ApiError(404, "ignored"));
    expect(toast.error).toHaveBeenCalledWith("The requested resource was not found.");
    vi.clearAllMocks();
  });

  it("maps 429 to rate limit message", () => {
    toastApiError(new ApiError(429, "ignored"));
    expect(toast.error).toHaveBeenCalledWith("Too many requests. Please wait a moment and try again.");
    vi.clearAllMocks();
  });

  it("maps any 5xx status to server error message", () => {
    fc.assert(
      fc.property(fc.integer({ min: 500, max: 599 }), (status) => {
        vi.clearAllMocks();
        toastApiError(new ApiError(status, "ignored"));
        expect(toast.error).toHaveBeenCalledWith("A server error occurred. Please try again later.");
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: global-error-boundary-toast-standardization, Property 4: Unmapped ApiError status falls through to error.message
describe("Property 4: Unmapped ApiError status falls through to error.message", () => {
  it("passes through message for unmapped ApiError statuses", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 499 }).filter((s) => ![401, 403, 404, 429].includes(s)),
        fc.string({ minLength: 1 }),
        (status, message) => {
          vi.clearAllMocks();
          toastApiError(new ApiError(status, message));
          expect(toast.error).toHaveBeenCalledWith(message);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: global-error-boundary-toast-standardization, Property 5: Non-ApiError values produce the generic fallback message
describe("Property 5: Non-ApiError values produce the generic fallback message", () => {
  it("shows generic message for non-ApiError values", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
        ),
        (value) => {
          vi.clearAllMocks();
          toastApiError(value);
          expect(toast.error).toHaveBeenCalledWith("An unexpected error occurred.");
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: global-error-boundary-toast-standardization, Property 6: Retry button presence matches retryability of the error
describe("Property 6: Retry button presence matches retryability of the error", () => {
  it("renders a Retry button for 5xx errors", () => {
    fc.assert(
      fc.property(fc.integer({ min: 500, max: 599 }), (status) => {
        vi.clearAllMocks();
        toastApiErrorWithRetry(new ApiError(status, "err"), () => {});
        const renderFn = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
        // render function means retry button is present
        expect(typeof renderFn).toBe("function");
      }),
      { numRuns: 100 },
    );
  });

  it("does NOT render a Retry button for 401, 403, 404 errors", () => {
    fc.assert(
      fc.property(fc.constantFrom(401, 403, 404), (status) => {
        vi.clearAllMocks();
        toastApiErrorWithRetry(new ApiError(status, "err"), () => {});
        const arg = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
        // plain string means no retry button
        expect(typeof arg).toBe("string");
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: global-error-boundary-toast-standardization, Property 7: Each toastApiError call produces an independent toast
describe("Property 7: Each toastApiError call produces an independent toast", () => {
  it("calls toast.error exactly N times for N invocations", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
        vi.clearAllMocks();
        for (let i = 0; i < n; i++) {
          toastApiError(new Error("test"));
        }
        expect(toast.error).toHaveBeenCalledTimes(n);
      }),
      { numRuns: 100 },
    );
  });
});
