import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Brand mark used on the login screen, the sidebar headers and the PDF reports.
 * Kept as a component (instead of raw SVG in each page) so the branding stays
 * identical everywhere.
 */
export const LogoMark = ({ className = 'w-10 h-10' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

export const Logo = ({ to = '/', size = 'md', showTagline = true, className = '' }) => {
  const boxSize = size === 'lg' ? 'w-20 h-20' : size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const iconSize = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
  const titleSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg';

  const content = (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`${boxSize} bg-primary-600 rounded-xl flex items-center justify-center shadow-sm shadow-primary-600/20 shrink-0`}>
        <LogoMark className={`${iconSize} text-white`} />
      </div>
      <div className="min-w-0">
        <p className={`${titleSize} font-bold text-secondary-900 leading-tight truncate`}>
          CivilSiteMitra
        </p>
        {showTagline && (
          <p className="text-xs text-secondary-500 truncate">Build Better | Manage Smarter</p>
        )}
      </div>
    </div>
  );

  if (!to) return content;

  return (
    <Link to={to} className="inline-block">
      {content}
    </Link>
  );
};

export default Logo;
