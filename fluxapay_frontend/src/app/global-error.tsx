"use client";
import Link from "next/link";

/**
 * global-error.tsx — catches errors thrown inside the root layout itself.
 * Must render its own <html> and <body> because the root layout is unavailable.
 */

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="min-h-screen flex flex-col items-center justify-center bg-[linear-gradient(2.7deg,#0B0527_-6.69%,#181C1E_106.68%)] p-4 text-center">
          <h1 className="text-[clamp(4rem,15vw,8rem)] font-extrabold text-white leading-none tracking-[-0.04em] m-0">
            500
          </h1>
          <h2 className="text-[clamp(1.5rem,5vw,3rem)] font-bold text-white my-4">
            Something went wrong
          </h2>
          <p className="text-[#EFDBFC] text-lg max-w-xl mb-8">
            An unexpected error occurred. Our team has been notified.
          </p>
          <div className="flex gap-4 flex-wrap justify-center">
            <button
              onClick={reset}
              className="px-8 py-3 text-base font-semibold bg-white text-black rounded-lg cursor-pointer hover:opacity-90 transition-all border-none"
            >
              Try again
            </button>
            <Link
              href="/"
              className="px-8 py-3 text-base font-semibold bg-transparent text-white border border-white/30 rounded-lg no-underline hover:bg-white/10 transition-all"
            >
              Go to Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
