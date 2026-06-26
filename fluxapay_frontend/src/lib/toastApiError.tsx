import toast from "react-hot-toast";
import { ApiError } from "@/lib/api";

/** User-friendly messages for known API error codes. */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "Invalid email or password.",
  ACCOUNT_NOT_VERIFIED: "Please verify your account before signing in.",
  ACCOUNT_NOT_ACTIVE: "Your account is not active. Contact support.",
  MERCHANT_NOT_FOUND: "Merchant account not found.",
  PAYMENT_NOT_FOUND: "Payment not found.",
  INVOICE_NOT_FOUND: "Invoice not found.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please wait a moment and try again.",
  PAYMENT_RATE_LIMIT: "Too many payment requests. Please wait and try again.",
  OTP_SMS_RATE_LIMIT: "Too many verification requests. Please try again later.",
  VALIDATION_ERROR: "Please check your input and try again.",
  INVALID_METADATA: "Invalid metadata. Check size and format.",
  WEBHOOK_SECRET_NOT_CONFIGURED: "Configure a webhook secret in settings first.",
  MAX_ACTIVE_KEYS: "Maximum active API keys reached. Revoke an old key first.",
  KYC_ALREADY_APPROVED: "KYC is already approved.",
  KYC_NOT_FOUND: "KYC submission not found.",
  INTERNAL_ERROR: "A server error occurred. Please try again later.",
};

function resolveMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "An unexpected error occurred.";

  if (error.code && ERROR_CODE_MESSAGES[error.code]) {
    return ERROR_CODE_MESSAGES[error.code];
  }

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
  return (
    error.status === 429 ||
    error.status >= 500 ||
    error.code === "RATE_LIMIT_EXCEEDED" ||
    error.code === "INTERNAL_ERROR"
  );
}

export function toastApiError(error: unknown): void {
  // Don't show toast for auth errors (401/403) as they're handled globally with logout
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return;
  }

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
