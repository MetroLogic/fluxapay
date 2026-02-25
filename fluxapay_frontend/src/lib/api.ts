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

/** Authenticated fetch that builds the full URL */
function adminFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { ...adminHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
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

  // Admin merchant management
  adminMerchants: {
    list: (params?: { page?: number; limit?: number; status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.status) qs.set("status", params.status);
      return adminFetch(`/api/merchants/admin/list?${qs.toString()}`);
    },
    get: (merchantId: string) =>
      adminFetch(`/api/merchants/admin/${merchantId}`),
    updateStatus: (merchantId: string, status: string) =>
      adminFetch(`/api/merchants/admin/${merchantId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },

  // Admin KYC management
  adminKyc: {
    list: (params?: { status?: string; page?: number; limit?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.page) qs.set("page", String(params.page));
      if (params?.limit) qs.set("limit", String(params.limit));
      return fetchWithAuth(`/api/merchants/kyc/admin/submissions?${qs.toString()}`);
    },
    getByMerchant: (merchantId: string) =>
      fetchWithAuth(`/api/merchants/kyc/admin/${merchantId}`),
    updateStatus: (
      merchantId: string,
      body: { kyc_status: string; rejection_reason?: string },
    ) =>
      fetchWithAuth(`/api/merchants/kyc/admin/${merchantId}/status`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },

  // Health / readiness
  health: {
    check: () => fetch(`${API_BASE_URL}/health`),
    ready: () => fetch(`${API_BASE_URL}/ready`),
  },
};

export { ApiError };
