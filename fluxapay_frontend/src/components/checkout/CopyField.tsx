'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface CopyFieldProps {
  label: string;
  value: string;
  truncate?: boolean;
  required?: boolean;
}

export function CopyField({ label, value, truncate = false, required = false }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
      toast.error('Failed to copy to clipboard');
    }
  };

  const displayValue = truncate && value.length > 20 
    ? `${value.slice(0, 10)}...${value.slice(-10)}` 
    : value;

  return (
    <div className="group relative mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-widest text-gray-500">
          {label}
        </label>
        {required && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tighter text-amber-700">
            Required
          </span>
        )}
      </div>
      <div className="relative flex items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition-all hover:border-slate-400">
        <div className="flex-1 overflow-hidden px-4 py-3 font-mono text-sm text-gray-900">
          <span className="block truncate" title={value}>
            {displayValue}
          </span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-full items-center justify-center border-l border-gray-200 px-4 py-3 text-gray-500 transition-colors hover:bg-slate-900 hover:text-white"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <Check className="h-4 w-4 animate-in zoom-in" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
