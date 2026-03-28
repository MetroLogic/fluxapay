"use client";

import React, { useState } from 'react';
import {
    Search,
    Filter,
    Download,
    Calendar,
    CheckCircle,
    Activity,
    XCircle,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import EmptyState from '@/components/EmptyState';
import { api } from '@/lib/api';
import { useEffect, useCallback } from 'react';

// -- Enums & Constants --

const ACTION_MAP: Record<string, string> = {
    'kyc_approve': 'KYC Approval',
    'kyc_reject': 'KYC Rejection',
    'config_change': 'Config Change',
    'sweep_trigger': 'Sweep Trigger',
    'sweep_complete': 'Sweep Complete',
    'sweep_fail': 'Sweep Failure',
    'settlement_batch_initiate': 'Settlement Start',
    'settlement_batch_complete': 'Settlement Complete',
    'settlement_batch_fail': 'Settlement Failure'
};

const STATUS_MAP: Record<string, 'success' | 'failure' | 'warning'> = {
    'kyc_approve': 'success',
    'kyc_reject': 'failure',
    'config_change': 'warning',
    'sweep_trigger': 'warning',
    'sweep_complete': 'success',
    'sweep_fail': 'failure',
    'settlement_batch_initiate': 'warning',
    'settlement_batch_complete': 'success',
    'settlement_batch_fail': 'failure'
};

// -- Helper Functions --

const getStatusConfig = (actionType: string) => {
    const status = STATUS_MAP[actionType] || 'success';
    switch (status) {
        case 'success':
            return {
                color: 'text-emerald-700',
                bg: 'bg-emerald-50',
                border: 'border-emerald-200',
                label: 'Success',
                icon: <CheckCircle className="w-3 h-3" />
            };
        case 'failure':
            return {
                color: 'text-rose-700',
                bg: 'bg-rose-50',
                border: 'border-rose-200',
                label: 'Failure',
                icon: <XCircle className="w-3 h-3" />
            };
        case 'warning':
            return {
                color: 'text-amber-700',
                bg: 'bg-amber-50',
                border: 'border-amber-200',
                label: 'Warning',
                icon: <AlertCircle className="w-3 h-3" />
            };
    }
};

const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

interface AuditLog {
    id: string;
    created_at: string;
    admin_id: string;
    action_type: string;
    entity_type: string;
    entity_id: string;
    details: any;
}

// -- Main Component --

export default function AdminAuditLogsPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionFilter, setActionFilter] = useState('all');
    const [adminIdFilter, setAdminIdFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 20;

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.admin.auditLogs.list({
                page,
                limit,
                action_type: actionFilter === 'all' ? undefined : actionFilter,
                admin_id: adminIdFilter || undefined,
            });

            if (response.success) {
                setLogs(response.data);
                setTotalPages(response.pagination.totalPages);
            }
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
            toast.error('Failed to load audit logs');
        } finally {
            setLoading(false);
        }
    }, [page, actionFilter, adminIdFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const exportLogs = () => {
        if (logs.length === 0) {
            toast.error('No logs to export');
            return;
        }
        const headers = ['ID', 'Timestamp', 'Admin ID', 'Action', 'Entity Type', 'Entity ID', 'Details'];
        const rows = logs.map(l => [
            l.id, l.created_at, l.admin_id, l.action_type, l.entity_type, l.entity_id, JSON.stringify(l.details)
        ]);
        const csv = [headers, ...rows]
            .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported current page (${logs.length} logs)`);
    };

    return (
        <div className="min-h-screen bg-slate-50">
             {/* Header */}
             <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
                            <p className="mt-1 text-sm text-slate-600">Track all admin actions for security and compliance.</p>
                        </div>
                        <div className="flex items-center gap-3">
                             <button 
                                onClick={exportLogs}
                                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                             >
                                <Download className="w-4 h-4" />
                                Export
                             </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                
                {/* Filters */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="Search by Admin ID..."
                                    className="w-full pl-10 pr-4 py-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition-shadow"
                                    value={adminIdFilter}
                                    onChange={(e) => {
                                        setAdminIdFilter(e.target.value);
                                        setPage(1);
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-slate-500" />
                                <select
                                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent bg-white"
                                    value={actionFilter}
                                    onChange={(e) => {
                                        setActionFilter(e.target.value);
                                        setPage(1);
                                    }}
                                >
                                    <option value="all">All Actions</option>
                                    <option value="kyc_approve">KYC Approval</option>
                                    <option value="kyc_reject">KYC Rejection</option>
                                    <option value="config_change">Config Change</option>
                                    <option value="sweep_trigger">Sweep Trigger</option>
                                    <option value="sweep_complete">Sweep Complete</option>
                                    <option value="sweep_fail">Sweep Failure</option>
                                    <option value="settlement_batch_initiate">Settlement Start</option>
                                    <option value="settlement_batch_complete">Settlement Complete</option>
                                    <option value="settlement_batch_fail">Settlement Failure</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Timestamp
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Admin User
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Action
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Target Resource
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Details
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="py-20 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                                                <p className="text-sm text-slate-500 font-medium">Fetching audit trail...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : logs.length === 0 ? (
                                    <EmptyState colSpan={6} className="py-12" message="No audit logs found. Try adjusting your search or filter criteria." />
                                ) : (
                                    logs.map((log) => {
                                        const statusConfig = getStatusConfig(log.action_type);

                                        return (
                                            <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                                        <Calendar className="w-4 h-4 text-slate-400" />
                                                        {formatDate(log.created_at)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-600 font-medium text-xs"
                                                        >
                                                            {log.admin_id.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900">{log.admin_id}</p>
                                                            <p className="text-xs text-slate-500 text-clip overflow-hidden w-32" title={log.admin_id}>{log.admin_id}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <Activity className="w-4 h-4 text-slate-400" />
                                                        <span className="text-sm text-slate-700 font-medium">{ACTION_MAP[log.action_type] || log.action_type}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                                        {log.entity_type}: {log.entity_id}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}
                                                    >
                                                        {statusConfig.icon}
                                                        {statusConfig.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-slate-600 max-w-xs truncate" title={JSON.stringify(log.details)}>
                                                        {JSON.stringify(log.details)}
                                                    </p>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Pagination */}
                <div className="mt-6 flex items-center justify-between">
                    <p className="text-sm text-slate-500">
                        Page <span className="font-medium text-slate-900">{page}</span> of <span className="font-medium text-slate-900">{totalPages}</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={page === 1 || loading}
                            onClick={() => setPage(prev => prev - 1)}
                            className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            disabled={page === totalPages || loading}
                            onClick={() => setPage(prev => prev + 1)}
                            className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
