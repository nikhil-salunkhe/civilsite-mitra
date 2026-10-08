import React, { useState } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { money, dateFmt } from './shared';
import MaterialPeriodCard from './MaterialPeriodCard';

/**
 * Reports tab - the site's permanent record, standardised for engineers:
 * the screen preview, the A4 PDF (print / file / submit), the Excel workbook
 * and the CSV bundle all show the SAME numbered sections in the SAME order:
 *   1. Project Particulars (site • owner • engineer • contract value)
 *   2. Financial Summary (contract / investment / cash / profit)
 *   3. Owner Collection (installment schedule + receipts)
 *   4. Labour Register (workers + paid / due)
 *   5. Attendance Register (summary + recent rows)
 *   6. Material Register (purchases + consumption + closing stock)
 *   7. Vendor Register (purchases + paid)
 *   8. Other Expenses
 *   9. Daily Work Diary (recent activities)
 *  10. Documents Register (file index)
 * Data comes from GET /api/sites/:siteId/reports. Exports come from
 * GET /api/sites/:siteId/report/pdf, .../export/excel and .../export/csv.
 */
// Keys must match calculateSiteFinancialSummary in the backend financial
// service - a missing key means the card silently disappears. The groups render
// as labelled sections so the screen reads like the printed record.
const CARD_GROUPS = [
  {
    title: 'Contract Position',
    hint: 'What the project is worth and what the owner has paid',
    keys: [
      ['projectValue', 'Project Value (Area × Rate)'],
      ['totalReceived', 'Collected from Owner'],
      ['pendingReceivable', 'Balance Receivable'],
    ],
  },
  {
    title: 'Investment (Committed)',
    hint: 'Recorded liability — even if part is not yet paid',
    keys: [
      ['totalInvestment', 'Total Investment'],
      ['materialCost', 'Materials'],
      ['workerCost', 'Labour'],
      ['vendorCost', 'Vendor (Standalone)'],
      ['otherExpenses', 'Other Expenses'],
    ],
  },
  {
    title: 'Cash & Profit',
    hint: 'Cash actually moved, and what it means for profit',
    keys: [
      ['totalPaid', 'Cash Paid'],
      ['outstandingPayable', 'Outstanding Payable'],
      ['estimatedProfit', 'Estimated Profit'],
      ['realizedProfit', 'Profit Realised (Cash)'],
    ],
  },
];

/**
 * Numbered document index - mirrors SITE_REPORT_SECTIONS from
 * backend/src/reports/reportSchema.js (the single source of truth also used by
 * the PDF, Excel and CSV exports). The API supplies the same list with live
 * record counters in meta.sections; this fallback keeps the numbering visible
 * even if meta is missing.
 */
const FALLBACK_SECTIONS = [
  [1, 'site', 'Site Particulars'],
  [2, 'summary', 'Financial Summary'],
  [3, 'installments', 'Installment Schedule'],
  [4, 'payments', 'Owner Payments Received'],
  [5, 'workers', 'Labour Register & Payments'],
  [6, 'attendance', 'Attendance Register'],
  [7, 'materials', 'Material Purchases'],
  [8, 'materialUsage', 'Material Consumption'],
  [9, 'materialStock', 'Material Stock Position'],
  [10, 'vendors', 'Vendor Register'],
  [11, 'vendorPayments', 'Vendor Payments'],
  [12, 'expenses', 'Other Expenses'],
  [13, 'activities', 'Daily Work Diary'],
  [14, 'documents', 'Documents Register'],
].map(([no, key, title]) => ({ no, key, title, records: null }));

