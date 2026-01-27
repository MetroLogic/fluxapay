"use client";

import React, { useState } from 'react';
import {
    Save,
    Settings,
    Shield,
    Activity,
    Clock,
    DollarSign,
    Globe,
    CheckCircle,
    AlertCircle,
    Info,
    ChevronRight,
    Lock,
    Eye,
    Zap,
    CreditCard
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ConfigState {
    fees: {
        transactionPercent: number;
        transactionFixed: number;
        settlementPercent: number;
        settlementFixed: number;
    };
    network: {
        stellarNetwork: 'testnet' | 'public';
        horizonUrl: string;
        baseFee: number;
    };
    features: {
        enableStellar: boolean;
        enableUSDC: boolean;
        enableManualSettlements: boolean;
        enableAutoConvert: boolean;
        maintenanceMode: boolean;
    };
}

interface AuditLog {
    id: string;
    action: string;
    user: string;
    timestamp: string;
    description: string;
}

const AdminConfigPage = () => {
    const primaryColor = 'oklch(0.205 0 0)';
    const primaryLight = 'oklch(0.93 0 0)';

    const [config, setConfig] = useState<ConfigState>({
        fees: {
            transactionPercent: 1.5,
            transactionFixed: 0.1,
            settlementPercent: 0.5,
            settlementFixed: 0.0,
        },
        network: {
            stellarNetwork: 'testnet',
            horizonUrl: 'https://horizon-testnet.stellar.org',
            baseFee: 100,
        },
        features: {
            enableStellar: true,
            enableUSDC: true,
            enableManualSettlements: false,
            enableAutoConvert: true,
            maintenanceMode: false,
        }
    });

    const [auditLogs] = useState<AuditLog[]>([
        { id: '1', action: 'Update Fees', user: 'admin@fluxapay.com', timestamp: '2024-03-24 14:20', description: 'Changed transaction percent from 1.2% to 1.5%' },
        { id: '2', action: 'Toggle Feature', user: 'admin@fluxapay.com', timestamp: '2024-03-24 10:15', description: 'Enabled USDC payments' },
        { id: '3', action: 'Network Change', user: 'sys_admin', timestamp: '2024-03-23 09:00', description: 'Updated Horizon URL' },
    ]);

    const [isSaving, setIsSaving] = useState(false);

    const handleSave = () => {
        setIsSaving(true);
        // Simulate API call
        setTimeout(() => {
            setIsSaving(false);
            toast.success('Configuration saved successfully');
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-slate-900">
                                <Settings className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-slate-900">Platform Configuration</h1>
                                <p className="text-sm text-slate-500">Manage global settings, fees, and network parameters</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-6 py-2.5 text-white rounded-lg font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-slate-200"
                                style={{ backgroundColor: primaryColor }}
                            >
                                {isSaving ? (
                                    <Activity className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                {isSaving ? 'Saving Changes...' : 'Save Configuration'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Column: Core Configuration */}
                    <div className="lg:col-span-2 space-y-8">

                        {/* Fee Configuration Section */}
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg" style={{ backgroundColor: primaryLight }}>
                                        <DollarSign className="w-5 h-5" style={{ color: primaryColor }} />
                                    </div>
                                    <h2 className="text-lg font-bold text-slate-900">Fee Configuration</h2>
                                </div>
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
                                    <Activity className="w-3 h-3" />
                                    Active
                                </div>
                            </div>
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <label className="block">
                                        <span className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-1.5">
                                            Transaction Fee (%)
                                            <Info className="w-3.5 h-3.5 text-slate-400" />
                                        </span>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className="w-full pl-4 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
                                                value={config.fees.transactionPercent}
                                                onChange={(e) => setConfig({ ...config, fees: { ...config.fees, transactionPercent: parseFloat(e.target.value) } })}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">%</span>
                                        </div>
                                        <p className="mt-1.5 text-xs text-slate-500">Charged on every incoming payment</p>
                                    </label>
                                    <label className="block">
                                        <span className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-1.5">
                                            Fixed Fee (Stellar)
                                        </span>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className="w-full pl-4 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
                                                value={config.fees.transactionFixed}
                                                onChange={(e) => setConfig({ ...config, fees: { ...config.fees, transactionFixed: parseFloat(e.target.value) } })}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">XLM</span>
                                        </div>
                                    </label>
                                </div>
                                <div className="space-y-4">
                                    <label className="block">
                                        <span className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-1.5">
                                            Settlement Fee (%)
                                        </span>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className="w-full pl-4 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
                                                value={config.fees.settlementPercent}
                                                onChange={(e) => setConfig({ ...config, fees: { ...config.fees, settlementPercent: parseFloat(e.target.value) } })}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">%</span>
                                        </div>
                                        <p className="mt-1.5 text-xs text-slate-500">Fee applied during merchant settlement</p>
                                    </label>
                                    <label className="block">
                                        <span className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-1.5">
                                            Fixed Settlement Fee
                                        </span>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className="w-full pl-4 pr-12 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all"
                                                value={config.fees.settlementFixed}
                                                onChange={(e) => setConfig({ ...config, fees: { ...config.fees, settlementFixed: parseFloat(e.target.value) } })}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">XLM</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </section>

                        {/* Feature Flags Section */}
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-slate-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                                        <Zap className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-lg font-bold text-slate-900">Feature Flags & Payment Methods</h2>
                                </div>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {[
                                        { key: 'enableStellar', label: 'Stellar Payments', icon: Globe, desc: 'Enable native XLM payment processing' },
                                        { key: 'enableUSDC', label: 'USDC Payments', icon: CreditCard, desc: 'Allow payments via Circle USDC on Stellar' },
                                        { key: 'enableManualSettlements', label: 'Manual Settlements', icon: Lock, desc: 'Require admin approval for all merchant payouts' },
                                        { key: 'enableAutoConvert', label: 'Auto-Convert XLM', icon: Activity, desc: 'Automatically swap XLM to USDC on receipt' },
                                    ].map((feat) => (
                                        <div key={feat.key} className="flex items-start justify-between p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all bg-slate-50/50">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-1 p-1.5 rounded-md bg-white border border-slate-200 text-slate-600">
                                                    <feat.icon className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-900">{feat.label}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">{feat.desc}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setConfig({
                                                    ...config,
                                                    features: {
                                                        ...config.features,
                                                        [feat.key]: !config.features[feat.key as keyof typeof config.features]
                                                    }
                                                })}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${config.features[feat.key as keyof typeof config.features] ? 'bg-slate-900' : 'bg-slate-200'
                                                    }`}
                                            >
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.features[feat.key as keyof typeof config.features] ? 'translate-x-6' : 'translate-x-1'
                                                    }`} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
                                            <AlertCircle className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-rose-900">Maintenance Mode</p>
                                            <p className="text-xs text-rose-700">Disable all processing and merchant dashboard access</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setConfig({ ...config, features: { ...config.features, maintenanceMode: !config.features.maintenanceMode } })}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${config.features.maintenanceMode
                                            ? 'bg-rose-600 text-white shadow-md shadow-rose-200'
                                            : 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50'
                                            }`}
                                    >
                                        {config.features.maintenanceMode ? 'ACTIVE' : 'ACTIVATE'}
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Network Configuration Section */}
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                                        <Shield className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-lg font-bold text-slate-900">Network Configuration</h2>
                                </div>
                                {config.network.stellarNetwork === 'public' && (
                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                                        <Lock className="w-3 h-3" />
                                        Mainnet
                                    </div>
                                )}
                            </div>
                            <div className="p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <label className="block">
                                            <span className="text-sm font-semibold text-slate-700 mb-1.5 block">Stellar Network</span>
                                            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-xl">
                                                <button
                                                    onClick={() => setConfig({ ...config, network: { ...config.network, stellarNetwork: 'testnet', horizonUrl: 'https://horizon-testnet.stellar.org' } })}
                                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${config.network.stellarNetwork === 'testnet'
                                                        ? 'bg-white text-slate-900 shadow-sm'
                                                        : 'text-slate-500 hover:text-slate-700'
                                                        }`}
                                                >
                                                    Testnet
                                                </button>
                                                <button
                                                    onClick={() => setConfig({ ...config, network: { ...config.network, stellarNetwork: 'public', horizonUrl: 'https://horizon.stellar.org' } })}
                                                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${config.network.stellarNetwork === 'public'
                                                        ? 'bg-slate-900 text-white shadow-sm'
                                                        : 'text-slate-500 hover:text-slate-700'
                                                        }`}
                                                >
                                                    Public/Mainnet
                                                </button>
                                            </div>
                                        </label>
                                    </div>
                                    <div className="space-y-4">
                                        <label className="block">
                                            <span className="text-sm font-semibold text-slate-700 mb-1.5 block">Horizon URL</span>
                                            <input
                                                type="text"
                                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/5 focus:border-slate-900 transition-all font-mono text-xs"
                                                value={config.network.horizonUrl}
                                                onChange={(e) => setConfig({ ...config, network: { ...config.network, horizonUrl: e.target.value } })}
                                            />
                                        </label>
                                    </div>
                                </div>

                                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                                    <div className="flex gap-3">
                                        <Info className="w-5 h-5 text-amber-600 shrink-0" />
                                        <p className="text-sm text-amber-800 leading-relaxed">
                                            Switching network types requires a full platform re-validation. All merchant wallets and transaction history are network-specific.
                                            <span className="block mt-2 font-bold underline cursor-pointer">Read network migration guide</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Right Column: Sidebar / Audit Log */}
                    <div className="space-y-8">

                        {/* Status Summary */}
                        <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl shadow-slate-200">
                            <h3 className="text-sm font-medium text-slate-400 mb-4 uppercase tracking-wider">Operational Status</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between py-2 border-b border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                        <span className="text-sm font-medium">Payment Gateway</span>
                                    </div>
                                    <span className="text-xs font-mono text-emerald-500">Online</span>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                        <span className="text-sm font-medium">Stellar Bridge</span>
                                    </div>
                                    <span className="text-xs font-mono text-emerald-500">Connected</span>
                                </div>
                                <div className="flex items-center justify-between py-2">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                        <span className="text-sm font-medium">Settlement Engine</span>
                                    </div>
                                    <span className="text-xs font-mono text-emerald-500">Idle</span>
                                </div>
                            </div>
                            <button className="w-full mt-6 py-3 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2">
                                <Activity className="w-4 h-4" />
                                View Full Status Card
                            </button>
                        </div>

                        {/* Recent Audit Log */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                                <h3 className="font-bold text-slate-900">Audit History</h3>
                                <button className="text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors">View All</button>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {auditLogs.map((log) => (
                                    <div key={log.id} className="p-5 hover:bg-slate-50 transition-colors">
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <span className="text-sm font-bold text-slate-900">{log.action}</span>
                                            <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap bg-slate-100 px-1.5 py-0.5 rounded uppercase">
                                                {log.timestamp.split(' ')[1]}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-2">
                                            {log.description}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <div className="w-4 h-4 rounded-full bg-slate-200" />
                                            <span className="text-[10px] font-semibold text-slate-500">{log.user}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100">
                                <button className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest">
                                    <Clock className="w-3 h-3" />
                                    Load Older Logs
                                </button>
                            </div>
                        </div>

                        <div className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <Lock className="w-24 h-24 text-blue-900" />
                            </div>
                            <h3 className="text-sm font-bold text-blue-900 mb-2">Security Note</h3>
                            <p className="text-xs text-blue-700 leading-relaxed relative z-10">
                                All changes made to platform configuration are permanent and tied to your administrator profile.
                                Significant changes to fee structures may require re-notifying merchants.
                            </p>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminConfigPage;
