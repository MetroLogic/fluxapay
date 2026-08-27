import { handleSessionExpired } from "./session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Standard result type for all API methods.
 * Ensures consistent error handling across the client:
 * - Successful calls return { data: T }
 * - Failed calls return { error: ApiError }
 * No method throws or returns null.
 */
export type Result<T> = { data: T } | { error: ApiError };

// Re-export auth functions for backward compatibility

export interface AuthSignupRequest {
  business_name: string;
  email: string;
  password: string;
  phone_number: string;
  country: string;
  settlement_currency: string;
  // Optional bank details during signup
  account_name?: string;
  account_number?: string;
  bank_name?: string;
  bank_code?: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export type RefundReason =
  | "customer_request"
  | "duplicate_payment"
  | "failed_delivery"
  | "merchant_request"
  | "dispute_resolution";

export interface InitiateRefundRequest {
  paymentId: string;
  merchantId: string;
  amount: number;
  currency: "USDC" | "XLM";
  customerAddress: string;
  reason: RefundReason;
  reasonNote?: string;
}

export type RefundStatus = "pending" | "processing" | "completed" | "failed";

export interface ListRefundsParams {
  paymentId?: string;
  merchantId?: string;
  status?: RefundStatus;
  page?: number;
  limit?: number;
}

export type MerchantExportResource = "payments" | "settlements" | "webhooks";
export type MerchantExportFormat = "csv" | "pdf";

export interface MerchantExportRequest {
  resource: MerchantExportResource;
  format: MerchantExportFormat;
  filters?: Record<string, unknown>;
  page?: number;
  limit?: number;
}

export interface MerchantExportJobStatus {
  jobId: string;
  status: "pending" | "processing" | "completed" | "failed";
  expires_at?: string;
  error?: string;
}

class ApiError extends Error {
  public retryAfterSeconds?: number;
  constructor(
    public status: number,
    message: string,
    public code?: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function getToken(): string {
  const token = localStorage.getItem("token") ?? sessionStorage.getItem("token");
  if (!token) {
    if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
      const currentUrl = window.location.pathname + window.location.search;
      window.location.href = `/login?redirect=${encodeURIComponent(currentUrl)}`;
    }
    throw new ApiError(401, "No authentication token found");
  }
  return token;
}

/** Persist auth token.
 *  keepLoggedIn=true  → localStorage  (survives browser close, expires with JWT TTL ~30 days)
 *  keepLoggedIn=false → sessionStorage (cleared when the tab/browser is closed)
 */
export function storeToken(token: string, keepLoggedIn = false): void {
  if (keepLoggedIn) {
    localStorage.setItem("token", token);
    sessionStorage.removeItem("token"); // clear any leftover session token
  } else {
    sessionStorage.setItem("token", token);
    localStorage.removeItem("token"); // ensure no persistent copy remains
  }
}

/** Remove auth token from all storage locations. */
export function clearToken(): void {
  localStorage.removeItem("token");
  sessionStorage.removeItem("token");
}

const REFRESH_TOKEN_KEY = "refresh_token";

/** Persist the refresh token beside the access token, in the same storage. */
export function storeRefreshToken(refreshToken: string, keepLoggedIn = false): void {
  if (keepLoggedIn) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  } else {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

/** The stored refresh token, or null when the session has none. */
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(REFRESH_TOKEN_KEY) ??
    sessionStorage.getItem(REFRESH_TOKEN_KEY)
  );
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export interface RefreshedSession {
  accessToken: string;
  /** Seconds until the new access token expires, when the server reports it. */
  expiresIn?: number;
}

/**
 * Exchange the stored refresh token for a fresh access token.
 *
 * Returns null when there is nothing to exchange — the merchant login endpoint
 * does not currently hand out a refresh token, so most sessions land here. In
 * that case the caller should treat imminent expiry as expiry and end the
 * session cleanly, which is still a large improvement on leaving the user on a
 * dashboard whose every request 401s.
 *
 * Throws {@link ApiError} when the server rejects the refresh token, since that
 * is a real failure the caller must react to.
 */
export async function refreshAccessToken(): Promise<RefreshedSession | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const keepLoggedIn = localStorage.getItem(REFRESH_TOKEN_KEY) !== null;

  const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ message: "Token refresh failed" }));
    throw new ApiError(
      response.status,
      (body as { message?: string }).message || "Token refresh failed",
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new ApiError(500, "Refresh response did not include an access token");
  }

  storeToken(data.access_token, keepLoggedIn);
  if (data.refresh_token) {
    // The backend rotates refresh tokens, so the old one is now dead.
    storeRefreshToken(data.refresh_token, keepLoggedIn);
  }

  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/**
 * Determines if a given HTTP status code is retryable.
 * Retryable errors: 429 (too many requests), 502/503/504 (server errors).
 * Non-retryable: 4xx errors except 429, 5xx except 502/503/504.
 */
function isRetryableStatus(status: number): boolean {
  // Explicitly retryable: rate limit + gateway/service unavailable errors
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Calculate delay for exponential backoff with optional jitter.
 * Base delay = 2^(attempt) * 100ms, capped at 32s.
 */
function calculateBackoffMs(attempt: number): number {
  const baseDelay = Math.pow(2, attempt) * 100;
  const cappedDelay = Math.min(baseDelay, 32000);
  // Add jitter: ±10%
  const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1);
  return Math.max(100, cappedDelay + jitter);
}

