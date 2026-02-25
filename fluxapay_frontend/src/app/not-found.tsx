"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="hero">
      <div className="py-8 h-screen flex flex-col relative overflow-hidden">
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

        <div className="content flex-1 flex items-center justify-center h-full relative z-20 w-full max-w-6xl mx-auto px-4">
          <div className="text-center animate-fade-in">
            <h1 className="text-white text-[5rem] md:text-[8rem] font-extrabold leading-[1] tracking-[-0.04em] mb-4">
              404
            </h1>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Page Not Found
            </h2>
            <p className="pb-8 text-[#EFDBFC] text-xl font-medium max-w-2xl mx-auto">
              Oops! We couldn&#39;t find that page.
            </p>

            <Link
              href="/"
              className="px-8 py-3 text-lg font-semibold text-black bg-white rounded-lg transition-all hover:opacity-90 block w-fit mx-auto"
            >
              Go to Home
            </Link>
          </div>
        </div>

        <div className="hero-fader w-full absolute bottom-0 h-[50vh] left-0 z-10" />
        <div className="hero-bg w-full absolute top-0 h-[80vh] left-0" />
      </div>
    </div>
  );
}
