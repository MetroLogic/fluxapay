import toast from "react-hot-toast";
import { ApiError } from "@/lib/api";

function resolveMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "An unexpected error occurred.";
  switch (true) {
    case error.status === 401:
      return "Session expired. Please sign in again.";
    case error.status === 403:
      return "You do not have permission to perform this action.";
    case error.status === 404:
      return "The requested resource was not found.";
    case error.status === 429:
      return "Too many requests. Please wait a moment and try again.";
    case error.status >= 500:
      return "A server error occurred. Please try again later.";
    default:
      return error.message;
  }
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 429 || error.status >= 500;
}

export function toastApiError(error: unknown): void {
  try {
    toast.error(resolveMessage(error));
  } catch {
    // never throw
  }
}

export function toastApiErrorWithRetry(
  error: unknown,
  onRetry: () => void,
): void {
  try {
    const message = resolveMessage(error);
    if (isRetryable(error)) {
      toast.error((t) => (
        <span>
          {message}
          <button
            onClick={() => {
              onRetry();
              toast.dismiss(t.id);
            }}
          >
            Retry
          </button>
        </span>
      ));
    } else {
      toast.error(message);
    }
  } catch {
    // never throw
  }
}