async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {},
  maxRetries: number = 3,
): Promise<Result<T>> {
  // We use getToken() to automatically handle missing token redirects
  let token;
  try {
    token = getToken();
  } catch (err) {
    // getToken handles the redirect, return the error wrapped in Result
    return { error: err as ApiError };
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let lastError: ApiError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        // A 401 from any authenticated call means the token is dead — expired,
        // revoked, or invalidated server-side. Ending the session here is what
        // stops a user sitting on a dashboard where every request silently fails.
        if (response.status === 401) {
          handleSessionExpired();
          // Don't retry on 401, it's terminal
          const error = await response
            .json()
            .catch(() => ({ message: "An error occurred" }));
          const body = error as {
            message?: string;
            code?: string;
            retry_after?: number;
          };
          return {
            error: new ApiError(
              response.status,
              body.message || "Request failed",
              body.code,
              body.retry_after,
            ),
          };
        }

        // Check if retryable
        if (isRetryableStatus(response.status) && attempt < maxRetries) {
          const error = await response
            .json()
            .catch(() => ({ message: "An error occurred" }));
          const body = error as {
            message?: string;
            code?: string;
            retry_after?: number;
          };

          lastError = new ApiError(
            response.status,
            body.message || "Request failed",
            body.code,
            body.retry_after,
          );

          // Determine wait time: use Retry-After header if provided (for 429s),
          // otherwise use exponential backoff
          let waitMs: number;
          if (response.status === 429 && body.retry_after) {
            // retry_after is in seconds
            waitMs = body.retry_after * 1000;
          } else {
            waitMs = calculateBackoffMs(attempt);
          }

          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue; // Proceed to next retry
        }

        // Non-retryable error
        const error = await response
          .json()
          .catch(() => ({ message: "An error occurred" }));
        const body = error as {
          message?: string;
          code?: string;
          retry_after?: number;
        };
        return {
          error: new ApiError(
            response.status,
            body.message || "Request failed",
            body.code,
            body.retry_after,
          ),
        };
      }

      // Success
      try {
        const data = (await response.json()) as T;
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            "Failed to parse response",
            undefined,
            undefined,
          ),
        };
      }
    } catch (err) {
      // Network error or other fetch-level error — retryable
      if (attempt < maxRetries) {
        lastError = new ApiError(
          0,
          err instanceof Error ? err.message : "Network error",
        );
        const waitMs = calculateBackoffMs(attempt);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      } else {
        // Exhausted retries, return the last error
        return {
          error:
            lastError ||
            new ApiError(
              0,
              err instanceof Error
                ? err.message
                : "Request failed after retries",
            ),
        };
      }
    }
  }

  // This should not be reached, but return last error if it somehow is
  return {
    error:
      lastError ||
      new ApiError(0, "Request failed after exhausting all retries"),
  };
}

/** Build headers including the optional admin secret for internal endpoints. */
function adminHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const secret = process.env.NEXT_PUBLIC_ADMIN_SECRET;
  if (secret) headers["X-Admin-Secret"] = secret;
  return headers;
}

/** Authenticated fetch that builds the full URL */
function adminFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { ...adminHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
}

function refundAdminKeyHeader(): Record<string, string> {
  const header: Record<string, string> = {};
  const adminApiKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY;
  if (adminApiKey) header["X-Admin-API-Key"] = adminApiKey;
  return header;
}

