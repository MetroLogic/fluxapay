import React, { ReactNode } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(error, info);
    Sentry.captureException(error, { contexts: { react: info as unknown as Record<string, unknown> } });
  }

  handleReset(): void {
    this.setState({ hasError: false, error: null });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#0B0527] to-[#181C1E] font-sans px-4 text-center"
        >
          <h1
            className="text-8xl md:text-9xl font-black text-white leading-none tracking-tighter mb-0"
          >
            500
          </h1>
          <h2
            className="text-3xl md:text-5xl font-bold text-white mt-4 mb-6"
          >
            Something went wrong
          </h2>
          <p
            className="text-[#EFDBFC] text-lg max-w-xl mb-8"
          >
            An unexpected error occurred. Our team has been notified.
          </p>
          <div className="flex gap-4 flex-wrap justify-center">
            <button
              onClick={this.handleReset}
              className="px-8 py-3 text-base font-semibold bg-white text-black border-none rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
            >
              Try again
            </button>
            <Link
              href="/"
              className="px-8 py-3 text-base font-semibold bg-transparent text-white border border-white/30 rounded-lg no-underline hover:border-white/60 hover:bg-white/5 transition-colors"
            >
              Go to Home
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
