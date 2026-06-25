// Centralized Auth Module for FluxaPay Frontend
// Handles token storage, retrieval, and global auth state management

import { ApiError } from "./api";

/**
 * Storage keys for auth tokens
 */
const TOKEN_KEY = "token";
const ADMIN_KEY = "isAdmin";

/**
 * Get the current auth token from storage.
 * Checks localStorage first (persistent), then sessionStorage (session-only).
 * @throws {ApiError} If no token is found
 */
export function getToken(): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    throw new ApiError(401, "No authentication token found");
  }
  return token;
}

/**
 * Check if user is authenticated (has a valid token)
 */
export function isAuthenticated(): boolean {
  try {
    getToken();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if current user is admin
 */
export function isAdmin(): boolean {
  return localStorage.getItem(ADMIN_KEY) === "true";
}

/**
 * Store auth token in appropriate storage based on persistence preference.
 * @param token - The JWT token to store
 * @param keepLoggedIn - If true, stores in localStorage (persistent); otherwise sessionStorage
 */
export function storeToken(token: string, keepLoggedIn = false): void {
  if (keepLoggedIn) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY); // Clear any leftover session token
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY); // Ensure no persistent copy remains
  }
}

/**
 * Set admin status
 */
export function setAdminStatus(isAdmin: boolean): void {
  if (isAdmin) {
    localStorage.setItem(ADMIN_KEY, "true");
  } else {
    localStorage.removeItem(ADMIN_KEY);
  }
}

/**
 * Clear all auth-related data from storage
 */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADMIN_KEY);
}

/**
 * Logout user by clearing auth data and redirecting to login
 */
export function logout(): void {
  clearAuth();
  // Use window.location for full page reload to clear any cached state
  window.location.href = "/login";
}

/**
 * Handle authentication errors (401/403) by logging out user
 */
export function handleAuthError(error: unknown): void {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    logout();
  }
}