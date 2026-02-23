// API Client for FluxaPay Backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new ApiError(response.status, error.message || 'Request failed');
  }

  return response.json();
}

export const api = {
  // Merchant endpoints
  merchant: {
    getMe: () => fetchWithAuth('/api/v1/merchants/me'),
    
    updateProfile: (data: { business_name?: string; email?: string }) =>
      fetchWithAuth('/api/v1/merchants/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    
    updateWebhook: (webhook_url: string) =>
      fetchWithAuth('/api/v1/merchants/me/webhook', {
        method: 'PATCH',
        body: JSON.stringify({ webhook_url }),
      }),
  },

  // API Keys endpoints
  keys: {
    regenerate: () =>
      fetchWithAuth('/api/v1/keys/regenerate', {
        method: 'POST',
      }),
  },
};

export { ApiError };
