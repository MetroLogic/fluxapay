// API Client for FluxaPay Backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");

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
    const error = await response
      .json()
      .catch(() => ({ message: "An error occurred" }));
    throw new ApiError(response.status, error.message || "Request failed");
  }

  return response.json();
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

export const api = {
  // Merchant endpoints
  merchant: {
    getMe: () => fetchWithAuth("/api/v1/merchants/me"),

    updateProfile: (data: { business_name?: string; email?: string }) =>
      fetchWithAuth("/api/v1/merchants/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    updateWebhook: (webhook_url: string) =>
      fetchWithAuth("/api/v1/merchants/me/webhook", {
        method: "PATCH",
        body: JSON.stringify({ webhook_url }),
      }),
  },

  // API Keys endpoints
  keys: {
    regenerate: () =>
      fetchWithAuth("/api/v1/keys/regenerate", {
        method: "POST",
      }),
  },

  // Sweep / Settlement Batch endpoints (admin-only)
  sweep: {
    /** Fetch current sweep system status */
    getStatus: (): Promise<Response> =>
      fetch(`${API_BASE_URL}/api/admin/settlement/status`, {
        headers: adminHeaders(),
      }),

    /** Manually trigger a full accounts sweep (settlement batch) */
    runSweep: (): Promise<Response> =>
      fetch(`${API_BASE_URL}/api/admin/settlement/run`, {
        method: "POST",
        headers: adminHeaders(),
      }),
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
      return fetchWithAuth(`/api/settlements?${sp.toString()}`);
    },
    summary: () => fetchWithAuth("/api/settlements/summary"),
    getById: (id: string) => fetchWithAuth(`/api/settlements/${id}`),
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
        return fetchWithAuth(`/api/merchants/kyc/admin/submissions?${sp.toString()}`);
      },
      getByMerchantId: (merchantId: string) =>
        fetchWithAuth(`/api/merchants/kyc/admin/${merchantId}`),
      updateStatus: (
        merchantId: string,
        body: { status: "approved" | "rejected"; rejection_reason?: string }
      ) =>
        fetchWithAuth(`/api/merchants/kyc/admin/${merchantId}/status`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
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
        return fetchWithAuth(`/api/admin/merchants?${sp.toString()}`);
      },
      updateStatus: (merchantId: string, status: "active" | "suspended") =>
        fetchWithAuth(`/api/admin/merchants/${merchantId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
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
        return fetchWithAuth(`/api/admin/settlements?${sp.toString()}`);
      },
    },
  },
};

export { ApiError };
