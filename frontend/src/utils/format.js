/**
 * Shared display formatters.
 *
 * IMPORTANT: these helpers only format values for display. They must never be
 * used to derive financial totals - all money maths happens on the backend in
 * services/financialService.js.
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** ₹36,00,000 */
export const formatCurrency = (value) => inrFormatter.format(Number(value) || 0);

/** ₹36,00,000 -> used in tight table cells, falls back to "-" for empty values */
export const formatCurrencyOrDash = (value) =>
  value === null || value === undefined || value === '' ? '-' : formatCurrency(value);

/** 1,250 */
export const formatNumber = (value) => numberFormatter.format(Number(value) || 0);

/** 1,800.5 */
export const formatDecimal = (value) => numberFormatter.format(Number(value) || 0);

/** Large amounts for KPI cards: ₹36.0 L / ₹2.45 Cr */
export const formatCompactCurrency = (value) => {
  const amount = Number(value) || 0;
  const abs = Math.abs(amount);
  if (abs >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return formatCurrency(amount);
};

/** 21 Sep 2026 */
export const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** 21 Sep 2026, 10:45 AM */
export const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/** Date string for <input type="date"> */
export const toDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

/** 65% */
export const formatPercent = (value) => `${(Number(value) || 0).toFixed(1)}%`;

/** 1024 -> 1.0 KB */
export const formatFileSize = (bytes) => {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * API base URL.
 *
 * The backend mounts EVERY router under /api (see backend/src/app.js):
 *   POST /api/auth/login, GET /api/sites, GET /api/admin/dashboard ...
 *
 * So the base must include the /api suffix. If a host sets VITE_API_URL to the
 * bare origin (https://host) the app would silently request /auth/login and get
 * a 404, which is exactly what happened on Render. normaliseApiBase() appends
 * the suffix so both forms work, while a dev value of '/api' is left untouched.
 */
const normaliseApiBase = (value) => {
  const raw = (value || '').trim().replace(/\/+$/, '');   // drop trailing slashes
  if (!raw) return '/api';                                  // dev: Vite proxy handles it
  if (/\/api$/i.test(raw)) return raw;                      // already correct
  return `${raw}/api`;                                       // bare origin -> add it
};

export const API_BASE_URL = normaliseApiBase(import.meta.env.VITE_API_URL);

export const buildExportUrl = (path) => `${API_BASE_URL}${path}`;

/**
 * Absolute URL for a server-relative media path such as `/uploads/x.png`.
 *
 * Uploaded files are served from `/uploads` on the API host, which is NOT under
 * `/api`. Using the stored value directly as an <img src> therefore resolves it
 * against the frontend origin and breaks in both dev and production.
 *
 *   dev  -> API_BASE_URL is '/api', so the Vite proxy serves /uploads and we
 *           return the path unchanged.
 *   prod -> API_BASE_URL is 'https://api.host/api', so we swap the /api suffix
 *           for the origin and return an absolute URL.
 *
 * Absolute URLs, data: and blob: sources are passed through untouched.
 */
export const resolveMediaUrl = (value) => {
  if (!value || typeof value !== 'string') return '';
  if (/^(https?:)?\/\//i.test(value)) return value;
  if (/^(data|blob):/i.test(value)) return value;
  const origin = API_BASE_URL.startsWith('http')
    ? API_BASE_URL.replace(/\/api\/?$/, '')
    : '';
  return `${origin}${value.startsWith('/') ? '' : '/'}${value}`;
};
