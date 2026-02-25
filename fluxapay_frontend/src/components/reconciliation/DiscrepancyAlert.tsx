import React, { useState } from 'react';
import { format } from 'date-fns';
import { DiscrepancyAlert as IDiscrepancyAlert } from '../../types/reconciliation';

interface Props {
    alerts: IDiscrepancyAlert[];
    onResolve: (id: string) => void;
}

export function DiscrepancyAlert({ alerts, onResolve }: Props) {
    const [expanded, setExpanded] = useState(false);
    const unresolvedAlerts = alerts.filter(a => !a.resolved);

    if (unresolvedAlerts.length === 0) return null;

    return (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 rounded-r-md shadow-sm">
            <div className="flex items-start justify-between">
                <div className="flex items-start w-full">
                    <div className="flex-shrink-0">
                        <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div className="ml-3 w-full">
                        <h3 className="text-sm font-medium text-red-800">
                            {unresolvedAlerts.length} Unresolved Discrepanc{unresolvedAlerts.length === 1 ? 'y' : 'ies'} Detected
                        </h3>
                        <div className="mt-1 text-sm text-red-700">
                            <p>Please review and resolve the discrepancies listed below to balance your account.</p>
                        </div>

                        {expanded && (
                            <div className="mt-4 space-y-4 pr-4">
                                {unresolvedAlerts.map(alert => (
                                    <div key={alert.id} className="bg-white p-4 rounded-md border border-red-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 uppercase">
                                                    {alert.type.replace('_', ' ')}
                                                </span>
                                                <span className="text-xs text-gray-500">{format(alert.date, 'MMM d, yyyy')}</span>
                                            </div>
                                            <p className="text-sm font-bold text-gray-900 mb-1">
                                                Settlement {alert.settlementId}
                                                <span className="ml-2 text-red-600 font-bold">
                                                    Mismatch: ${alert.amount.toFixed(2)}
                                                </span>
                                            </p>
                                            <p className="text-sm text-gray-600">{alert.description}</p>
                                        </div>
                                        <button
                                            onClick={() => onResolve(alert.id)}
                                            className="flex-shrink-0 bg-white border border-gray-300 rounded-md shadow-sm py-2 px-4 inline-flex justify-center text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                                        >
                                            Mark Resolved
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="mt-3 text-sm font-medium text-red-800 hover:text-red-900 underline focus:outline-none"
                        >
                            {expanded ? 'Hide Details' : 'View Details'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
