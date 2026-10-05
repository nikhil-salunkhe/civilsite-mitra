import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';

/**
 * Public shell for unauthenticated pages (legal, marketing).
 *
 * Built because the project had no public chrome at all - LoginPage stands
 * alone. Reused by Terms & Conditions and available to the Privacy Policy and
 * Refund pages when they are written, so the header/footer is written once.
 */

/** Company contact details. Kept in one place so the footer cannot drift. */
export const COMPANY = {
  name: 'TechMitra Technology',
  website: 'https://techmitr.in',
  websiteLabel: 'techmitr.in',
  email: 'techmitrofficial@gmail.com',
  phone: '9764149564',
};

/**
 * Footer policy links.
 *
 * Only pages that actually exist are listed. Privacy Policy and Refund &
 * Cancellation have no page yet, so they are omitted rather than shown as
 * dead links or "Coming soon" badges - add them here with `to` when written.
 */
const POLICY_LINKS = [
  { label: 'Terms & Conditions', to: '/terms-and-conditions' },
];

export const PublicHeader = () => {
  const { isAuthenticated, isAdmin } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-secondary-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo to="/" size="sm" showTagline={false} />
        <Link
          to={isAuthenticated ? (isAdmin ? '/admin/dashboard' : '/dashboard') : '/login'}
          className="btn btn-secondary btn-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
        >
          {isAuthenticated ? 'Go to app' : 'Sign in'}
        </Link>
      </div>
    </header>
  );
};

export const PublicFooter = () => (
  <footer className="mt-auto border-t border-secondary-200 bg-secondary-50">
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Legal and policy" className="mb-6">
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {POLICY_LINKS.map((link) => (
            <li key={link.label}>
              <Link
                to={link.to}
                className="rounded text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                aria-current={link.to === window.location.pathname ? 'page' : undefined}
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <a
              href={`mailto:${COMPANY.email}`}
              className="rounded text-sm font-medium text-primary-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            >
              Contact Us
            </a>
          </li>
        </ul>
      </nav>

      <div className="flex flex-col gap-3 border-t border-secondary-200 pt-6 text-sm text-secondary-600 sm:flex-row sm:items-center sm:justify-between">
        <p>
          &copy; {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <a
            href={`https://${COMPANY.websiteLabel}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            {COMPANY.websiteLabel}
          </a>
          <a
            href={`mailto:${COMPANY.email}`}
            className="rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            {COMPANY.email}
          </a>
          <a
            href={`tel:+${COMPANY.phone}`}
            className="rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            {COMPANY.phone}
          </a>
        </p>
      </div>
    </div>
  </footer>
);

/** Page shell: header, scrollable content, footer. */
const PublicLayout = ({ children }) => (
  <div className="flex min-h-screen flex-col bg-secondary-50">
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-700 focus:shadow"
    >
      Skip to content
    </a>
    <PublicHeader />
    {children}
    <PublicFooter />
  </div>
);

export default PublicLayout;