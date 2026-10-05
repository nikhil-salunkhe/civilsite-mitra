import React, { useEffect, useState } from 'react';
import PublicLayout, { COMPANY } from '../../layouts/PublicLayout';
import { usePageMeta } from '../../hooks/usePageMeta';
import { SECTIONS, LAST_UPDATED } from './termsContent';

const TITLE = 'CivilSiteMitra Terms & Conditions | TechMitra Technology';
const DESCRIPTION =
  'Read the Terms & Conditions governing the use of CivilSiteMitra construction site management software provided by TechMitra Technology.';

/**
 * Contact details rendered as real tel:/mailto: links. This is the one place
 * the page needs to reach past the data model.
 */
const ContactBlock = () => (
  <div className="mt-3 rounded-lg border border-secondary-200 bg-secondary-50 p-4">
    <p className="font-medium text-secondary-900">{COMPANY.name}</p>
    <ul className="mt-2 space-y-1 text-sm text-secondary-700">
      <li>
        Website:{' '}
        <a
          href={`https://${COMPANY.websiteLabel}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded text-primary-700 underline underline-offset-2 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          {COMPANY.website}
        </a>
      </li>
      <li>
        Email:{' '}
        <a
          href={`mailto:${COMPANY.email}`}
          className="rounded text-primary-700 underline underline-offset-2 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          {COMPANY.email}
        </a>
      </li>
      <li>
        Phone:{' '}
        <a
          href={`tel:+${COMPANY.phone}`}
          className="rounded text-primary-700 underline underline-offset-2 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          {COMPANY.phone}
        </a>
      </li>
    </ul>
  </div>
);

/** Subtle "back to top" affordance, shown only once the page is scrolled. */
const BackToTop = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="btn btn-secondary btn-sm fixed bottom-5 right-5 z-20 shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    >
      Back to Top
    </button>
  );
};

const TermsAndConditions = () => {
  usePageMeta(TITLE, DESCRIPTION);

  return (
    <PublicLayout>
      <BackToTop />

      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <article className="card p-5 sm:p-8">
          <header className="border-b border-secondary-200 pb-6">
            <h1 className="text-2xl font-bold tracking-tight text-secondary-900 sm:text-3xl">
              Terms &amp; Conditions
            </h1>
            <p className="mt-2 text-sm text-secondary-600">
              Last Updated: <time dateTime="2026-10">{LAST_UPDATED}</time>
            </p>
            <p className="mt-4 text-base leading-relaxed text-secondary-700">
              Welcome to CivilSiteMitra, a construction site management platform provided by{' '}
              {COMPANY.name}. By accessing or using CivilSiteMitra, you agree to these Terms &amp;
              Conditions.
            </p>
          </header>

          {/* Table of contents - generated from the same data as the body. */}
          <nav aria-label="Table of contents" className="border-b border-secondary-200 py-6">
            <h2 className="section-title">On this page</h2>
            <ol className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {SECTIONS.map((section, i) => (
                <li key={section.id} className="flex gap-2">
                  <span className="w-5 shrink-0 tabular-nums text-secondary-500">{i + 1}.</span>
                  <a
                    href={`#${section.id}`}
                    className="rounded text-secondary-700 underline-offset-2 hover:text-primary-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="divide-y divide-secondary-200">
            {SECTIONS.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-heading`}
                className="scroll-mt-20 py-6"
              >
                <h2 id={`${section.id}-heading`} className="text-lg font-semibold text-secondary-900">
                  <span className="mr-2 tabular-nums text-secondary-500">{index + 1}.</span>
                  {section.title}
                </h2>

                {section.intro && (
                  <p className="mt-3 leading-relaxed text-secondary-700">{section.intro}</p>
                )}

                {section.paragraphs?.map((text) => (
                  <p key={text.slice(0, 40)} className="mt-3 leading-relaxed text-secondary-700">
                    {text}
                  </p>
                ))}

                {section.bullets && (
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed text-secondary-700 marker:text-secondary-400">
                    {section.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}

                {section.after && (
                  <p className="mt-3 leading-relaxed text-secondary-700">{section.after}</p>
                )}

                {section.id === 'contact' && <ContactBlock />}
              </section>
            ))}
          </div>
        </article>
      </main>
    </PublicLayout>
  );
};

export { TermsAndConditions };
export default TermsAndConditions;
