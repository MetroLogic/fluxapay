'use client';

import Link from 'next/link';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-24 text-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
            <div className="mb-6 flex items-center justify-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-lg font-bold text-white">
                F
              </span>
              <span className="text-xl font-semibold tracking-tight text-white">
                FluxaPay
              </span>
            </div>

            <h1 className="text-2xl font-bold text-white">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              An unexpected error occurred while rendering this page. You can try
              again or return to the homepage.
            </p>

            {error?.digest ? (
              <p className="mt-4 text-xs text-slate-500">
                Error reference: {error.digest}
              </p>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-indigo-400 hover:to-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                Try again
              </button>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-lg border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                Back to homepage
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
