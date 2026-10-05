import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import PublicLayout, { COMPANY } from '../../layouts/PublicLayout';
import { useAuth } from '../../context/AuthContext';
import { usePageMeta } from '../../hooks/usePageMeta';
import { SECTIONS, LAST_UPDATED } from './termsContent';

const TITLE = 'CivilSiteMitra Terms & Conditions | TechMitra Technology';
const DESCRIPTION =
  'Read the Terms & Conditions governing the use of CivilSiteMitra construction site management software provided by TechMitra Technology.';

/**
 * Acceptance bar.
 *
 * Shown only when a signed-in engineer still has to accept the current terms
 * (the Super Admin created their account, so they have not agreed to anything
 * yet). The button stays disabled until the checkbox is ticked - there is no
 * way to skip past the consent. Public visitors never see this.
 */
const AcceptBar = () => {
  const { acceptTerms, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAccept = async () => {
    setSaving(true);
    setError('');
    try {
      await acceptTerms();
      toast.success('Thank you. The Terms & Conditions have been accepted.');
      // A temporary password is usually still pending, so send the engineer
      // straight to Settings rather than bouncing them off the gate again.
      navigate(mustChangePassword ? '/settings' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not record your acceptance. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sticky bottom-0 z-20 -mx-5 mt-8 border-t border-secondary-200 bg-white/95 p-4 shadow-[0_-2px_8px_rgba(15,23,42,0.06)] backdrop-blur sm:-mx-8 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <input
            id="accept-terms"
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={saving}
            className="checkbox mt-0.5"
          />
          <label htmlFor="accept-terms" className="text-sm leading-relaxed text-secondary-800">
            I have read and agree to the CivilSiteMitra{' '}
            <span className="font-semibold">Terms &amp; Conditions</span>.
          </label>
        </div>
        <button
          type="button"
          disabled={!checked || saving}
          onClick={handleAccept}
          className="btn btn-primary w-full shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {saving ? 'Saving...' : 'Accept & Continue'}
        </button>
      </div>
      {!checked && !error && (
        <p className="mt-2 text-xs text-secondary-500">
          You must accept the terms to continue using the platform.
        </p>
      )}
      {error && (
        <p role="alert" className="error-text mt-2">
          {error}
        </p>
      )}
    </div>
  );
};

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
  const { mustAcceptTerms, isAuthenticated } = useAuth();
  usePageMeta(TITLE, DESCRIPTION);

  // Only a signed-in engineer who has not yet accepted is asked to consent.
  // Visitors (and engineers who already agreed) just read the document.
  const needsAcceptance = isAuthenticated && mustAcceptTerms;

  return (
    <PublicLayout>
      <BackToTop />

      <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <article className="card p-5 sm:p-8">
          <header className="border-b border-secondary-200 pb-6">
            {needsAcceptance && (
              <div role="status" className="alert alert-info mb-5">
                <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">
                  Welcome. Please read the Terms &amp; Conditions below and accept them to continue
                  using CivilSiteMitra.
                </p>
              </div>
            )}
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

          {needsAcceptance && <AcceptBar />}
        </article>
      </main>
    </PublicLayout>
  );
};

export { TermsAndConditions };
export default TermsAndConditions;
