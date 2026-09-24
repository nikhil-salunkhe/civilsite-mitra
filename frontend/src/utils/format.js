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

/** Resolve the API base so uploaded files and export links work in dev and prod */
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const buildExportUrl = (path) => `${API_BASE_URL}${path}`;
