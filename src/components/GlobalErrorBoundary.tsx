'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import Link from 'next/link';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('GlobalErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-16 text-center font-sans">
          <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
            <div className="mb-6 flex items-center justify-center gap-2">
              <span className="text-2xl font-bold tracking-tight text-white">
                Fluxa<span className="text-indigo-400">Pay</span>
              </span>
            </div>

            <h1 className="mb-3 text-2xl font-semibold text-white">
              Something went wrong
            </h1>
            <p className="mb-6 text-sm leading-relaxed text-slate-300">
              An unexpected error occurred while rendering this page. You can try
              again, or head back to the homepage.
            </p>

            {this.state.error?.message && (
              <p className="mb-6 break-words rounded-lg bg-slate-800/80 px-3 py-2 text-xs text-slate-400">
                {this.state.error.message}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
              >
                Try again
              </button>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Back to homepage
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
