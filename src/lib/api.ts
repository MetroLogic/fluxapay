import { getToken, storeToken, clearToken, getRefreshToken, storeRefreshToken, clearRefreshToken, isAdmin, setAdminStatus, clearAuth } from './auth';

export {
  getToken,
  storeToken,
  clearToken,
  getRefreshToken,
  storeRefreshToken,
  clearRefreshToken,
  isAdmin,
  setAdminStatus,
  clearAuth,
};

/**
 * Admin-authenticated API calls are proxied through server-side API routes
 * under `/api/admin/...`. The admin secret is read from a server-only env var
 * inside those routes and is never bundled into the client JavaScript.
 */
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = normalized.startsWith('/api/admin') ? normalized : `/api/admin${normalized}`;

  const headers = new Headers(init.headers);
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
}

/**
 * JWT-authenticated fetch used for admin endpoints. Sends the bearer token so
 * server routes can attribute actions to the authenticated admin for audit
 * logging.
 */
export async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(path, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
}

/**
 * Single admin merchants API namespace. Uses the JWT-based `fetchWithAuth()`
 * auth approach so admin actions are attributable for audit logging.
 */
export const api = {
  admin: {
    merchants: {
      list: () => fetchWithAuth('/api/admin/merchants'),
      get: (id: string) => fetchWithAuth(`/api/admin/merchants/${id}`),
      update: (id: string, data: unknown) =>
        fetchWithAuth(`/api/admin/merchants/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      remove: (id: string) =>
        fetchWithAuth(`/api/admin/merchants/${id}`, { method: 'DELETE' }),
    },
  },
};
