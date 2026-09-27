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
