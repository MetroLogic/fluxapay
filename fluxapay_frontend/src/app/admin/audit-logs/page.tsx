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
    AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import EmptyState from '@/components/EmptyState';

// -- Type Definitions --

interface AuditLogEntry {
    id: string;
    adminUser: string;
    email: string;
    action: 'USER_UPDATE' | 'SETTINGS_CHANGE' | 'PAYMENT_REFUND' | 'MERCHANT_APPROVAL' | 'SYSTEM_CONFIG';
    targetResource: string;
    timestamp: string;
    status: 'success' | 'failure' | 'warning';
    details: string;
    ipAddress: string;
}

// -- Mock Data --

const MOCK_LOGS: AuditLogEntry[] = [
    {
        id: 'LOG-001',
        adminUser: 'Sarah Connor',
        email: 'sarah.connor@fluxapay.com',
        action: 'MERCHANT_APPROVAL',
        targetResource: 'Merchant: TechStore Inc (M001)',
        timestamp: '2024-03-25T14:30:00Z',
        status: 'success',
        details: 'Approved KYC application for TechStore Inc.',
        ipAddress: '192.168.1.10'
    },
    {
        id: 'LOG-002',
        adminUser: 'John Wick',
        email: 'john.wick@fluxapay.com',
        action: 'PAYMENT_REFUND',
        targetResource: 'Tx: TXN-998877',
        timestamp: '2024-03-25T13:15:00Z',
        status: 'success',
        details: 'Processed refund of $500.00 for disputed transaction.',
        ipAddress: '10.0.0.5'
    },
    {
        id: 'LOG-003',
        adminUser: 'Sarah Connor',
        email: 'sarah.connor@fluxapay.com',
        action: 'USER_UPDATE',
        targetResource: 'User: User-555',
        timestamp: '2024-03-24T09:45:00Z',
        status: 'success',
        details: 'Updated profile information for user request.',
        ipAddress: '192.168.1.10'
    },
    {
        id: 'LOG-004',
        adminUser: 'System Admin',
        email: 'root@fluxapay.com',
        action: 'SYSTEM_CONFIG',
        targetResource: 'System Settings',
        timestamp: '2024-03-24T02:00:00Z',
        status: 'warning',
        details: 'Automated system backup completed with warnings.',
        ipAddress: '127.0.0.1'
    },
    {
        id: 'LOG-005',
        adminUser: 'Mike Ross',
        email: 'mike.ross@fluxapay.com',
        action: 'SETTINGS_CHANGE',
        targetResource: 'Global Fee Config',
        timestamp: '2024-03-23T16:20:00Z',
        status: 'failure',
        details: 'Failed attempt to update global transaction fee rate.',
        ipAddress: '172.16.0.22'
    }
];

// -- Helper Functions --

const getStatusConfig = (status: AuditLogEntry['status']) => {
    switch (status) {
        case 'success':
            return {
                color: 'text-emerald-700',
                bg: 'bg-emerald-50',
                border: 'border-emerald-200',
                icon: <CheckCircle className="w-3 h-3" />
            };
        case 'failure':
            return {
                color: 'text-rose-700',
                bg: 'bg-rose-50',
                border: 'border-rose-200',
                icon: <XCircle className="w-3 h-3" />
            };
        case 'warning':
            return {
                color: 'text-amber-700',
                bg: 'bg-amber-50',
                border: 'border-amber-200',
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
    
    const [searchTerm, setSearchTerm] = useState('');
    const [actionFilter, setActionFilter] = useState('all');
    
    // Filter Logic
    const filteredLogs = MOCK_LOGS.filter(log => {
        const matchesSearch = 
            log.adminUser.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.targetResource.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.id.toLowerCase().includes(searchTerm.toLowerCase());
            
        const matchesAction = actionFilter === 'all' || log.action === actionFilter;

        return matchesSearch && matchesAction;
    });

    const exportLogs = () => {
        if (filteredLogs.length === 0) {
            toast.error('No logs to export');
            return;
        }
        const headers = ['ID', 'Timestamp', 'Admin User', 'Email', 'Action', 'Target Resource', 'Status', 'Details', 'IP Address'];
        const rows = filteredLogs.map(l => [
            l.id, l.timestamp, l.adminUser, l.email, l.action, l.targetResource, l.status, l.details, l.ipAddress,
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
        toast.success(`Exported ${filteredLogs.length} log entries`);
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
                                    placeholder="Search by Admin, Resource ID, or Log ID..."
                                    className="w-full pl-10 pr-4 py-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent transition-shadow"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-slate-500" />
                                <select
                                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent bg-white"
                                    value={actionFilter}
                                    onChange={(e) => setActionFilter(e.target.value)}
                                >
                                    <option value="all">All Actions</option>
                                    <option value="USER_UPDATE">User Update</option>
                                    <option value="SETTINGS_CHANGE">Settings Change</option>
                                    <option value="PAYMENT_REFUND">Payment Refund</option>
                                    <option value="MERCHANT_APPROVAL">Merchant Approval</option>
                                    <option value="SYSTEM_CONFIG">System Config</option>
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
                                {filteredLogs.length === 0 ? (
                                    <EmptyState colSpan={6} className="py-12" message="No audit logs found. Try adjusting your search or filter criteria." />
                                ) : (
                                    filteredLogs.map((log) => {
                                        const statusConfig = getStatusConfig(log.status);

                                        return (
                                            <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                                        <Calendar className="w-4 h-4 text-slate-400" />
                                                        {formatDate(log.timestamp)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-600 font-medium text-xs"
                                                        >
                                                            {log.adminUser.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900">{log.adminUser}</p>
                                                            <p className="text-xs text-slate-500">{log.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <Activity className="w-4 h-4 text-slate-400" />
                                                        <span className="text-sm text-slate-700 font-medium">{log.action.replace('_', ' ')}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">
                                                        {log.targetResource}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}
                                                    >
                                                        {statusConfig.icon}
                                                        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-slate-600 max-w-xs truncate" title={log.details}>
                                                        {log.details}
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
            </div>
        </div>
    );
}
