import { useEffect } from 'react';

/**
 * Sets document title, meta description and canonical link for a public page.
 *
 * The project has no SEO library and did not previously touch <head> from JS,
 * so this is deliberately the smallest thing that does the job: it creates the
 * tags only when they are missing and leaves them alone on cleanup.
 *
 * @param {string} title       Full document title.
 * @param {string} description Meta description text.
 */
export function usePageMeta(title, description) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const setMeta = (attr, key, value) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!value) return;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', value);
    };

    setMeta('name', 'description', description);

    // Canonical is derived from the live origin rather than hardcoded, so the
    // same build is correct on localhost, a staging host and production.
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `${window.location.origin}${window.location.pathname}`);

    return () => {
      document.title = previousTitle;
    };
  }, [title, description]);
}

export default usePageMeta;