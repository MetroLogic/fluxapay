import { notFound, redirect } from "next/navigation";
import { DocsLayout } from "@/components/docs/DocsLayout";

export default function DocsCatchAllPage() {
  // If an external documentation URL is configured, we can redirect here as well
  // as a fallback for the middleware/next.config.ts redirect.
  const externalDocsUrl = process.env.NEXT_PUBLIC_EXTERNAL_DOCS_URL;
  
  if (externalDocsUrl) {
    redirect(externalDocsUrl);
  }

  // Otherwise, show a documentation-themed 404
  return (
    <DocsLayout>
      <div className="py-20 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Documentation Page Not Found</h1>
        <p className="text-lg text-slate-600 mb-8">
          The documentation page you are looking for does not exist or has been moved.
        </p>
        <a
          href="/docs"
          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
        >
          Back to Documentation Home
        </a>
      </div>
    </DocsLayout>
  );
}
