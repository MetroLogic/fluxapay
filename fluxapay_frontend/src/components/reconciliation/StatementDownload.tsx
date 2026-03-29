import React, { useState } from 'react';

interface Props {
    onDownloadPDF: () => Promise<void>;
    onDownloadCSV: () => void;
    disabled: boolean;
}

export function StatementDownload({ onDownloadPDF, onDownloadCSV, disabled }: Props) {
    const [isPdfLoading, setIsPdfLoading] = useState(false);

    const handlePdfClick = async () => {
        try {
            setIsPdfLoading(true);
            await onDownloadPDF();
            alert('PDF statement downloaded successfully!');
        } catch {
            alert('Failed to generate PDF. Please try again.');
        } finally {
            setIsPdfLoading(false);
        }
    };

    const handleCsvClick = () => {
        try {
            onDownloadCSV();
            alert('CSV statement downloaded successfully!');
        } catch {
            alert('Failed to generate CSV. Please try again.');
        }
    };

    return (
        <div className="flex gap-3">
            <button
                type="button"
                disabled={disabled || isPdfLoading}
                onClick={handlePdfClick}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
                {isPdfLoading ? (
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <svg className="-ml-1 mr-2 h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                )}
                Download PDF
            </button>

            <button
                type="button"
                disabled={disabled}
                onClick={handleCsvClick}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
                <svg className="-ml-1 mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
            </button>
        </div>
    );
}
