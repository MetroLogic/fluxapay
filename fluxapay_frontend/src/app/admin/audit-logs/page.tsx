"use client";

import React, { useState, useEffect, useCallback } from 'react';
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
    Loader2,
    Eye,
    X,
    Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import EmptyState from '@/components/EmptyState';
import { api } from '@/lib/api';

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

interface AuditLogEntry {
    id: string;
    created_at: string;
    admin_id: string;
    action_type: string;
    entity_type: string | null;
    entity_id: string | null;
    details: unknown;
}

// -- Components --

const DetailsModal = ({ log, onClose }: { log: AuditLogEntry; onClose: () => void }) => {
    if (!log) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-slate-500" />
                        Action Details
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Timestamp</p>
                            <p className="text-sm font-medium text-slate-700">{new Date(log.created_at).toLocaleString()}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Admin ID</p>
                            <p className="text-sm font-mono text-slate-700 truncate" title={log.admin_id}>{log.admin_id}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Action Type</p>
                            <p className="text-sm font-medium text-slate-700">{ACTION_MAP[log.action_type] || log.action_type}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Resource</p>
                            <p className="text-sm font-medium text-slate-700">{log.entity_type || 'N/A'}: {log.entity_id || 'N/A'}</p>
                        </div>
                    </div>

                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Raw Payload / Details</p>
                        <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(log.details, null, 2)}
                        </pre>
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 text-right">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
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

// -- Main Component --

export default function AdminAuditLogsPage() {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionFilter, setActionFilter] = useState('all');
    const [adminIdFilter, setAdminIdFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
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
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
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
    }, [page, actionFilter, adminIdFilter, dateFrom, dateTo]);

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
                                Export CSV
                             </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                
                {/* Filters */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-end">
                        <div className="lg:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Search Admin</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="Admin ID or Email..."
                                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all shadow-sm"
                                    value={adminIdFilter}
                                    onChange={(e) => {
                                        setAdminIdFilter(e.target.value);
                                        setPage(1);
                                    }}
                                />
                            </div>
                        </div>

                        <div className="lg:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Action Type</label>
                            <div className="relative">
                                <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                                <select
                                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 bg-white appearance-none"
                                    value={actionFilter}
                                    onChange={(e) => {
                                        setActionFilter(e.target.value);
                                        setPage(1);
                                    }}
                                >
                                    <option value="all">All Actions</option>
                                    {Object.entries(ACTION_MAP).map(([val, label]) => (
                                        <option key={val} value={val}>{label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="lg:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">From Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                                <input
                                    type="date"
                                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900"
                                    value={dateFrom}
                                    max={dateTo}
                                    onChange={(e) => {
                                        setDateFrom(e.target.value);
                                        setPage(1);
                                    }}
                                />
                            </div>
                        </div>

                        <div className="lg:col-span-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">To Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                                <input
                                    type="date"
                                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900"
                                    value={dateTo}
                                    min={dateFrom}
                                    onChange={(e) => {
                                        setDateTo(e.target.value);
                                        setPage(1);
                                    }}
                                />
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
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Action
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
                                                        <Clock className="w-4 h-4 text-slate-400" />
                                                        {formatDate(log.created_at)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-900 text-white font-bold text-[10px]"
                                                        >
                                                            {log.admin_id.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900 truncate w-32" title={log.admin_id}>{log.admin_id}</p>
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
                                                    {log.entity_type ? (
                                                        <span className="font-mono text-[10px] text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                                            {log.entity_type}: {log.entity_id}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 text-xs">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusConfig.bg} ${statusConfig.color} border ${statusConfig.border}`}
                                                    >
                                                        {statusConfig.icon}
                                                        {statusConfig.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button 
                                                        onClick={() => setSelectedLog(log)}
                                                        className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all"
                                                        title="View Details"
                                                    >
                                                        <Eye className="w-5 h-5" />
                                                    </button>
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
                        Showing page <span className="font-bold text-slate-900">{page}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={page === 1 || loading}
                            onClick={() => setPage(prev => prev - 1)}
                            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm font-medium"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Previous
                        </button>
                        <button
                            disabled={page === totalPages || loading}
                            onClick={() => setPage(prev => prev + 1)}
                            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm font-medium"
                        >
                            Next
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Details Modal */}
            {selectedLog && (
                <DetailsModal 
                    log={selectedLog} 
                    onClose={() => setSelectedLog(null)} 
                />
            )}
        </div>
    );
}
