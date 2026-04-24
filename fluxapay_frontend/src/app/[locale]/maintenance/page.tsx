import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Maintenance | FluxaPay",
  description: "FluxaPay is currently undergoing scheduled maintenance.",
  robots: { index: false, follow: false },
};

/**
 * Maintenance page — shown when NEXT_PUBLIC_MAINTENANCE_MODE=true.
 * Middleware redirects all non-maintenance traffic here.
 * Styled to match the hero 404/500 pages.
 */
export default function MaintenancePage() {
  return (
    <div className="hero">
      <div className="py-8 h-screen flex flex-col relative overflow-hidden">
        {/* Nav */}
        <div className="w-full max-w-6xl mx-auto px-4 flex justify-between items-center">
          <span className="text-white text-lg font-semibold">FluxaPay</span>
        </div>

        {/* Content */}
        <div className="content flex-1 flex items-center justify-center h-full relative z-20 w-full max-w-6xl mx-auto px-4">
          <div className="text-center animate-fade-in">
            {/* Wrench icon */}
            <div className="text-[5rem] mb-4" aria-hidden="true">
              🔧
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight tracking-[-0.02em] mb-4">
              Under Maintenance
            </h1>
            <p className="pb-8 text-[#EFDBFC] text-xl font-medium max-w-2xl mx-auto">
              We&apos;re making improvements to FluxaPay. We&apos;ll be back
              shortly. Thank you for your patience.
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/status"
                className="px-8 py-3 text-lg font-semibold text-black bg-white rounded-lg transition-all hover:opacity-90"
              >
                Check Status Page
              </Link>
              <Link
                href="/support"
                className="px-8 py-3 text-lg font-semibold text-white border border-white/30 rounded-lg transition-all hover:bg-white/10"
              >
                Contact Support
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
