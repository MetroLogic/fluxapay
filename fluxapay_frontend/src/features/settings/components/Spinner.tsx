export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <circle cx="12" cy="12" r="10" className="opacity-30" />
      <path d="M22 12a10 10 0 0 1-10 10" />
    </svg>
  );
}
