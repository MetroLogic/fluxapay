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
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(2.7deg, #0B0527 -6.69%, #181C1E 106.68%)",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontSize: "clamp(4rem, 15vw, 8rem)",
              fontWeight: 800,
              color: "#fff",
              lineHeight: 1,
              letterSpacing: "-0.04em",
              margin: 0,
            }}
          >
            500
          </h1>
          <h2
            style={{
              fontSize: "clamp(1.5rem, 5vw, 3rem)",
              fontWeight: 700,
              color: "#fff",
              margin: "1rem 0",
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              color: "#EFDBFC",
              fontSize: "1.125rem",
              maxWidth: "36rem",
              marginBottom: "2rem",
            }}
          >
            An unexpected error occurred. Our team has been notified.
          </p>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                padding: "0.75rem 2rem",
                fontSize: "1rem",
                fontWeight: 600,
                background: "#fff",
                color: "#000",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: "0.75rem 2rem",
                fontSize: "1rem",
                fontWeight: 600,
                background: "transparent",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "0.5rem",
                textDecoration: "none",
              }}
            >
              Go to Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
