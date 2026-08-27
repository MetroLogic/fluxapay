import { handleSessionExpired } from "./session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  // We use getToken() to automatically handle missing token redirects
  let token;
  try {
    token = getToken();
  } catch (err) {
    // getToken handles the redirect, we just need to propagate the error
    throw err;
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
    }
    const error = await response
      .json()
      .catch(() => ({ message: "An error occurred" }));
    const body = error as { message?: string; code?: string; retry_after?: number };
    throw new ApiError(
      response.status,
      body.message || "Request failed",
      body.code,
      body.retry_after,
    );
  }

  return response.json();
}


export const api = {
  // Authentication — routes match backend /api/merchants/*
  auth: {
    signup: (data: AuthSignupRequest) =>
      fetch(`${API_BASE_URL}/api/merchants/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((res) => {
        if (!res.ok) throw new ApiError(res.status, "Signup failed");
        return res.json();
      }),
    login: (data: AuthLoginRequest) =>
      fetch(`${API_BASE_URL}/api/merchants/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res
            .json()
            .catch(() => ({ message: "Login failed" }));
          throw new ApiError(
            res.status,
            (error as { message?: string }).message || "Login failed",
          );
        }
        return res.json();
      }),
    verifyOtp: (data: { merchantId: string; channel: "email" | "phone"; otp: string }) =>
      fetch(`${API_BASE_URL}/api/merchants/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((res) => {
        if (!res.ok) throw new ApiError(res.status, "OTP verification failed");
        return res.json();
      }),
    resendOtp: (data: { merchantId: string; channel: "email" | "phone" }) =>
      fetch(`${API_BASE_URL}/api/merchants/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((res) => {
        if (!res.ok) throw new ApiError(res.status, "Failed to resend OTP");
        return res.json();
      }),
    forgotPassword: (data: { email: string }) =>
      fetch(`${API_BASE_URL}/api/merchants/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (res) => {
        if (!res.ok) {
           const err = await res.json().catch(() => ({ message: "Request failed" }));
           throw new ApiError(res.status, err.message || "Failed to request password reset");
        }
        return res.json();
      }),
    validateResetToken: (token: string) =>
      fetch(`${API_BASE_URL}/api/merchants/validate-reset-token?token=${encodeURIComponent(token)}`).then(async (res) => {
        if (!res.ok) {
           const err = await res.json().catch(() => ({ message: "Invalid or expired token" }));
           throw new ApiError(res.status, err.message || "Invalid or expired token");
        }
        return res.json();
      }),
    resetPassword: (data: { token: string; new_password: string }) =>
      fetch(`${API_BASE_URL}/api/merchants/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (res) => {
        if (!res.ok) {
           const err = await res.json().catch(() => ({ message: "Reset failed" }));
           throw new ApiError(res.status, err.message || "Failed to reset password");
        }
        return res.json();
      }),
    logoutAllSessions: () =>
      fetchWithAuth("/api/merchants/logout-all", {
        method: "POST",
      }),
  },

  // Merchant endpoints
  merchant: {
    getMe: () => fetchWithAuth("/api/merchants/me"),

    updateProfile: (data: {
      business_name?: string;
      email?: string;
      settlement_schedule?: "daily" | "weekly";
      settlement_day?: number;
      checkout_logo_url?: string | null;
      checkout_accent_color?: string | null;
    }) =>
      fetchWithAuth("/api/merchants/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    updateWebhook: (webhook_url: string) =>
      fetchWithAuth("/api/merchants/me/webhook", {
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
      fetchWithAuth("/api/merchants/me/bank-account", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    requestDeletion: () =>
      fetchWithAuth("/api/v1/merchants/me/deletion-request", {
        method: "POST",
      }),
  },

  merchantExports: {
    request: (data: MerchantExportRequest): Promise<MerchantExportJobStatus> =>
      fetchWithAuth("/api/v1/merchants/export", {
        method: "POST",
        body: JSON.stringify(data),
      }) as Promise<MerchantExportJobStatus>,
    status: (jobId: string): Promise<MerchantExportJobStatus> =>
      fetchWithAuth(`/api/v1/merchants/export/${encodeURIComponent(jobId)}`) as Promise<MerchantExportJobStatus>,
    download: (jobId: string): Promise<Record<string, unknown>> =>
      fetchWithAuth(`/api/v1/merchants/export/${encodeURIComponent(jobId)}/download`) as Promise<Record<string, unknown>>,
  },

  // API Keys endpoints
  keys: {
    regenerate: () =>
      fetchWithAuth("/api/v1/keys/regenerate", {
        method: "POST",
      }),
    createKey: (data: { name: string }) =>
      fetchWithAuth("/api/merchants/keys/create", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    rotateApiKey: () =>
      fetchWithAuth("/api/merchants/keys/rotate-api-key", {
        method: "POST",
      }),
    rotateWebhookSecret: () =>
      fetchWithAuth("/api/merchants/keys/rotate-webhook-secret", {
        method: "POST",
      }),
  },

  // Sweep / Settlement Batch endpoints (admin-only, JWT authenticated server-side routes)
  sweep: {
    getStatus: () =>
      fetchWithAuth("/api/admin/sweep/status"),

    /** Manually trigger a full accounts sweep (settlement batch) */
    runSweep: (dryRun?: boolean) =>
      fetchWithAuth("/api/admin/sweep/run", {
        method: "POST",
        body: JSON.stringify({ dry_run: dryRun || false }),
      }),

    /** Preview eligible payments before running a sweep */
    previewSweep: () =>
      fetchWithAuth("/api/admin/sweep/preview"),
  },


  // Admin KYC management
  adminKyc: {
    list: (params?: { status?: string; page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      return fetchWithAuth(`/api/v1/merchants/kyc/admin/submissions?${qs.toString()}`);
    },
    getByMerchant: (merchantId: string) =>
      fetchWithAuth(`/api/v1/merchants/kyc/admin/${merchantId}`),
    updateStatus: (
      merchantId: string,
      body: { kyc_status: string; rejection_reason?: string },
    ) =>
      fetchWithAuth(`/api/v1/merchants/kyc/admin/${merchantId}/status`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },

  // Health / readiness
  health: {
    check: () => fetch(`${API_BASE_URL}/health`),
    ready: () => fetch(`${API_BASE_URL}/ready`),
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
      return fetchWithAuth(`/api/v1/settlements?${sp.toString()}`);
    },
    summary: () => fetchWithAuth("/api/v1/settlements/summary"),
    getById: (id: string) => fetchWithAuth(`/api/v1/settlements/${id}`),
    export: (settlementId: string, format: "pdf" | "csv" = "pdf") =>
      fetchWithAuth(`/api/v1/settlements/${settlementId}/export?format=${format}`),
    exportRange: async (params: {
      date_from?: string;
      date_to?: string;
      currency?: string;
      asset?: string;
      min_discrepancy?: number;
      format?: "pdf" | "csv";
    }): Promise<Blob | Record<string, unknown>> => {
      const sp = new URLSearchParams();
      if (params.date_from) sp.set("date_from", params.date_from);
      if (params.date_to) sp.set("date_to", params.date_to);
      if (params.currency) sp.set("currency", params.currency);
      if (params.asset) sp.set("asset", params.asset);
      if (params.min_discrepancy != null) sp.set("min_discrepancy", String(params.min_discrepancy));
      sp.set("format", params.format || "csv");
      const response = await fetch(
        `${API_BASE_URL}/api/v1/settlements/export?${sp.toString()}`,
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!response.ok) {
        throw new ApiError(response.status, `Failed to export settlements: ${response.statusText}`);
      }
      if (params.format === "pdf") {
        return response.json();
      }
      return response.blob();
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
      return fetchWithAuth(
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
      return fetchWithAuth(
        `/api/v1/admin/reconciliation/alerts?${sp.toString()}`,
      );
    },
    resolveAlert: (alertId: string, is_resolved: boolean) =>
      fetchWithAuth(
        `/api/v1/admin/reconciliation/alerts/${encodeURIComponent(alertId)}/resolve`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_resolved }),
        },
      ),
  },

  // KYC admin
  kyc: {
    admin: {
      getSubmissions: (params?: { status?: string; page?: number; limit?: number }) => {
        const sp = new URLSearchParams();
        if (params?.status) sp.set("status", params.status);
        if (params?.page != null) sp.set("page", String(params.page));
        if (params?.limit != null) sp.set("limit", String(params.limit));
        return fetchWithAuth(`/api/merchants/kyc/admin/submissions?${sp.toString()}`);
      },
      getByMerchantId: (merchantId: string) =>
        fetchWithAuth(`/api/merchants/kyc/admin/${merchantId}`),
      updateStatus: (
        merchantId: string,
        body: { status: string; rejection_reason?: string },
      ) =>
        fetchWithAuth(`/api/merchants/kyc/admin/${merchantId}/status`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      bulkReject: (merchantIds: string[], reason: string, notes?: string) =>
        fetchWithAuth("/api/merchants/kyc/admin/bulk-reject", {
          method: "POST",
          body: JSON.stringify({ merchantIds, reason, notes }),
        }),
      bulkRequestInfo: (merchantIds: string[], message: string) =>
        fetchWithAuth("/api/merchants/kyc/admin/bulk-request-info", {
          method: "POST",
          body: JSON.stringify({ merchantIds, message }),
        }),
    },
  },

  // Refunds (server-side routes with admin secret)
  refunds: {
    initiate: (data: InitiateRefundRequest) =>
      fetchWithAuth("/api/admin/refunds/initiate", {
        method: "POST",
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
      return fetchWithAuth(`/api/admin/refunds/list${query ? `?${query}` : ""}`);
    },
    getById: (refundId: string) =>
      fetchWithAuth(`/api/admin/refunds/${encodeURIComponent(refundId)}`),
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
      fetchWithAuth("/api/v1/payments", { method: "POST", body: JSON.stringify(data) }),

    list: (params?: {
      page?: number;
      limit?: number;
      status?: string;
      currency?: string;
      search?: string;
      date_from?: string;
      date_to?: string;
    }, init?: RequestInit) => {
      const sp = new URLSearchParams();
      if (params?.page != null) sp.set("page", String(params.page));
      if (params?.limit != null) sp.set("limit", String(params.limit));
      if (params?.status && params.status !== "all") sp.set("status", params.status);
      if (params?.currency && params.currency !== "all") sp.set("currency", params.currency);
      if (params?.search) sp.set("search", params.search);
      if (params?.date_from) sp.set("date_from", params.date_from);
      if (params?.date_to) sp.set("date_to", params.date_to);
      return fetchWithAuth(`/api/v1/payments?${sp.toString()}`, init);
    },

    getById: (paymentId: string) =>
      fetchWithAuth(`/api/v1/payments/${encodeURIComponent(paymentId)}`),

    export: async (params?: {
      status?: string;
      currency?: string;
      search?: string;
      date_from?: string;
      date_to?: string;
    }): Promise<Blob> => {
      const sp = new URLSearchParams();
      if (params?.status && params.status !== "all") sp.set("status", params.status);
      if (params?.currency && params.currency !== "all") sp.set("currency", params.currency);
      if (params?.search) sp.set("search", params.search);
      if (params?.date_from) sp.set("date_from", params.date_from);
      if (params?.date_to) sp.set("date_to", params.date_to);
      const response = await fetch(
        `${API_BASE_URL}/api/v1/payments/export?${sp.toString()}`,
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!response.ok) throw new ApiError(response.status, "Export failed");
      return response.blob();
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
      fetchWithAuth("/api/v1/invoices", {
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
    }) => {
      const sp = new URLSearchParams();
      if (params?.page != null) sp.set("page", String(params.page));
      if (params?.limit != null) sp.set("limit", String(params.limit));
      if (params?.status && params.status !== "all") sp.set("status", params.status);
      if (params?.search?.trim()) sp.set("search", params.search.trim());
      const raw = (await fetchWithAuth(
        `/api/v1/invoices?${sp.toString()}`,
      )) as {
        data?: { invoices?: unknown[] };
        meta?: { page: number; limit: number; total: number; total_pages?: number };
      };
      return {
        invoices: raw.data?.invoices ?? [],
        meta: raw.meta ?? {
          page: params?.page ?? 1,
          limit: params?.limit ?? 10,
          total: 0,
        },
      };
    },

    getById: (invoiceId: string) => 
      fetchWithAuth(`/api/v1/invoices/${invoiceId}`).then(res => {
        const inv = res.data;
        return {
          ...inv,
          total_amount: Number(inv.amount),
          customer_name: inv.metadata?.customer_name,
          line_items: inv.metadata?.line_items || [],
          notes: inv.metadata?.notes,
        };
      }),

    updateStatus: (invoiceId: string, status: string) =>
      fetchWithAuth(`/api/v1/invoices/${invoiceId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),

    export: async (invoiceId: string): Promise<Blob> => {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/invoices/${invoiceId}/export?format=pdf`,
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!response.ok) throw new ApiError(response.status, "Export failed");
      const body = await response.json();
      if (body.status === "accepted" && body.jobId) {
        const { jobId } = body;
        const pollUrl = `${API_BASE_URL}/api/v1/invoices/${invoiceId}/export/${jobId}/status`;
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          const pollRes = await fetch(pollUrl, {
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          if (!pollRes.ok) throw new ApiError(pollRes.status, "Export polling failed");
          const pollBody = await pollRes.json();
          if (pollBody.status === "completed" && pollBody.downloadUrl) {
            const dlRes = await fetch(
              `${API_BASE_URL}${pollBody.downloadUrl}`,
              { headers: { Authorization: `Bearer ${getToken()}` } },
            );
            if (!dlRes.ok) throw new ApiError(dlRes.status, "Download failed");
            return dlRes.blob();
          }
          if (pollBody.status === "failed") {
            throw new ApiError(500, pollBody.error || "PDF generation failed");
          }
        }
        throw new ApiError(408, "PDF generation timed out");
      }
      throw new ApiError(500, "Unexpected export response");
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
      if (params?.event_type && params.event_type !== "all") sp.set("event_type", params.event_type);
      if (params?.status && params.status !== "all") sp.set("status", params.status);
      if (params?.date_from) sp.set("date_from", params.date_from);
      if (params?.date_to) sp.set("date_to", params.date_to);
      if (params?.search) sp.set("search", params.search);
      if (params?.page != null) sp.set("page", String(params.page));
      if (params?.limit != null) sp.set("limit", String(params.limit));
      return fetchWithAuth(`/api/v1/webhooks/logs?${sp.toString()}`);
    },
    logDetails: (logId: string) => fetchWithAuth(`/api/v1/webhooks/logs/${logId}`),
    export: async (params?: {
      event_type?: string;
      status?: string;
      date_from?: string;
      date_to?: string;
      search?: string;
    }): Promise<Blob> => {
      const sp = new URLSearchParams();
      if (params?.event_type && params.event_type !== "all") sp.set("event_type", params.event_type);
      if (params?.status && params.status !== "all") sp.set("status", params.status);
      if (params?.date_from) sp.set("date_from", params.date_from);
      if (params?.date_to) sp.set("date_to", params.date_to);
      if (params?.search) sp.set("search", params.search);
      const response = await fetch(
        `${API_BASE_URL}/api/v1/webhooks/logs/export?${sp.toString()}`,
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (!response.ok) throw new ApiError(response.status, "Failed to export webhook logs");
      return response.blob();
    },
    retry: (logId: string) =>
      fetchWithAuth(`/api/v1/webhooks/logs/${logId}/retry`, { method: "POST" }),
    sendTest: (data: {
      event_type: string;
      endpoint_url: string;
      payload_override?: Record<string, unknown>;
    }) =>
      fetchWithAuth("/api/v1/webhooks/test", {
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
      return fetchWithAuth(`/api/v1/dashboard/overview/metrics${q ? `?${q}` : ""}`);
    },
    charts: (params?: { from?: string; to?: string }) => {
      const sp = new URLSearchParams();
      if (params?.from) sp.set("from", params.from);
      if (params?.to) sp.set("to", params.to);
      const q = sp.toString();
      return fetchWithAuth(`/api/v1/dashboard/overview/charts${q ? `?${q}` : ""}`);
    },
    activity: (params?: { from?: string; to?: string }) => {
      const sp = new URLSearchParams();
      if (params?.from) sp.set("from", params.from);
      if (params?.to) sp.set("to", params.to);
      const q = sp.toString();
      return fetchWithAuth(`/api/v1/dashboard/overview/activity${q ? `?${q}` : ""}`);
    },
  },

  // FX Rates — public, no auth required
  fx: {
    /**
     * Fetch the live USDC exchange rate for a given fiat currency.
     * Returns the number of fiat units per 1 USDC, or null on error.
     *
     * Example: getRate("USD") → { base_currency: "USD", target_currency: "USDC", rate: 1.0002 }
     */
    getRate: async (currency: string): Promise<{ base_currency: string; target_currency: string; rate: number } | null> => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/fx-rates?currency=${encodeURIComponent(currency.toUpperCase())}`,
          { headers: { "Content-Type": "application/json" } },
        );
        if (!res.ok) return null;
        const json = await res.json() as { data?: { base_currency: string; target_currency: string; rate: number } };
        return json.data ?? null;
      } catch {
        return null;
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
        if (params?.accountStatus) sp.set("accountStatus", params.accountStatus);
        return fetchWithAuth(`/api/v1/admin/merchants?${sp.toString()}`);
      },
      updateStatus: (merchantId: string, status: "active" | "suspended") =>
        fetchWithAuth(`/api/v1/admin/merchants/${merchantId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      bulkUpdateStatus: (merchantIds: string[], status: "active" | "suspended", reason: string) =>
        fetchWithAuth("/api/merchants/admin/bulk-status", {
          method: "POST",
          body: JSON.stringify({ merchantIds, status, reason }),
        }),
      disableWebhook: (merchantId: string) =>
        fetchWithAuth(`/api/admin/merchants/${encodeURIComponent(merchantId)}/webhook`, {
          method: "PATCH",
          body: JSON.stringify({ webhook_url: "" }),
        }),
    },
    settlements: {
      list: (params?: { page?: number; limit?: number; status?: string }) => {
        const sp = new URLSearchParams();
        if (params?.page != null) sp.set("page", String(params.page));
        if (params?.limit != null) sp.set("limit", String(params.limit));
        if (params?.status) sp.set("status", params.status);
        return fetchWithAuth(`/api/v1/admin/settlements?${sp.toString()}`);
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
        return fetchWithAuth(`/api/v1/admin/audit-logs?${sp.toString()}`);
      },
      getById: (id: string) => fetchWithAuth(`/api/v1/admin/audit-logs/${id}`),
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
        if (params?.status && params.status !== "all") sp.set("status", params.status);
        if (params?.currency) sp.set("currency", params.currency);
        if (params?.search?.trim()) sp.set("search", params.search.trim());
        if (params?.date_from) sp.set("date_from", params.date_from);
        if (params?.date_to) sp.set("date_to", params.date_to);
        return fetchWithAuth(`/api/v1/admin/payments?${sp.toString()}`);
      },
      verify: (paymentId: string) =>
        fetchWithAuth(`/api/v1/admin/payments/${encodeURIComponent(paymentId)}/verify`, {
          method: "POST",
        }),
    },
    addressPool: {
      stats: () => fetchWithAuth("/api/v1/admin/address-pool/stats"),
    },
    webhooks: {
      logs: (params?: {
        merchant_id?: string;
        event_type?: string;
        status?: string;
        date_from?: string;
        date_to?: string;
        search?: string;
        page?: number;
        limit?: number;
      }) => {
        const sp = new URLSearchParams();
        if (params?.merchant_id) sp.set("merchant_id", params.merchant_id);
        if (params?.event_type && params.event_type !== "all") sp.set("event_type", params.event_type);
        if (params?.status && params.status !== "all") sp.set("status", params.status);
        if (params?.date_from) sp.set("date_from", params.date_from);
        if (params?.date_to) sp.set("date_to", params.date_to);
        if (params?.search) sp.set("search", params.search);
        if (params?.page != null) sp.set("page", String(params.page));
        if (params?.limit != null) sp.set("limit", String(params.limit));
        return fetchWithAuth(`/api/admin/webhooks/logs?${sp.toString()}`);
      },
      retry: (logId: string) =>
        fetchWithAuth(`/api/admin/webhooks/${encodeURIComponent(logId)}/retry`, { method: "POST" }),
    },
  },
};

// Public pricing config endpoint (no auth required)
export const fetchPricingConfig = async () => {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/v1/public/pricing-config`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
};

export { ApiError };
