"use client";

import Link from "next/link";

/**
 * app/error.tsx — root-level error boundary.
 * Catches unhandled errors in any route segment under app/ that doesn't
 * have its own error.tsx. Styled to match the existing 404 hero page.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="hero">
      <div className="py-8 h-screen flex flex-col relative overflow-hidden">
        {/* Nav */}
        <div className="w-full max-w-6xl mx-auto px-4 flex justify-between items-center">
          <Link href="/" className="text-white text-lg font-semibold">
            FluxaPay
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-semibold text-black bg-white rounded-lg hover:opacity-90 transition-all"
          >
            Login
          </Link>
        </div>

        {/* Content */}
        <div className="content flex-1 flex items-center justify-center h-full relative z-20 w-full max-w-6xl mx-auto px-4">
          <div className="text-center animate-fade-in">
            <h1 className="text-white text-[5rem] md:text-[8rem] font-extrabold leading-[1] tracking-[-0.04em] mb-4">
              500
            </h1>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Something went wrong
            </h2>
            <p className="pb-8 text-[#EFDBFC] text-xl font-medium max-w-2xl mx-auto">
              An unexpected error occurred. Our team has been notified.
              {error.digest && (
                <span className="block mt-2 text-sm opacity-60">
                  Error ID: {error.digest}
                </span>
              )}
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={reset}
                className="px-8 py-3 text-lg font-semibold text-black bg-white rounded-lg transition-all hover:opacity-90"
              >
                Try again
              </button>
              <Link
                href="/"
                className="px-8 py-3 text-lg font-semibold text-white border border-white/30 rounded-lg transition-all hover:bg-white/10"
              >
                Go to Home
              </Link>
              <Link
                href="/status"
                className="px-8 py-3 text-lg font-semibold text-white border border-white/30 rounded-lg transition-all hover:bg-white/10"
              >
                Check Status
              </Link>
            </div>
          </div>
        </div>

        <div className="hero-fader w-full absolute bottom-0 h-[50vh] left-0 z-10" />
        <div className="hero-bg w-full absolute top-0 h-[80vh] left-0" />
      </div>
    </div>
  );
}