export const api = {
  // Authentication — routes match backend /api/merchants/*
  auth: {
    signup: async (data: AuthSignupRequest): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/merchants/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: "Signup failed" }));
          return {
            error: new ApiError(
              res.status,
              (error as { message?: string }).message || "Signup failed",
            ),
          };
        }
        const jsonData = await res.json();
        return { data: jsonData };
      } catch (err) {
        return {
          error: new ApiError(500, err instanceof Error ? err.message : "Signup failed"),
        };
      }
    },
    login: async (data: AuthLoginRequest): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/merchants/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({ message: "Login failed" }));
          return {
            error: new ApiError(
              res.status,
              (error as { message?: string }).message || "Login failed",
            ),
          };
        }
        const jsonData = await res.json();
        return { data: jsonData };
      } catch (err) {
        return {
          error: new ApiError(500, err instanceof Error ? err.message : "Login failed"),
        };
      }
    },
    verifyOtp: async (data: {
      merchantId: string;
      channel: "email" | "phone";
      otp: string;
    }): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/merchants/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          return {
            error: new ApiError(res.status, "OTP verification failed"),
          };
        }
        const jsonData = await res.json();
        return { data: jsonData };
      } catch (err) {
        return {
          error: new ApiError(500, "OTP verification failed"),
        };
      }
    },
    resendOtp: async (data: {
      merchantId: string;
      channel: "email" | "phone";
    }): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/merchants/resend-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          return {
            error: new ApiError(res.status, "Failed to resend OTP"),
          };
        }
        const jsonData = await res.json();
        return { data: jsonData };
      } catch (err) {
        return {
          error: new ApiError(500, "Failed to resend OTP"),
        };
      }
    },
    forgotPassword: async (data: {
      email: string;
    }): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/merchants/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ message: "Request failed" }));
          return {
            error: new ApiError(
              res.status,
              (err as { message?: string }).message ||
                "Failed to request password reset",
            ),
          };
        }
        const jsonData = await res.json();
        return { data: jsonData };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            "Failed to request password reset",
          ),
        };
      }
    },
    validateResetToken: async (
      token: string,
    ): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/merchants/validate-reset-token?token=${encodeURIComponent(
            token,
          )}`,
        );
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ message: "Invalid or expired token" }));
          return {
            error: new ApiError(
              res.status,
              (err as { message?: string }).message ||
                "Invalid or expired token",
            ),
          };
        }
        const jsonData = await res.json();
        return { data: jsonData };
      } catch (err) {
        return {
          error: new ApiError(500, "Invalid or expired token"),
        };
      }
    },
    resetPassword: async (data: {
      token: string;
      new_password: string;
    }): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/merchants/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ message: "Reset failed" }));
          return {
            error: new ApiError(
              res.status,
              (err as { message?: string }).message ||
                "Failed to reset password",
            ),
          };
        }
        const jsonData = await res.json();
        return { data: jsonData };
      } catch (err) {
        return {
          error: new ApiError(500, "Failed to reset password"),
        };
      }
    },
    logoutAllSessions: () =>
      fetchWithAuth<Record<string, unknown>>("/api/merchants/logout-all", {
        method: "POST",
      }),
  },

  // Merchant endpoints
  merchant: {
    getMe: () =>
      fetchWithAuth<Record<string, unknown>>("/api/merchants/me"),

    updateProfile: (data: {
      business_name?: string;
      email?: string;
      settlement_schedule?: "daily" | "weekly";
      settlement_day?: number;
      checkout_logo_url?: string | null;
      checkout_accent_color?: string | null;
    }) =>
      fetchWithAuth<Record<string, unknown>>("/api/merchants/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    updateWebhook: (webhook_url: string) =>
      fetchWithAuth<Record<string, unknown>>("/api/merchants/me/webhook", {
        method: "PATCH",
        body: JSON.stringify({ webhook_url }),
      }),

    addBankAccount: (data: {
      account_name: string;
      account_number: string;
      bank_name: string;
      bank_code?: string;
      currency: string;
      country: string;
    }) =>
      fetchWithAuth<Record<string, unknown>>("/api/merchants/me/bank-account", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    requestDeletion: () =>
      fetchWithAuth<Record<string, unknown>>(
        "/api/v1/merchants/me/deletion-request",
        {
          method: "POST",
        },
      ),
  },

  merchantExports: {
    request: (data: MerchantExportRequest) =>
      fetchWithAuth<MerchantExportJobStatus>("/api/v1/merchants/export", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    status: (jobId: string) =>
      fetchWithAuth<MerchantExportJobStatus>(
        `/api/v1/merchants/export/${encodeURIComponent(jobId)}`,
      ),
    download: (jobId: string) =>
      fetchWithAuth<Record<string, unknown>>(
        `/api/v1/merchants/export/${encodeURIComponent(jobId)}/download`,
      ),
  },

  // API Keys endpoints
  keys: {
    regenerate: () =>
      fetchWithAuth<Record<string, unknown>>("/api/v1/keys/regenerate", {
        method: "POST",
      }),
    createKey: (data: { name: string }) =>
      fetchWithAuth<Record<string, unknown>>("/api/merchants/keys/create", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    rotateApiKey: () =>
      fetchWithAuth<Record<string, unknown>>(
        "/api/merchants/keys/rotate-api-key",
        {
          method: "POST",
        },
      ),
    rotateWebhookSecret: () =>
      fetchWithAuth<Record<string, unknown>>(
        "/api/merchants/keys/rotate-webhook-secret",
        {
          method: "POST",
        },
      ),
  },

  // Sweep / Settlement Batch endpoints (admin-only)
  sweep: {
    getStatus: async (): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/admin/settlement/status`,
          {
            headers: adminHeaders(),
          },
        );
        if (!res.ok) {
          const error = await res
            .json()
            .catch(() => ({ message: "Failed to fetch sweep status" }));
          return {
            error: new ApiError(
              res.status,
              (error as { message?: string }).message ||
                "Failed to fetch sweep status",
            ),
          };
        }
        const data = await res.json();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Failed to fetch sweep status",
          ),
        };
      }
    },

    /** Manually trigger a full accounts sweep (settlement batch) */
    runSweep: async (dryRun?: boolean): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/admin/sweep/run`, {
          method: "POST",
          headers: adminHeaders(),
          body: JSON.stringify({ dry_run: dryRun || false }),
        });
        if (!res.ok) {
          const error = await res
            .json()
            .catch(() => ({ message: "Failed to run sweep" }));
          return {
            error: new ApiError(
              res.status,
              (error as { message?: string }).message ||
                "Failed to run sweep",
            ),
          };
        }
        const data = await res.json();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Failed to run sweep",
          ),
        };
      }
    },

    /** Preview eligible payments before running a sweep */
    previewSweep: async (): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/admin/sweep/preview`, {
          headers: adminHeaders(),
        });
        if (!res.ok) {
          const error = await res
            .json()
            .catch(() => ({ message: "Failed to preview sweep" }));
          return {
            error: new ApiError(
              res.status,
              (error as { message?: string }).message ||
                "Failed to preview sweep",
            ),
          };
        }
        const data = await res.json();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Failed to preview sweep",
          ),
        };
      }
    },
  },

  // Admin merchant management
  adminMerchants: {
    list: async (params?: {
      page?: number;
      limit?: number;
      status?: string;
    }): Promise<Result<Record<string, unknown>>> => {
      try {
        const qs = new URLSearchParams();
        if (params?.page) qs.set("page", String(params.page));
        if (params?.limit) qs.set("limit", String(params.limit));
        if (params?.status) qs.set("status", params.status);
        const res = await adminFetch(
          `/api/v1/merchants/admin/list?${qs.toString()}`,
        );
        if (!res.ok) {
          const error = await res
            .json()
            .catch(() => ({ message: "Failed to fetch merchants" }));
          return {
            error: new ApiError(
              res.status,
              (error as { message?: string }).message ||
                "Failed to fetch merchants",
            ),
          };
        }
        const data = await res.json();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Failed to fetch merchants",
          ),
        };
      }
    },
    get: async (merchantId: string): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await adminFetch(
          `/api/v1/merchants/admin/${merchantId}`,
        );
        if (!res.ok) {
          const error = await res
            .json()
            .catch(() => ({ message: "Failed to fetch merchant" }));
          return {
            error: new ApiError(
              res.status,
              (error as { message?: string }).message ||
                "Failed to fetch merchant",
            ),
          };
        }
        const data = await res.json();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Failed to fetch merchant",
          ),
        };
      }
    },
    updateStatus: async (
      merchantId: string,
      status: string,
    ): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await adminFetch(
          `/api/v1/merchants/admin/${merchantId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          },
        );
        if (!res.ok) {
          const error = await res
            .json()
            .catch(() => ({ message: "Failed to update merchant status" }));
          return {
            error: new ApiError(
              res.status,
              (error as { message?: string }).message ||
                "Failed to update merchant status",
            ),
          };
        }
        const data = await res.json();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Failed to update merchant status",
          ),
        };
      }
    },
  },

  // Admin KYC management
  adminKyc: {
    list: (params?: { status?: string; page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      return fetchWithAuth<Record<string, unknown>>(
        `/api/v1/merchants/kyc/admin/submissions?${qs.toString()}`,
      );
    },
    getByMerchant: (merchantId: string) =>
      fetchWithAuth<Record<string, unknown>>(
        `/api/v1/merchants/kyc/admin/${merchantId}`,
      ),
    updateStatus: (
      merchantId: string,
      body: { kyc_status: string; rejection_reason?: string },
    ) =>
      fetchWithAuth<Record<string, unknown>>(
        `/api/v1/merchants/kyc/admin/${merchantId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      ),
  },

  // Health / readiness
  health: {
    check: async (): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (!res.ok) {
          return {
            error: new ApiError(res.status, "Health check failed"),
          };
        }
        const data = await res.json();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Health check failed",
          ),
        };
      }
    },
    ready: async (): Promise<Result<Record<string, unknown>>> => {
      try {
        const res = await fetch(`${API_BASE_URL}/ready`);
        if (!res.ok) {
          return {
            error: new ApiError(res.status, "Readiness check failed"),
          };
        }
        const data = await res.json();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Readiness check failed",
          ),
        };
      }
    },
  },

  // Settlements (merchant-scoped)
  settlements: {
    list: (params?: {
      page?: number;
      limit?: number;
      status?: string;
      currency?: string;
      date_from?: string;
      date_to?: string;
    }) => {
      const sp = new URLSearchParams();
      if (params?.page != null) sp.set("page", String(params.page));
      if (params?.limit != null) sp.set("limit", String(params.limit));
      if (params?.status) sp.set("status", params.status);
      if (params?.currency) sp.set("currency", params.currency);
      if (params?.date_from) sp.set("date_from", params.date_from);
      if (params?.date_to) sp.set("date_to", params.date_to);
      return fetchWithAuth<Record<string, unknown>>(
        `/api/v1/settlements?${sp.toString()}`,
      );
    },
    summary: () =>
      fetchWithAuth<Record<string, unknown>>("/api/v1/settlements/summary"),
    getById: (id: string) =>
      fetchWithAuth<Record<string, unknown>>(`/api/v1/settlements/${id}`),
    export: (settlementId: string, format: "pdf" | "csv" = "pdf") =>
      fetchWithAuth<Record<string, unknown>>(
        `/api/v1/settlements/${settlementId}/export?format=${format}`,
      ),
    exportRange: async (params: {
      date_from?: string;
      date_to?: string;
      currency?: string;
      asset?: string;
      min_discrepancy?: number;
      format?: "pdf" | "csv";
    }): Promise<Result<Blob | Record<string, unknown>>> => {
      try {
        const sp = new URLSearchParams();
        if (params.date_from) sp.set("date_from", params.date_from);
        if (params.date_to) sp.set("date_to", params.date_to);
        if (params.currency) sp.set("currency", params.currency);
        if (params.asset) sp.set("asset", params.asset);
        if (params.min_discrepancy != null)
          sp.set("min_discrepancy", String(params.min_discrepancy));
        sp.set("format", params.format || "csv");
        const response = await fetch(
          `${API_BASE_URL}/api/v1/settlements/export?${sp.toString()}`,
          { headers: { Authorization: `Bearer ${getToken()}` } },
        );
        if (!response.ok) {
          return {
            error: new ApiError(
              response.status,
              `Failed to export settlements: ${response.statusText}`,
            ),
          };
        }
        if (params.format === "pdf") {
          const data = await response.json();
          return { data };
        }
        const data = await response.blob();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Failed to export settlements",
          ),
        };
      }
    },
  },

  /** Reconciliation (JWT; backend mounts under /api/v1/admin/reconciliation) */
  reconciliation: {
    summary: (params: {
      merchant_id?: string;
      period_start: string;
      period_end: string;
    }) => {
      const sp = new URLSearchParams();
      sp.set("period_start", params.period_start);
      sp.set("period_end", params.period_end);
      if (params.merchant_id) sp.set("merchant_id", params.merchant_id);
      return fetchWithAuth<Record<string, unknown>>(
        `/api/v1/admin/reconciliation/summary?${sp.toString()}`,
      );
    },
    listAlerts: (params?: {
      merchant_id?: string;
      is_resolved?: boolean;
      page?: number;
      limit?: number;
    }) => {
      const sp = new URLSearchParams();
      if (params?.merchant_id) sp.set("merchant_id", params.merchant_id);
      if (params?.is_resolved !== undefined) {
        sp.set("is_resolved", String(params.is_resolved));
      }
      if (params?.page != null) sp.set("page", String(params.page));
      if (params?.limit != null) sp.set("limit", String(params.limit));
      return fetchWithAuth<Record<string, unknown>>(
        `/api/v1/admin/reconciliation/alerts?${sp.toString()}`,
      );
    },
    resolveAlert: (alertId: string, is_resolved: boolean) =>
      fetchWithAuth<Record<string, unknown>>(
        `/api/v1/admin/reconciliation/alerts/${encodeURIComponent(
          alertId,
        )}/resolve`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_resolved }),
        },
      ),
  },

  // KYC admin
  kyc: {
    admin: {
      getSubmissions: (params?: {
        status?: string;
        page?: number;
        limit?: number;
      }) => {
        const sp = new URLSearchParams();
        if (params?.status) sp.set("status", params.status);
        if (params?.page != null) sp.set("page", String(params.page));
        if (params?.limit != null) sp.set("limit", String(params.limit));
        return fetchWithAuth<Record<string, unknown>>(
          `/api/merchants/kyc/admin/submissions?${sp.toString()}`,
        );
      },
      getByMerchantId: (merchantId: string) =>
        fetchWithAuth<Record<string, unknown>>(
          `/api/merchants/kyc/admin/${merchantId}`,
        ),
      updateStatus: (
        merchantId: string,
        body: { status: string; rejection_reason?: string },
      ) =>
        fetchWithAuth<Record<string, unknown>>(
          `/api/merchants/kyc/admin/${merchantId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
        ),
      bulkReject: (merchantIds: string[], reason: string, notes?: string) =>
        fetchWithAuth<Record<string, unknown>>(
          "/api/merchants/kyc/admin/bulk-reject",
          {
            method: "POST",
            body: JSON.stringify({ merchantIds, reason, notes }),
          },
        ),
      bulkRequestInfo: (merchantIds: string[], message: string) =>
        fetchWithAuth<Record<string, unknown>>(
          "/api/merchants/kyc/admin/bulk-request-info",
          {
            method: "POST",
            body: JSON.stringify({ merchantIds, message }),
          },
        ),
    },
  },

  // Refunds
  refunds: {
    initiate: (data: InitiateRefundRequest) =>
      fetchWithAuth<Record<string, unknown>>("/api/refunds", {
        method: "POST",
        headers: refundAdminKeyHeader(),
        body: JSON.stringify(data),
      }),
    list: (params?: ListRefundsParams) => {
      const sp = new URLSearchParams();
      if (params?.paymentId) sp.set("paymentId", params.paymentId);
      if (params?.merchantId) sp.set("merchantId", params.merchantId);
      if (params?.status) sp.set("status", params.status);
      if (params?.page != null) sp.set("page", String(params.page));
      if (params?.limit != null) sp.set("limit", String(params.limit));
      const query = sp.toString();
      return fetchWithAuth<Record<string, unknown>>(
        `/api/refunds${query ? `?${query}` : ""}`,
        {
          headers: refundAdminKeyHeader(),
        },
      );
    },
    getById: (refundId: string) =>
      fetchWithAuth<Record<string, unknown>>(`/api/refunds/${refundId}`, {
        headers: refundAdminKeyHeader(),
      }),
  },

  // Payments (merchant-scoped) — backend mounts at /api/v1/payments
  payments: {
    create: (data: {
      amount: number;
      currency: string;
      customer_email: string;
      order_id?: string;
      description?: string;
      success_url?: string;
      cancel_url?: string;
    }) =>
      fetchWithAuth<Record<string, unknown>>("/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    list: (
      params?: {
        page?: number;
        limit?: number;
        status?: string;
        currency?: string;
        search?: string;
        date_from?: string;
        date_to?: string;
      },
      init?: RequestInit,
    ) => {
      const sp = new URLSearchParams();
      if (params?.page != null) sp.set("page", String(params.page));
      if (params?.limit != null) sp.set("limit", String(params.limit));
      if (params?.status && params.status !== "all")
        sp.set("status", params.status);
      if (params?.currency && params.currency !== "all")
        sp.set("currency", params.currency);
      if (params?.search) sp.set("search", params.search);
      if (params?.date_from) sp.set("date_from", params.date_from);
      if (params?.date_to) sp.set("date_to", params.date_to);
      return fetchWithAuth<Record<string, unknown>>(
        `/api/v1/payments?${sp.toString()}`,
        init,
      );
    },

    getById: (paymentId: string) =>
      fetchWithAuth<Record<string, unknown>>(
        `/api/v1/payments/${encodeURIComponent(paymentId)}`,
      ),

    export: async (params?: {
      status?: string;
      currency?: string;
      search?: string;
      date_from?: string;
      date_to?: string;
    }): Promise<Result<Blob>> => {
      try {
        const sp = new URLSearchParams();
        if (params?.status && params.status !== "all")
          sp.set("status", params.status);
        if (params?.currency && params.currency !== "all")
          sp.set("currency", params.currency);
        if (params?.search) sp.set("search", params.search);
        if (params?.date_from) sp.set("date_from", params.date_from);
        if (params?.date_to) sp.set("date_to", params.date_to);
        const response = await fetch(
          `${API_BASE_URL}/api/v1/payments/export?${sp.toString()}`,
          { headers: { Authorization: `Bearer ${getToken()}` } },
        );
        if (!response.ok)
          return { error: new ApiError(response.status, "Export failed") };
        const data = await response.blob();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Export failed",
          ),
        };
      }
    },
  },

  // Invoices (merchant-scoped)
  invoices: {
    create: (data: {
      customer_name: string;
      customer_email: string;
      line_items: Array<{
        description: string;
        quantity: number;
        unit_price: number;
      }>;
      total_amount?: number;
      currency: string;
      due_date: string;
      notes?: string;
    }) =>
      fetchWithAuth<Record<string, unknown>>("/api/v1/invoices", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          amount: data.total_amount,
        }),
      }),

    list: async (params?: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    }): Promise<Result<Record<string, unknown>>> => {
      try {
        const sp = new URLSearchParams();
        if (params?.page != null) sp.set("page", String(params.page));
        if (params?.limit != null) sp.set("limit", String(params.limit));
        if (params?.status && params.status !== "all")
          sp.set("status", params.status);
        if (params?.search?.trim()) sp.set("search", params.search.trim());
        const result = await fetchWithAuth<{
          data?: { invoices?: unknown[] };
          meta?: {
            page: number;
            limit: number;
            total: number;
            total_pages?: number;
          };
        }>(`/api/v1/invoices?${sp.toString()}`);
        if ("error" in result) return result;
        const raw = result.data;
        return {
          data: {
            invoices: raw.data?.invoices ?? [],
            meta: raw.meta ?? {
              page: params?.page ?? 1,
              limit: params?.limit ?? 10,
              total: 0,
            },
          },
        };
      } catch (err) {
        return {
          error: new ApiError(500, "Failed to fetch invoices"),
        };
      }
    },

    getById: async (invoiceId: string): Promise<Result<Record<string, unknown>>> => {
      try {
        const result = await fetchWithAuth<Record<string, unknown>>(
          `/api/v1/invoices/${invoiceId}`,
        );
        if ("error" in result) return result;
        const inv = result.data;
        return {
          data: {
            ...inv,
            total_amount: Number((inv as Record<string, unknown>).amount),
            customer_name:
              (inv as Record<string, unknown>).metadata &&
              typeof (inv as Record<string, unknown>).metadata === 'object'
                ? ((inv as Record<string, unknown>).metadata as Record<string, unknown>)
                    .customer_name
                : undefined,
            line_items:
              (inv as Record<string, unknown>).metadata &&
              typeof (inv as Record<string, unknown>).metadata === 'object'
                ? ((inv as Record<string, unknown>).metadata as Record<string, unknown>)
                    .line_items || []
                : [],
            notes:
              (inv as Record<string, unknown>).metadata &&
              typeof (inv as Record<string, unknown>).metadata === 'object'
                ? ((inv as Record<string, unknown>).metadata as Record<string, unknown>)
                    .notes
                : undefined,
          },
        };
      } catch (err) {
        return {
          error: new ApiError(500, "Failed to fetch invoice"),
        };
      }
    },

    updateStatus: (invoiceId: string, status: string) =>
      fetchWithAuth<Record<string, unknown>>(
        `/api/v1/invoices/${invoiceId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      ),

    export: async (invoiceId: string): Promise<Result<Blob>> => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/invoices/${invoiceId}/export?format=pdf`,
          { headers: { Authorization: `Bearer ${getToken()}` } },
        );
        if (!response.ok)
          return { error: new ApiError(response.status, "Export failed") };
        const body = (await response.json()) as Record<string, unknown>;
        if (body.status === "accepted" && body.jobId) {
          const { jobId } = body;
          const pollUrl = `${API_BASE_URL}/api/v1/invoices/${invoiceId}/export/${jobId}/status`;
          for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            const pollRes = await fetch(pollUrl, {
              headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (!pollRes.ok)
              return {
                error: new ApiError(pollRes.status, "Export polling failed"),
              };
            const pollBody = (await pollRes.json()) as Record<string, unknown>;
            if (pollBody.status === "completed" && pollBody.downloadUrl) {
              const dlRes = await fetch(
                `${API_BASE_URL}${pollBody.downloadUrl as string}`,
                { headers: { Authorization: `Bearer ${getToken()}` } },
              );
              if (!dlRes.ok)
                return { error: new ApiError(dlRes.status, "Download failed") };
              const data = await dlRes.blob();
              return { data };
            }
            if (pollBody.status === "failed") {
              return {
                error: new ApiError(
                  500,
                  (pollBody.error as string) || "PDF generation failed",
                ),
              };
            }
          }
          return {
            error: new ApiError(408, "PDF generation timed out"),
          };
        }
        return {
          error: new ApiError(500, "Unexpected export response"),
        };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Export failed",
          ),
        };
      }
    },
  },

  // Webhooks (merchant-scoped webhook delivery logs)
  webhooks: {
    logs: (params?: {
      event_type?: string;
      status?: string;
      date_from?: string;
      date_to?: string;
      search?: string;
      page?: number;
      limit?: number;
    }) => {
      const sp = new URLSearchParams();
      if (params?.event_type && params.event_type !== "all")
        sp.set("event_type", params.event_type);
      if (params?.status && params.status !== "all")
        sp.set("status", params.status);
      if (params?.date_from) sp.set("date_from", params.date_from);
      if (params?.date_to) sp.set("date_to", params.date_to);
      if (params?.search) sp.set("search", params.search);
      if (params?.page != null) sp.set("page", String(params.page));
      if (params?.limit != null) sp.set("limit", String(params.limit));
      return fetchWithAuth<Record<string, unknown>>(
        `/api/v1/webhooks/logs?${sp.toString()}`,
      );
    },
    logDetails: (logId: string) =>
      fetchWithAuth<Record<string, unknown>>(`/api/v1/webhooks/logs/${logId}`),
    export: async (params?: {
      event_type?: string;
      status?: string;
      date_from?: string;
      date_to?: string;
      search?: string;
    }): Promise<Result<Blob>> => {
      try {
        const sp = new URLSearchParams();
        if (params?.event_type && params.event_type !== "all")
          sp.set("event_type", params.event_type);
        if (params?.status && params.status !== "all")
          sp.set("status", params.status);
        if (params?.date_from) sp.set("date_from", params.date_from);
        if (params?.date_to) sp.set("date_to", params.date_to);
        if (params?.search) sp.set("search", params.search);
        const response = await fetch(
          `${API_BASE_URL}/api/v1/webhooks/logs/export?${sp.toString()}`,
          { headers: { Authorization: `Bearer ${getToken()}` } },
        );
        if (!response.ok)
          return {
            error: new ApiError(
              response.status,
              "Failed to export webhook logs",
            ),
          };
        const data = await response.blob();
        return { data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Failed to export webhook logs",
          ),
        };
      }
    },
    retry: (logId: string) =>
      fetchWithAuth<Record<string, unknown>>(
        `/api/v1/webhooks/logs/${logId}/retry`,
        { method: "POST" },
      ),
    sendTest: (data: {
      event_type: string;
      endpoint_url: string;
      payload_override?: Record<string, unknown>;
    }) =>
      fetchWithAuth<Record<string, unknown>>("/api/v1/webhooks/test", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  // Dashboard overview
  dashboard: {
    overviewMetrics: (params?: { from?: string; to?: string }) => {
      const sp = new URLSearchParams();
      if (params?.from) sp.set("from", params.from);
      if (params?.to) sp.set("to", params.to);
      const q = sp.toString();
      return fetchWithAuth<Record<string, unknown>>(
        `/api/v1/dashboard/overview/metrics${q ? `?${q}` : ""}`,
      );
    },
    charts: (params?: { from?: string; to?: string }) => {
      const sp = new URLSearchParams();
      if (params?.from) sp.set("from", params.from);
      if (params?.to) sp.set("to", params.to);
      const q = sp.toString();
      return fetchWithAuth<Record<string, unknown>>(
        `/api/v1/dashboard/overview/charts${q ? `?${q}` : ""}`,
      );
    },
    activity: (params?: { from?: string; to?: string }) => {
      const sp = new URLSearchParams();
      if (params?.from) sp.set("from", params.from);
      if (params?.to) sp.set("to", params.to);
      const q = sp.toString();
      return fetchWithAuth<Record<string, unknown>>(
        `/api/v1/dashboard/overview/activity${q ? `?${q}` : ""}`,
      );
    },
  },

  // FX Rates — public, no auth required
  fx: {
    /**
     * Fetch the live USDC exchange rate for a given fiat currency.
     * Returns { data: rate } on success, { error: ApiError } on failure.
     *
     * Example: getRate("USD") → { data: { base_currency: "USD", target_currency: "USDC", rate: 1.0002 } }
     */
    getRate: async (
      currency: string,
    ): Promise<
      Result<{ base_currency: string; target_currency: string; rate: number }>
    > => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/fx-rates?currency=${encodeURIComponent(
            currency.toUpperCase(),
          )}`,
          { headers: { "Content-Type": "application/json" } },
        );
        if (!res.ok) {
          return {
            error: new ApiError(res.status, "Failed to fetch exchange rate"),
          };
        }
        const json = (await res.json()) as {
          data?: { base_currency: string; target_currency: string; rate: number };
        };
        if (!json.data) {
          return {
            error: new ApiError(500, "No exchange rate data in response"),
          };
        }
        return { data: json.data };
      } catch (err) {
        return {
          error: new ApiError(
            500,
            err instanceof Error ? err.message : "Failed to fetch exchange rate",
          ),
        };
      }
    },
  },

  // Admin: merchants & settlements
  admin: {
    merchants: {
      list: (params?: {
        page?: number;
        limit?: number;
        kycStatus?: string;
        accountStatus?: string;
      }) => {
        const sp = new URLSearchParams();
        if (params?.page != null) sp.set("page", String(params.page));
        if (params?.limit != null) sp.set("limit", String(params.limit));
        if (params?.kycStatus) sp.set("kycStatus", params.kycStatus);
        if (params?.accountStatus)
          sp.set("accountStatus", params.accountStatus);
        return fetchWithAuth<Record<string, unknown>>(
          `/api/v1/admin/merchants?${sp.toString()}`,
        );
      },
      updateStatus: (
        merchantId: string,
        status: "active" | "suspended",
      ) =>
        fetchWithAuth<Record<string, unknown>>(
          `/api/v1/admin/merchants/${merchantId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({ status }),
          },
        ),
      bulkUpdateStatus: (
        merchantIds: string[],
        status: "active" | "suspended",
        reason: string,
      ) =>
        fetchWithAuth<Record<string, unknown>>(
          "/api/merchants/admin/bulk-status",
          {
            method: "POST",
            body: JSON.stringify({ merchantIds, status, reason }),
          },
        ),
      disableWebhook: async (
        merchantId: string,
      ): Promise<Result<Record<string, unknown>>> => {
        try {
          const res = await adminFetch(
            `/api/v1/merchants/admin/${merchantId}/webhook`,
            {
              method: "PATCH",
              body: JSON.stringify({ webhook_url: "" }),
            },
          );
          if (!res.ok) {
            return {
              error: new ApiError(res.status, "Failed to disable webhook"),
            };
          }
          const data = await res.json();
          return { data };
        } catch (err) {
          return {
            error: new ApiError(
              500,
              err instanceof Error
                ? err.message
                : "Failed to disable webhook",
            ),
          };
        }
      },
    },
    settlements: {
      list: (params?: {
        page?: number;
        limit?: number;
        status?: string;
      }) => {
        const sp = new URLSearchParams();
        if (params?.page != null) sp.set("page", String(params.page));
        if (params?.limit != null) sp.set("limit", String(params.limit));
        if (params?.status) sp.set("status", params.status);
        return fetchWithAuth<Record<string, unknown>>(
          `/api/v1/admin/settlements?${sp.toString()}`,
        );
      },
    },
    auditLogs: {
      list: (params?: {
        page?: number;
        limit?: number;
        admin_id?: string;
        action_type?: string;
        date_from?: string;
        date_to?: string;
      }) => {
        const sp = new URLSearchParams();
        if (params?.page != null) sp.set("page", String(params.page));
        if (params?.limit != null) sp.set("limit", String(params.limit));
        if (params?.admin_id) sp.set("admin_id", params.admin_id);
        if (params?.action_type && params.action_type !== "all")
          sp.set("action_type", params.action_type);
        if (params?.date_from) sp.set("date_from", params.date_from);
        if (params?.date_to) sp.set("date_to", params.date_to);
        return fetchWithAuth<Record<string, unknown>>(
          `/api/v1/admin/audit-logs?${sp.toString()}`,
        );
      },
      getById: (id: string) =>
        fetchWithAuth<Record<string, unknown>>(`/api/v1/admin/audit-logs/${id}`),
    },
    payments: {
      list: (params?: {
        page?: number;
        limit?: number;
        status?: string;
        currency?: string;
        search?: string;
        date_from?: string;
        date_to?: string;
      }) => {
        const sp = new URLSearchParams();
        if (params?.page != null) sp.set("page", String(params.page));
        if (params?.limit != null) sp.set("limit", String(params.limit));
        if (params?.status && params.status !== "all")
          sp.set("status", params.status);
        if (params?.currency) sp.set("currency", params.currency);
        if (params?.search?.trim()) sp.set("search", params.search.trim());
        if (params?.date_from) sp.set("date_from", params.date_from);
        if (params?.date_to) sp.set("date_to", params.date_to);
        return fetchWithAuth<Record<string, unknown>>(
          `/api/v1/admin/payments?${sp.toString()}`,
        );
      },
      verify: (paymentId: string) =>
        fetchWithAuth<Record<string, unknown>>(
          `/api/v1/admin/payments/${encodeURIComponent(
            paymentId,
          )}/verify`,
          {
            method: "POST",
          },
        ),
    },
    addressPool: {
      stats: () =>
        fetchWithAuth<Record<string, unknown>>(
          "/api/v1/admin/address-pool/stats",
        ),
    },
    webhooks: {
      logs: async (params?: {
        merchant_id?: string;
        event_type?: string;
        status?: string;
        date_from?: string;
        date_to?: string;
        search?: string;
        page?: number;
        limit?: number;
      }): Promise<Result<Record<string, unknown>>> => {
        try {
          const sp = new URLSearchParams();
          if (params?.merchant_id) sp.set("merchant_id", params.merchant_id);
          if (params?.event_type && params.event_type !== "all")
            sp.set("event_type", params.event_type);
          if (params?.status && params.status !== "all")
            sp.set("status", params.status);
          if (params?.date_from) sp.set("date_from", params.date_from);
          if (params?.date_to) sp.set("date_to", params.date_to);
          if (params?.search) sp.set("search", params.search);
          if (params?.page != null) sp.set("page", String(params.page));
          if (params?.limit != null) sp.set("limit", String(params.limit));
          const res = await adminFetch(
            `/api/v1/webhooks/admin/logs?${sp.toString()}`,
          );
          if (!res.ok) {
            return {
              error: new ApiError(
                res.status,
                "Failed to fetch admin webhook logs",
              ),
            };
          }
          const data = await res.json();
          return { data };
        } catch (err) {
          return {
            error: new ApiError(
              500,
              err instanceof Error
                ? err.message
                : "Failed to fetch admin webhook logs",
            ),
          };
        }
      },
      retry: async (logId: string): Promise<Result<Record<string, unknown>>> => {
        try {
          const res = await adminFetch(
            `/api/v1/webhooks/admin/logs/${logId}/retry`,
            { method: "POST" },
          );
          if (!res.ok) {
            return {
              error: new ApiError(res.status, "Failed to retry webhook"),
            };
          }
          const data = await res.json();
          return { data };
        } catch (err) {
          return {
            error: new ApiError(
              500,
              err instanceof Error ? err.message : "Failed to retry webhook",
            ),
          };
        }
      },
    },
  },
};

// Public pricing config endpoint (no auth required)
export const fetchPricingConfig = async (): Promise<
  Result<Record<string, unknown>>
> => {
  try {
    const res = await fetch(
      `${
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
      }/api/v1/public/pricing-config`,
      {
        headers: { "Content-Type": "application/json" },
      },
    );
    if (!res.ok) {
      return {
        error: new ApiError(res.status, "Failed to fetch pricing config"),
      };
    }
    const data = await res.json();
    return { data };
  } catch (err) {
    return {
      error: new ApiError(
        500,
        err instanceof Error ? err.message : "Failed to fetch pricing config",
      ),
    };
  }
};

export { ApiError };
