import { redirect } from "next/navigation";
import { DocsLayout } from "@/components/docs/DocsLayout";
import { Link } from "@/i18n/routing";

export default async function DocsCatchAllPage({ 
  params 
}: { 
  params: Promise<{ slug: string[]; locale: string }> 
}) {
  const { slug } = await params;
  
  // If an external documentation URL is configured, we can redirect here as well
  // as a fallback for the middleware/next.config.ts redirect.
  const externalDocsUrl = process.env.NEXT_PUBLIC_EXTERNAL_DOCS_URL;
  
  if (externalDocsUrl) {
    const baseUrl = externalDocsUrl.endsWith("/") ? externalDocsUrl.slice(0, -1) : externalDocsUrl;
    redirect(`${baseUrl}/${slug.join("/")}`);
  }

  // Otherwise, show a documentation-themed 404
  return (
    <DocsLayout>
      <div className="py-20 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Documentation Page Not Found</h1>
        <p className="text-lg text-slate-600 mb-8">
          The documentation page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors font-medium"
        >
          Back to Documentation Home
        </Link>
      </div>
    </DocsLayout>
  );
}
