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
};

export { ApiError };
