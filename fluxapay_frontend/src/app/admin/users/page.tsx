"use client";

import React, { useState, useMemo } from "react";
import type { JSX } from "react";
import { Search, Mail, ShieldCheck, UserCheck, UserX, X, Users, Loader2, KeyRound } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { useAdminUsers, type AdminUser } from "@/hooks/useAdminUsers";
import { useDebounce } from "@/hooks/useDebounce";

interface RoleConfig {
    label: string;
    color: string;
    bg: string;
    border: string;
    icon: JSX.Element;
}

const ROLE_CONFIG: Record<AdminUser["role"], RoleConfig> = {
    support: {
        label: "Support",
        color: "text-sky-700",
        bg: "bg-sky-50",
        border: "border-sky-200",
        icon: <ShieldCheck className="w-3 h-3" />,
    },
    finance: {
        label: "Finance",
        color: "text-violet-700",
        bg: "bg-violet-50",
        border: "border-violet-200",
        icon: <KeyRound className="w-3 h-3" />,
    },
    super_admin: {
        label: "Super Admin",
        color: "text-emerald-700",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        icon: <ShieldCheck className="w-3 h-3" />,
    },
};

const AdminUsersPage = () => {
    const primaryColor = "oklch(0.205 0 0)";
    const primaryLight = "oklch(0.93 0 0)";

    const [searchTerm, setSearchTerm] = useState<string>("");
    const [roleFilter, setRoleFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [page, setPage] = useState(1);

    // Debounce so every keystroke does not fire a request (#1185).
    const debouncedSearch = useDebounce(searchTerm, 300);

    const { users, pagination, isLoading } = useAdminUsers({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        role: roleFilter,
        is_active: statusFilter,
    });

    // Reset to the first page whenever a filter narrows the result set,
    // otherwise the table can land on an out-of-range page.
    React.useEffect(() => {
        setPage(1);
    }, [debouncedSearch, roleFilter, statusFilter]);

    // Client-side pass over the current page so typing feels instant even
    // before the debounced request comes back.
    const filteredUsers = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return users;
        return users.filter(
            (user) =>
                user.email.toLowerCase().includes(term) ||
                user.role.toLowerCase().includes(term) ||
                user.id.toLowerCase().includes(term),
        );
    }, [users, searchTerm]);

    const hasActiveFilters =
        searchTerm.trim() !== "" || roleFilter !== "all" || statusFilter !== "all";

    const clearFilters = () => {
        setSearchTerm("");
        setRoleFilter("all");
        setStatusFilter("all");
    };

    const stats = useMemo(() => {
        const total = pagination?.total ?? users.length;
        const active = users.filter((u) => u.isActive).length;
        const superAdmins = users.filter((u) => u.role === "super_admin").length;
        return { total, active, superAdmins };
    }, [pagination, users]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return "—";
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric",
        });
    };

    const totalPages = pagination?.totalPages ?? 1;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
                    <p className="mt-1 text-sm text-slate-600">
                        Admin interface to view and manage internal operator accounts
                    </p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Stats Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-600">Total Users</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
                            </div>
                            <div className="p-2 rounded-lg" style={{ backgroundColor: primaryLight }}>
                                <Users className="w-5 h-5" style={{ color: primaryColor }} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-600">
                                    Active on this page
                                </p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.active}</p>
                            </div>
                            <div className="p-2 rounded-lg" style={{ backgroundColor: primaryLight }}>
                                <UserCheck className="w-5 h-5" style={{ color: primaryColor }} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-600">Super Admins</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">
                                    {stats.superAdmins}
                                </p>
                            </div>
                            <div className="p-2 rounded-lg" style={{ backgroundColor: primaryLight }}>
                                <ShieldCheck className="w-5 h-5" style={{ color: primaryColor }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search and Filters */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="Search by email, role, or user ID..."
                                    aria-label="Search admin users"
                                    className="w-full pl-10 pr-10 py-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition-shadow"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm !== "" && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm("")}
                                        title="Clear search"
                                        aria-label="Clear search"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <select
                                aria-label="Filter by role"
                                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent bg-white"
                                value={roleFilter}
                                onChange={(e) => setRoleFilter(e.target.value)}
                            >
                                <option value="all">All Roles</option>
                                <option value="support">Support</option>
                                <option value="finance">Finance</option>
                                <option value="super_admin">Super Admin</option>
                            </select>

                            <select
                                aria-label="Filter by status"
                                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent bg-white"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="all">All Status</option>
                                <option value="true">Active</option>
                                <option value="false">Inactive</option>
                            </select>

                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                                >
                                    Clear filters
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Users Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        s/n
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        User ID
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Email
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Role
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Created
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={6} className="py-12 text-center">
                                            <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Loading users...
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <EmptyState
                                        colSpan={6}
                                        className="py-12"
                                        message={
                                            hasActiveFilters
                                                ? "No users found. Try adjusting your search or filter criteria."
                                                : "No admin users yet."
                                        }
                                    />
                                ) : (
                                    filteredUsers.map((user, index) => {
                                        const roleConfig = ROLE_CONFIG[user.role] ?? ROLE_CONFIG.support;

                                        return (
                                            <tr
                                                key={user.id}
                                                className="hover:bg-slate-50/50 transition-colors"
                                            >
                                                <td className="px-4 py-4 whitespace-nowrap">
                                                    <span className="text-sm font-medium text-slate-900 font-mono">
                                                        {(page - 1) * 20 + index + 1}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-4 whitespace-nowrap">
                                                    <span className="text-sm font-medium text-slate-900 font-mono">
                                                        {user.id}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                                            style={{ backgroundColor: primaryLight }}
                                                        >
                                                            <Mail className="w-4 h-4" style={{ color: primaryColor }} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-slate-900 truncate">
                                                                {user.email}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-4 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${roleConfig.bg} ${roleConfig.color} ${roleConfig.border}`}
                                                    >
                                                        {roleConfig.icon}
                                                        {roleConfig.label}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-4 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                                                            user.isActive
                                                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                                                : "bg-slate-100 text-slate-600 border border-slate-200"
                                                        }`}
                                                    >
                                                        {user.isActive ? (
                                                            <UserCheck className="w-3 h-3" />
                                                        ) : (
                                                            <UserX className="w-3 h-3" />
                                                        )}
                                                        {user.isActive ? "Active" : "Inactive"}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-4 whitespace-nowrap">
                                                    <span className="text-sm text-slate-600">
                                                        {formatDate(user.createdAt)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200">
                            <p className="text-sm text-slate-500">
                                Page {pagination?.page ?? 1} of {totalPages} ·{" "}
                                {pagination?.total ?? 0} user
                                {pagination?.total === 1 ? "" : "s"}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    className="px-3 py-1.5 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminUsersPage;
