import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { downloadFile } from '../../../utils/download';
import { money, dateFmt } from './shared';

/**
 * Material Purchase & Usage report for a chosen period.
 *
 * The period selectors map directly onto the API contract:
 *   weekly  -> ?type=weekly&week=YYYY-Www   (ISO week, Monday..Sunday)
 *   monthly -> ?type=monthly&month=YYYY-MM (whole calendar month)
 *   custom  -> ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * PDF, Excel and CSV all come from the same server-side rollup, so the totals
 * shown here are exactly the totals written into the downloaded file.
 */
const nowIso = () => new Date().toISOString().slice(0, 10);

/** ISO-8601 week number (weeks start Monday; week 1 contains Jan 4). */
const isoWeekOf = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const diff = d - firstThursday;
  return {
    year: d.getUTCFullYear(),
    week: 1 + Math.round(diff / (7 * 24 * 3600 * 1000)),
  };
};

const PERIOD_TYPES = [
  ['monthly', 'Monthly'],
  ['weekly', 'Weekly'],
  ['custom', 'Custom Range'],
];

const MaterialPeriodCard = ({ siteId }) => {
  const today = useMemo(() => new Date(), []);
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const currentWeek = useMemo(() => {
    const { year, week } = isoWeekOf(today);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }, [today]);

  const [type, setType] = useState('monthly');
  const [month, setMonth] = useState(currentMonth);
  const [week, setWeek] = useState(currentWeek);
  const [from, setFrom] = useState(nowIso());
  const [to, setTo] = useState(nowIso());

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  /** The exact query string every format shares. */
  const query = useMemo(() => {
    if (type === 'monthly') return `type=monthly&month=${encodeURIComponent(month)}`;
    if (type === 'weekly') return `type=weekly&week=${encodeURIComponent(week)}`;
    return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  }, [type, month, week, from, to]);

  const valid = type !== 'custom' || Boolean(from && to && from <= to);

  const load = useCallback(() => {
    if (!siteId || !valid) return;
    setLoading(true);
    setError('');
    api
      .get(`/sites/${siteId}/reports/material-period/preview?${query}`)
      .then(({ data: res }) => setPreview(res?.data || null))
      .catch((err) => {
        const msg = err.response?.data?.message || 'Could not load the period report.';
        setError(msg);
        setPreview(null);
      })
      .finally(() => setLoading(false));
  }, [siteId, query, valid]);

  useEffect(() => { load(); }, [load]);

  const exportAs = async (format, filename) => {
    setBusy(format);
    try {
      await downloadFile(
        `/sites/${siteId}/reports/material-period/${format}?${query}`,
        filename,
      );
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (err) {
      toast.error(err.response?.data?.message || `${format.toUpperCase()} download failed`);
    } finally {
      setBusy('');
    }
  };

  const openPdf = async () => {
    setBusy('pdf');
    try {
      const res = await api.get(`/sites/${siteId}/reports/material-period?${query}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      // Revoked after a minute so the preview tab has time to load.
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(err.response?.data?.message || 'PDF preview failed');
    } finally {
      setBusy('');
    }
  };

  const totals = preview?.totals || null;
  const stamp = month || week || from;
return (
    <div className="card">
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Material Purchase &amp; Usage Report</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Weekly, monthly or custom period — purchases, consumption, balance and vendor totals.
          PDF, Excel and CSV all use the same figures.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* ---- period selection ---- */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="period-type">Report Type</label>
            <select
              id="period-type"
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {PERIOD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {type === 'monthly' && (
            <div>
              <label className="label" htmlFor="period-month">Month</label>
              <input
                id="period-month"
                type="month"
                className="input"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
          )}

          {type === 'weekly' && (
            <div>
              <label className="label" htmlFor="period-week">Week</label>
              <input
                id="period-week"
                type="week"
                className="input"
                value={week}
                onChange={(e) => setWeek(e.target.value)}
              />
            </div>
          )}

          {type === 'custom' && (
            <>
              <div>
                <label className="label" htmlFor="period-from">From</label>
                <input
                  id="period-from"
                  type="date"
                  className="input"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="period-to">To</label>
                <input
                  id="period-to"
                  type="date"
                  className="input"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {!valid && (
          <p className="text-xs text-danger-600">The From date must be on or before the To date.</p>
        )}

        {/* ---- totals ---- */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="alert alert-danger flex items-center justify-between">
            <span>{error}</span>
            <button type="button" className="btn btn-sm btn-secondary" onClick={load}>Retry</button>
          </div>
        )}

        {!loading && !error && totals && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Purchase Amount</p>
                <p className="text-lg font-semibold text-gray-900">{money(totals.totalPurchaseAmount)}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Paid / Outstanding</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{money(totals.totalPaid)}</p>
                <p className="text-xs text-gray-500">{money(totals.totalPending)} due</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Purchased / Used</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">
                  {totals.totalQuantityPurchased} / {totals.totalQuantityUsed}
                </p>
                <p className="text-xs text-gray-500">quantities</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Balance</p>
                {totals.balanceAvailable ? (
                  <p className="text-lg font-semibold text-gray-900">{totals.totalBalance}</p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">Balance not available</p>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-500">
              {preview?.title} &middot; {preview?.period?.label}
              {preview?.period?.from
                ? ` (${dateFmt(preview.period.from)} – ${dateFmt(preview.period.to)})`
                : ''}
              {' · '}{preview?.purchaseCount || 0} purchases, {preview?.usageCount || 0} usage entries
            </p>
{Array.isArray(preview?.rollup) && preview.rollup.length > 0 && (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Unit</th>
                      <th className="text-right">Purchased</th>
                      <th className="text-right">Used</th>
                      <th className="text-right">Balance</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rollup.map((r) => (
                      <tr key={`${r.name}-${r.unit}`} className="hover:bg-gray-50">
                        <td className="font-medium">{r.name}</td>
                        <td>{r.unit || '—'}</td>
                        <td className="text-right tabular-nums">{r.purchased}</td>
                        <td className="text-right tabular-nums">{r.used}</td>
                        <td className="text-right tabular-nums">
                          {r.balanceAvailable ? r.balance : '—'}
                        </td>
                        <td className="text-right tabular-nums">{money(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ---- downloads ---- */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openPdf}
            disabled={!valid || loading || busy === 'pdf'}
          >
            {busy === 'pdf' ? 'Opening...' : 'Preview / Print PDF'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => exportAs('excel', `material-period-${stamp}.xlsx`)}
            disabled={!valid || loading || busy === 'excel'}
          >
            {busy === 'excel' ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => exportAs('csv', `material-period-${stamp}.csv`)}
            disabled={!valid || loading || busy === 'csv'}
          >
            {busy === 'csv' ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaterialPeriodCard;