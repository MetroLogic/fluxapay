"use client";


import React, { useState, useRef, JSX } from 'react';
import {
    Search,
    AlertTriangle,
    Key,
    CheckCircle,
    Pause,
    X,
    Eye,
    Filter,
    Download,
    MoreVertical,
    Building,
    Mail,
    Calendar,
    DollarSign,
    Shield,
    UserCheck,
    UserX,
    FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import EmptyState from '@/components/EmptyState';
import { api } from '@/lib/api';
import { useAdminMerchants, type AdminMerchant } from '@/hooks/useAdminMerchants';


interface StatusConfig {
    color: string;
    bg: string;
    border: string;
    icon: JSX.Element;
}

const AdminMerchantsPage = () => {
    const primaryColor = 'oklch(0.205 0 0)';
    const primaryLight = 'oklch(0.93 0 0)';

    const [searchTerm, setSearchTerm] = useState<string>('');
    const [kycFilter, setKycFilter] = useState<string>('all');
    const [accountFilter, setAccountFilter] = useState<string>('all');
    const [selectedMerchant, setSelectedMerchant] = useState<AdminMerchant | null>(null);
    const [showResetKeyModal, setShowResetKeyModal] = useState<string | null>(null);
    const [showExportMenu, setShowExportMenu] = useState<boolean>(false);
    const [isExporting, setIsExporting] = useState<boolean>(false);
    const [exportProgress, setExportProgress] = useState<number>(0);
    const exportMenuRef = useRef<HTMLDivElement>(null);
    const exportButtonRef = useRef<HTMLButtonElement>(null);

    const { merchants, isLoading, mutate } = useAdminMerchants({
        limit: 200,
        kycStatus: kycFilter !== 'all' ? kycFilter : undefined,
        accountStatus: accountFilter !== 'all' ? accountFilter : undefined,
    });


    const getKycStatusConfig = (status: AdminMerchant['kycStatus']): StatusConfig => {
        switch (status) {
            case 'approved':
                return {
                    color: 'text-emerald-700',
                    bg: 'bg-emerald-50',
                    border: 'border-emerald-200',
                    icon: <UserCheck className="w-3 h-3" />
                };
            case 'pending_review':
                return {
                    color: 'text-amber-700',
                    bg: 'bg-amber-50',
                    border: 'border-amber-200',
                    icon: <Shield className="w-3 h-3" />
                };
            case 'rejected':
                return {
                    color: 'text-rose-700',
                    bg: 'bg-rose-50',
                    border: 'border-rose-200',
                    icon: <UserX className="w-3 h-3" />
                };
            default:
                return {
                    color: 'text-slate-600',
                    bg: 'bg-slate-50',
                    border: 'border-slate-200',
                    icon: <Shield className="w-3 h-3" />
                };
        }
    };

    const getAccountStatusConfig = (status: string): StatusConfig => {
        return status === 'active'
            ? {
                color: 'text-emerald-700',
                bg: 'bg-emerald-50',
                border: 'border-emerald-200',
                icon: <CheckCircle className="w-3 h-3" />
            }
            : {
                color: 'text-rose-700',
                bg: 'bg-rose-50',
                border: 'border-rose-200',
                icon: <Pause className="w-3 h-3" />
            };
    };

    // Close export menu when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                exportMenuRef.current &&
                !exportMenuRef.current.contains(event.target as Node) &&
                exportButtonRef.current &&
                !exportButtonRef.current.contains(event.target as Node)
            ) {
                setShowExportMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredMerchants = merchants.filter(merchant => {
        const matchesSearch =
            !searchTerm ||
            merchant.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            merchant.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            merchant.id.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    const updateMerchantKyc = async (id: string, status: AdminMerchant['kycStatus']) => {
        try {
            await api.adminKyc.updateStatus(id, { kyc_status: status });
            void mutate();
            toast.success(`KYC status updated to ${status}`);
        } catch {
            toast.error('Failed to update KYC status');
        }
        setSelectedMerchant(null);
    };

    const toggleAccountStatus = async (id: string) => {
        const merchant = merchants.find(m => m.id === id);
        if (!merchant) return;
        const newStatus = merchant.accountStatus === 'active' ? 'pending_verification' : 'active';
        try {
            const res = await api.adminMerchants.updateStatus(id, newStatus);
            if (!res.ok) throw new Error();
            void mutate();
            toast.success(`Merchant ${newStatus === 'active' ? 'activated' : 'suspended'}`);
        } catch {
            toast.error('Failed to update account status');
        }
        setSelectedMerchant(null);
    };

    const resetApiKeys = (id: string) => {
        toast.success(`API keys reset for merchant ${id}`);
        setShowResetKeyModal(null);
    };

    const getStats = () => {
        const total = merchants.length;
        const active = merchants.filter(m => m.accountStatus === 'active').length;
        const approved = merchants.filter(m => m.kycStatus === 'approved').length;
        const totalVolume = merchants.reduce((sum, m) => sum + m.volume, 0);

        return { total, active, approved, totalVolume };
    };

    const formatMerchantForExport = (merchant: AdminMerchant) => {
        return {
            'Merchant ID': merchant.id,
            'Business Name': merchant.businessName,
            'Email': merchant.email,
            'KYC Status': merchant.kycStatus.charAt(0).toUpperCase() + merchant.kycStatus.slice(1),
            'Account Status': merchant.accountStatus.charAt(0).toUpperCase() + merchant.accountStatus.slice(1),
            'Total Volume': `$${merchant.volume.toLocaleString()}`,
            'Total Revenue': `$${merchant.revenue.toLocaleString()}`,
            'Transaction Count': merchant.transactionCount,
            'Average Transaction': `$${merchant.avgTransaction.toFixed(2)}`,
            'Date Joined': merchant.dateJoined,
            'Volume (Raw)': merchant.volume,
            'Revenue (Raw)': merchant.revenue
        };
    };

    const simulateExportProgress = () => {
        return new Promise<void>((resolve) => {
            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                setExportProgress(progress);
                if (progress >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        setIsExporting(false);
                        setExportProgress(0);
                        resolve();
                    }, 500);
                }
            }, 100);
        });
    };

    const exportToCSV = async (data: AdminMerchant[], filename: string, message: string) => {
        setIsExporting(true);
        setShowExportMenu(false);

        try {
            const formattedData = data.map(formatMerchantForExport);
            const headers = Object.keys(formattedData[0]);

            const csvContent = [
                headers.join(','),
                ...formattedData.map(row => headers.map(header => {
                    const value = row[header as keyof typeof row];
                    // Escape quotes and wrap in quotes if contains comma
                    const stringValue = String(value);
                    return stringValue.includes(',') || stringValue.includes('"')
                        ? `"${stringValue.replace(/"/g, '""')}"`
                        : stringValue;
                }).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            await simulateExportProgress();
            toast.success(message);
        } catch {
            toast.error('Failed to export merchants. Please try again.');
            setIsExporting(false);
            setExportProgress(0);
        }
    };

    const exportFilteredData = () => {
        exportToCSV(
            filteredMerchants,
            `merchants_filtered_${new Date().toISOString().split('T')[0]}.csv`,
            `Exported ${filteredMerchants.length} merchant${filteredMerchants.length !== 1 ? 's' : ''} successfully!`
        );
    };

    const exportAllData = () => {
        exportToCSV(
            merchants,
            `merchants_all_${new Date().toISOString().split('T')[0]}.csv`,
            `Exported all ${merchants.length} merchants successfully!`
        );
    };

    const stats = getStats();

    if (isLoading && merchants.length === 0) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-slate-600">Loading merchants...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Export Progress Overlay */}
            {isExporting && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4">
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 mb-4">
                                <Download className="w-8 h-8 text-emerald-600" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">Exporting Merchants</h3>
                            <p className="text-sm text-slate-600 mb-6">
                                Preparing your export file...
                            </p>

                            {/* Progress Bar */}
                            <div className="w-full bg-slate-200 rounded-full h-2 mb-4">
                                <div
                                    className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${exportProgress}%` }}
                                />
                            </div>
                            <p className="text-sm text-slate-700">{exportProgress}% complete</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Merchant Management</h1>
                            <p className="mt-1 text-sm text-slate-600">Admin interface to view, manage, and moderate merchants</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Export Dropdown */}
                            <div className="relative">
                                <button
                                    ref={exportButtonRef}
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 relative"
                                    disabled={isExporting}
                                >
                                    <Download className="w-4 h-4" />
                                    Export
                                    <svg
                                        className={`w-4 h-4 ml-1 transition-transform ${showExportMenu ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {/* Export Dropdown Menu */}
                                {showExportMenu && (
                                    <div
                                        ref={exportMenuRef}
                                        className="absolute right-0 mt-2 w-56 bg-white rounded-lg border border-slate-200 shadow-lg z-50 animate-in fade-in slide-in-from-top-2"
                                    >
                                        <div className="p-2">
                                            <div className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                                                Export Format
                                            </div>
                                            <div className="px-3 py-2.5 text-sm text-slate-700 flex items-center gap-3">
                                                <FileText className="w-4 h-4 text-slate-500" />
                                                <div className="text-left">
                                                    <div className="font-medium">CSV File</div>
                                                    <div className="text-xs text-slate-500">Compatible with Excel & Numbers</div>
                                                </div>
                                            </div>

                                            <div className="border-t border-slate-200 my-2"></div>

                                            <div className="px-3 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                                                Export Scope
                                            </div>
                                            <button
                                                onClick={exportFilteredData}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-md transition-colors text-left"
                                                disabled={filteredMerchants.length === 0}
                                            >
                                                <Filter className="w-4 h-4 text-slate-500" />
                                                <div>
                                                    <div className="font-medium">Filtered Results</div>
                                                    <div className="text-xs text-slate-500">
                                                        {filteredMerchants.length} merchant{filteredMerchants.length !== 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                            </button>
                                            <button
                                                onClick={exportAllData}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 rounded-md transition-colors text-left"
                                            >
                                                <Building className="w-4 h-4 text-slate-500" />
                                                <div>
                                                    <div className="font-medium">All Merchants</div>
                                                    <div className="text-xs text-slate-500">
                                                        {merchants.length} merchant{merchants.length !== 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors hover:opacity-90"
                                style={{ backgroundColor: primaryColor }}>
                                Add Merchant
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Stats Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-600">Total Merchants</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
                            </div>
                            <div className="p-2 rounded-lg" style={{ backgroundColor: primaryLight }}>
                                <Building className="w-5 h-5" style={{ color: primaryColor }} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-600">Active Accounts</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.active}</p>
                            </div>
                            <div className="p-2 rounded-lg" style={{ backgroundColor: primaryLight }}>
                                <CheckCircle className="w-5 h-5" style={{ color: primaryColor }} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-600">KYC Approved</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.approved}</p>
                            </div>
                            <div className="p-2 rounded-lg" style={{ backgroundColor: primaryLight }}>
                                <Shield className="w-5 h-5" style={{ color: primaryColor }} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-slate-600">Total Volume</p>
                                <p className="text-2xl font-bold text-slate-900 mt-1">${(stats.totalVolume / 1000).toFixed(1)}k</p>
                            </div>
                            <div className="p-2 rounded-lg" style={{ backgroundColor: primaryLight }}>
                                <DollarSign className="w-5 h-5" style={{ color: primaryColor }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Export Status Banner */}
                {filteredMerchants.length > 0 && (
                    <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Download className="w-5 h-5 text-emerald-600" />
                            <div>
                                <p className="text-sm font-medium text-emerald-800">
                                    Ready to export {filteredMerchants.length} merchant{filteredMerchants.length !== 1 ? 's' : ''}
                                </p>
                                <p className="text-xs text-emerald-600">
                                    Export as CSV file (compatible with Excel, Google Sheets, Numbers)
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={exportFilteredData}
                            className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 border border-emerald-300 rounded-lg hover:bg-emerald-200 transition-colors"
                        >
                            Quick Export
                        </button>
                    </div>
                )}

                {/* Search and Filters */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="Search by merchant ID, business name, or email..."
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
                                    value={kycFilter}
                                    onChange={(e) => setKycFilter(e.target.value)}
                                >
                                    <option value="all">All KYC Status</option>
                                    <option value="unverified">Unverified</option>
                                    <option value="pending">Pending</option>
                                    <option value="approved">Approved</option>
                                    <option value="rejected">Rejected</option>
                                </select>
                            </div>

                            <select
                                className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent bg-white"
                                value={accountFilter}
                                onChange={(e) => setAccountFilter(e.target.value)}
                            >
                                <option value="all">All Accounts</option>
                                <option value="active">Active</option>
                                <option value="suspended">Suspended</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Merchants Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                     <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        s/n
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Merchant ID
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Business Name
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Email
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        KYC Status
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Account Status
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Volume / Revenue
                                    </th>
                                    <th className="px-2 py-4 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {filteredMerchants.length === 0 ? (
                                    <EmptyState colSpan={8} className="py-12" message="No merchants found. Try adjusting your search or filter criteria." />
                                ) : (
                                    filteredMerchants.map((merchant, index) => {
                                        const kycConfig = getKycStatusConfig(merchant.kycStatus);
                                        const accountConfig = getAccountStatusConfig(merchant.accountStatus);

                                        return (
                                            <tr key={merchant.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-sm font-medium text-slate-900 font-mono">
                                                        {index + 1}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-sm font-medium text-slate-900 font-mono">
                                                        {merchant.id}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                                                            style={{ backgroundColor: primaryLight }}
                                                        >
                                                            <Building className="w-4 h-4" style={{ color: primaryColor }} />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-900">{merchant.businessName}</p>
                                                            <p className="text-xs text-slate-500 mt-0.5">
                                                                Joined {merchant.dateJoined}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                                        <Mail className="w-4 h-4 text-slate-400" />
                                                        {merchant.email}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${kycConfig.bg} ${kycConfig.color} ${kycConfig.border}`}
                                                    >
                                                        {kycConfig.icon}
                                                        {merchant.kycStatus.charAt(0).toUpperCase() + merchant.kycStatus.slice(1)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${accountConfig.bg} ${accountConfig.color} ${accountConfig.border}`}
                                                    >
                                                        {accountConfig.icon}
                                                        {merchant.accountStatus.charAt(0).toUpperCase() + merchant.accountStatus.slice(1)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div>
                                                        <p className="text-sm font-medium text-slate-900">
                                                            ${(merchant.volume / 1000).toFixed(1)}k volume
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            ${merchant.revenue.toLocaleString()} revenue
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setSelectedMerchant(merchant)}
                                                            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                                                            title="View Details"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                        <button className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                                                            <MoreVertical className="w-4 h-4" />
                                                        </button>
                                                    </div>
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

            {/* Merchant Detail Modal */}
            {selectedMerchant && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                                        style={{ backgroundColor: primaryLight }}
                                    >
                                        <Building className="w-6 h-6" style={{ color: primaryColor }} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900">{selectedMerchant.businessName}</h2>
                                        <p className="text-sm text-slate-500">{selectedMerchant.id}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedMerchant(null)}
                                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="space-y-6">
                                {/* Merchant Info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <Mail className="w-4 h-4" />
                                            <span>{selectedMerchant.email}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <Calendar className="w-4 h-4" />
                                            <span>Joined {selectedMerchant.dateJoined}</span>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-xl p-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-xs text-slate-500">Transactions</p>
                                                <p className="text-lg font-semibold text-slate-900">{selectedMerchant.transactionCount}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-500">Avg. Transaction</p>
                                                <p className="text-lg font-semibold text-slate-900">${selectedMerchant.avgTransaction.toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* KYC Management */}
                                <div className="border-t border-slate-200 pt-6">
                                    <h3 className="text-sm font-semibold text-slate-900 mb-4">KYC Verification</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {getKycStatusConfig(selectedMerchant.kycStatus).icon}
                                                <span className="text-sm font-medium text-slate-700">
                                                    {selectedMerchant.kycStatus.charAt(0).toUpperCase() + selectedMerchant.kycStatus.slice(1)}
                                                </span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => updateMerchantKyc(selectedMerchant.id, 'approved')}
                                                    className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => updateMerchantKyc(selectedMerchant.id, 'rejected')}
                                                    className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Account Status */}
                                <div className="border-t border-slate-200 pt-6">
                                    <h3 className="text-sm font-semibold text-slate-900 mb-4">Account Status</h3>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            {getAccountStatusConfig(selectedMerchant.accountStatus).icon}
                                            <span className="text-sm font-medium text-slate-700">
                                                {selectedMerchant.accountStatus.charAt(0).toUpperCase() + selectedMerchant.accountStatus.slice(1)}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => toggleAccountStatus(selectedMerchant.id)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${selectedMerchant.accountStatus === 'active'
                                                ? 'text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100'
                                                : 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                                                }`}
                                        >
                                            {selectedMerchant.accountStatus === 'active' ? 'Suspend' : 'Activate'}
                                        </button>
                                    </div>
                                </div>

                                {/* API Key Management */}
                                <div className="border-t border-slate-200 pt-6">
                                    <h3 className="text-sm font-semibold text-slate-900 mb-4">Security Actions</h3>
                                    <button
                                        onClick={() => setShowResetKeyModal(selectedMerchant.id)}
                                        className="w-full px-4 py-3 text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Key className="w-4 h-4" />
                                        Reset API Keys
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset API Key Warning Modal */}
            {showResetKeyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6">
                        <div className="flex items-start gap-4">
                            <div className="shrink-0 mt-0.5">
                                <AlertTriangle className="w-6 h-6 text-rose-500" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">Reset API Keys</h3>
                                <p className="text-sm text-slate-600 mb-4">
                                    This action will immediately invalidate all existing API keys for this merchant.
                                    They will need to generate new keys to continue using the API.
                                </p>
                                <p className="text-sm font-medium text-slate-700 mb-6">
                                    This action cannot be undone.
                                </p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setShowResetKeyModal(null)}
                                        className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => resetApiKeys(showResetKeyModal)}
                                        className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors hover:opacity-90"
                                        style={{ backgroundColor: primaryColor }}
                                    >
                                        Confirm Reset
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminMerchantsPage;
