"use client";

import useSWR from "swr";
import { api } from "@/lib/api";

export interface AdminUser {
  id: string;
  email: string;
  role: "support" | "finance" | "super_admin";
  isActive: boolean;
  createdAt: string;
}

interface AdminUsersResponse {
  success: boolean;
  data: AdminUser[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

interface UseAdminUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  is_active?: string;
}

export function useAdminUsers(params: UseAdminUsersParams = {}) {
  const key = ["admin-users", params];

  const { data, error, isLoading, mutate } = useSWR<AdminUsersResponse>(
    key,
    async () => {
      try {
        return (await api.admin.users.list(params)) as AdminUsersResponse;
      } catch {
        return {
          success: false,
          data: [],
          pagination: { total: 0, page: 1, limit: 20, totalPages: 1 },
        };
      }
    },
    { keepPreviousData: true },
  );

  return {
    users: data?.data ?? [],
    pagination: data?.pagination,
    error: error ?? null,
    isLoading,
    mutate,
  };
}