const SectionIndex = ({ meta }) => {
  const sections = Array.isArray(meta?.sections) && meta.sections.length > 0
    ? meta.sections
    : FALLBACK_SECTIONS;
  return (
    <div className="card">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900">Document Index</h3>
        <span className="text-xs text-gray-500">
          {typeof meta?.recordCount === 'number'
            ? `${meta.recordCount} records`
            : `${sections.length} sections`}
        </span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Scope: {meta?.scope || 'Entire project (all records)'} — the PDF, Excel and CSV exports
        use this exact numbering, so this site&rsquo;s record can be filed and referenced by
        section number.
      </p>
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6">
        {sections.map((s) => (
          <li
            key={s.key}
            className="flex items-baseline justify-between gap-2 py-1.5 border-b border-dashed border-gray-100 text-sm"
          >
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-xs font-bold text-primary-600 tabular-nums">
                {String(s.no).padStart(2, '0')}
              </span>
              <span className="text-gray-700 truncate">{s.title}</span>
            </span>
            {typeof s.records === 'number' && (
              <span className="text-xs text-gray-400 tabular-nums shrink-0">{s.records}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};

const pickSummary = (payload) => {
  if (!payload) return null;
  const d = payload.data !== undefined ? payload.data : payload;
  if (!d || typeof d !== 'object') return null;
  return d.summary || d.financials || d.report || d;
};

const pickArray = (obj, keys) => {
  for (const k of keys) {
    if (Array.isArray(obj?.[k])) return obj[k];
  }
  return [];
};

const pickObj = (obj, keys) => {
  for (const k of keys) {
    if (obj?.[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) return obj[k];
  }
  return null;
};

const ReportsTab = ({ siteId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');

  // The report is the one tab that must never fail silently: a failed load used
  // to leave the page looking empty (no cards, no tables) with no way back, so
  // it keeps its own error state + Retry.
  const loadReport = React.useCallback(() => {
    if (!siteId) return;
    setLoading(true);
    setError('');
    api.get(`/sites/${siteId}/reports`)
      .then(({ data: res }) => setData(res.data !== undefined ? res.data : res))
      .catch((err) => {
        const msg = err.response?.data?.message || 'Could not load the report. Please try again.';
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  React.useEffect(() => {
    loadReport();
  }, [loadReport]);

  const exportFile = async (format) => {
    setExporting(format);
    try {
      const res = await api.get(`/sites/${siteId}/export/${format}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `site-report-${siteId}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} exported`);
    } catch {
      toast.error(`Export failed`);
    } finally {
      setExporting('');
    }
  };

  // Opens the A4 PDF in a new tab for on-screen preview (spec section 35).
  const previewPdf = async () => {
    setExporting('pdf');
    try {
      const res = await api.get(`/sites/${siteId}/report/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 60000);
      toast.success('PDF preview opened');
    } catch {
      toast.error('Preview failed');
    } finally {
      setExporting('');
    }
  };

  if (loading) {
    return <div className="card p-8 text-center text-gray-400">Building report...</div>;
  }

  if (error) {
    return (
      <div className="card text-center py-10">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Report unavailable</h3>
        <p className="text-gray-500 mb-5">{error}</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={loadReport}>
          Retry
        </button>
      </div>
    );
  }

  const summary = pickSummary(data);
  const payments = pickArray(data, ['payments', 'paymentHistory']);
  const installments = pickArray(data, ['installments']);
  const header = data?.site || null;
  const generatedAt = data?.generatedAt ? dateFmt(data.generatedAt) : '';

  // One standard table per record type - concise on screen, each section with
  // its own heading and record count so the screen reads like the printed file.
  const Section = ({ title, columns, rows, note }) => {
    if (!rows || rows.length === 0) return null;
    return (
      <div className="card">
        <h3 className="font-semibold text-gray-900 p-4 border-b border-gray-200">
          {title} <span className="text-sm font-normal text-gray-500">({rows.length})</span>
        </h3>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} className={c.right ? 'text-right' : ''}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row._id || row.key || i} className="hover:bg-gray-50">
                  {columns.map((c) => (
                    <td key={c.label} className={c.right ? 'text-right' : c.bold ? 'font-medium' : ''}>
                      {c.render ? c.render(row) : (row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {note && <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">{note}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Document header - mirrors the PDF cover block: title, context, actions */}
      <div className="card p-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">
            {header?.siteName ? `Site Record — ${header.siteName}` : 'Site Record'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {[header?.ownerName ? `Owner: ${header.ownerName}` : null,
              header?.city || header?.address ? `Location: ${[header.city, header.address].filter(Boolean).join(', ')}` : null,
              header?.status ? `Status: ${header.status}` : null,
              generatedAt ? `Generated: ${generatedAt}` : null,
            ].filter(Boolean).join('  •  ') || 'Complete financial record of this site — preview, print or file it.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={exporting === 'pdf'} onClick={previewPdf}>
            {exporting === 'pdf' ? 'Loading...' : 'Preview / Print PDF'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={exporting === 'excel'} onClick={() => exportFile('excel')}>
            {exporting === 'excel' ? 'Exporting...' : 'Excel Record'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={exporting === 'csv'} onClick={() => exportFile('csv')}>
            {exporting === 'csv' ? 'Exporting...' : 'CSV Record'}
          </button>
        </div>
      </div>

      <SectionIndex meta={pickObj(data, ['meta']) || pickObj(data?.data, ['meta'])} />

      {/* Weekly / monthly / custom material purchases and consumption, in
          PDF, Excel and CSV - all from the same server-side rollup. */}
      <MaterialPeriodCard siteId={siteId} />

      {summary && typeof summary === 'object' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">
            <span className="text-primary-600 mr-1.5">02</span>Financial Summary
          </h3>
          {CARD_GROUPS.map((group) => {
            const cards = group.keys.filter(([k]) => summary[k] !== undefined);
            if (cards.length === 0) return null;
            return (
              <div key={group.title}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{group.title}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {cards.map(([k, label]) => (
                    <div key={k} className="dashboard-card">
                      <p className="text-sm text-gray-500 mb-1">{label}</p>
                      <p className="text-xl font-bold">{money(summary[k])}</p>
                      {k === 'estimatedProfit' && summary.profitMargin !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">Margin {summary.profitMargin}%</p>
                      )}
                      {k === 'totalPaid' && (
                        <p className="text-xs text-gray-500 mt-1">of {money(summary.totalInvestment)} committed</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Section
        title="3 · Installment Schedule"
        columns={[
          { label: 'Particular', bold: true, render: (i) => i.name },
          { label: 'Amount', right: true, render: (i) => money(i.amount) },
          { label: 'Paid', right: true, render: (i) => money(i.paidAmount) },
          { label: 'Status', render: (i) => <span className="badge">{i.status || '—'}</span> },
          { label: 'Due', render: (i) => dateFmt(i.dueDate) },
        ]}
        rows={installments}
        note="Money the owner agreed to pay — not an expense."
      />

      <Section
        title="4 · Owner Payments Received"
        columns={[
          { label: 'Date', render: (p) => dateFmt(p.paymentDate || p.date || p.createdAt) },
          { label: 'Amount', right: true, render: (p) => money(p.amount) },
          { label: 'Mode', render: (p) => p.paymentMode || '—' },
          { label: 'Reference', render: (p) => p.referenceNumber || p.transactionNumber || '—' },
        ]}
        rows={payments}
      />
    </div>
  );
};

export default ReportsTab;
