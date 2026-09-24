/**
 * Shared formatting helpers for PDF reports, Excel and CSV exports.
 * Keeping them in one place guarantees the same number appears the same way
 * everywhere (screen, PDF, Excel, CSV).
 */

/** Indian currency grouping: 1234567 -> 12,34,567 */
const formatIndianNumber = (value, decimals = 0) => {
  const num = Number(value) || 0;
  const fixed = Math.abs(num).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const lastThree = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;
  const sign = num < 0 ? '-' : '';
  return decPart ? `${sign}${grouped}.${decPart}` : `${sign}${grouped}`;
};

/** ₹12,34,567 */
const formatCurrency = (value, decimals = 0) => `\u20B9${formatIndianNumber(value, decimals)}`;

/** Compact label for dashboard-style cards: ₹12.34 L / ₹1.23 Cr */
const formatCompactCurrency = (value) => {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  if (abs >= 10000000) return `\u20B9${(num / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `\u20B9${(num / 100000).toFixed(2)} L`;
  return formatCurrency(num);
};

/** 21 Sep 2026 */
const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** 21 Sep 2026, 06:30 PM */
const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${formatDate(date)}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
};

/** 2026-09-21 (safe for CSV/Excel import) */
const toIsoDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const safeFileSlug = (value) =>
  String(value || 'site')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'site';

module.exports = {
  formatIndianNumber,
  formatCurrency,
  formatCompactCurrency,
  formatDate,
  formatDateTime,
  toIsoDate,
  safeFileSlug,
};
