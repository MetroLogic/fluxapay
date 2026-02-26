import Link from "next/link";

type InfoSection = {
  title: string;
  body: string;
  bullets?: string[];
};

type InfoCta = {
  label: string;
  href: string;
};

export type StaticInfoPageProps = {
  eyebrow?: string;
  title: string;
  description: string;
  sections: InfoSection[];
  ctas?: InfoCta[];
};

export default function StaticInfoPage({
  eyebrow,
  title,
  description,
  sections,
  ctas = [],
}: StaticInfoPageProps) {
  return (
    <main className="min-h-screen bg-slate-50 py-16">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <header className="mb-10 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          {eyebrow ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-base text-slate-600">{description}</p>
          {ctas.length > 0 ? (
            <div className="mt-6 flex flex-wrap gap-3">
              {ctas.map((cta) => (
                <Link
                  key={cta.href}
                  href={cta.href}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  {cta.label}
                </Link>
              ))}
            </div>
          ) : null}
        </header>

        <div className="space-y-4">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold text-slate-900">
                {section.title}
              </h2>
              <p className="mt-2 text-slate-600">{section.body}</p>
              {section.bullets && section.bullets.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-700">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
