import React, { useState } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { money, dateFmt } from './shared';

/**
 * Reports tab - shows the site financial report returned by
 * GET /api/sites/:siteId/reports and offers Excel/CSV exports
 * (GET /api/sites/:siteId/export/excel|csv).
 */
const CARD_KEYS = [
  ['projectValue', 'Project Value'],
  ['totalReceived', 'Payments Received'],
  ['pendingAmount', 'Pending Payments'],
  ['totalInvestment', 'Total Investment'],
  ['estimatedProfit', 'Estimated Profit'],
  ['totalMaterialCost', 'Material Cost'],
  ['totalWorkerCost', 'Worker Cost'],
  ['totalExpenseCost', 'Other Expenses'],
];

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
  return null;
};

const ReportsTab = ({ siteId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');

  React.useEffect(() => {
    if (!siteId) return;
    api.get(`/sites/${siteId}/reports`)
      .then(({ data: res }) => setData(res.data !== undefined ? res.data : res))
      .catch(() => toast.error('Failed to load report'))
      .finally(() => setLoading(false));
  }, [siteId]);

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

  const summary = pickSummary(data);
  const payments = pickArray(data, ['payments', 'paymentHistory']);
  const installments = pickArray(data, ['installments']);

  return (
    <div className="space-y-6">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-gray-900">Site Report</h3>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={exporting === 'pdf'} onClick={previewPdf}>
            {exporting === 'pdf' ? 'Loading...' : 'Preview PDF'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={exporting === 'excel'} onClick={() => exportFile('excel')}>
            {exporting === 'excel' ? 'Exporting...' : 'Export Excel'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={exporting === 'csv'} onClick={() => exportFile('csv')}>
            {exporting === 'csv' ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {summary && typeof summary === 'object' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CARD_KEYS.filter(([k]) => summary[k] !== undefined).map(([k, label]) => (
            <div key={k} className="dashboard-card">
              <p className="text-sm text-gray-500 mb-1">{label}</p>
              <p className="text-xl font-bold">{money(summary[k])}</p>
            </div>
          ))}
        </div>
      )}

      {installments && installments.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 p-4 border-b border-gray-200">Installment Summary</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Name</th><th className="text-right">Amount</th><th className="text-right">Paid</th><th>Status</th><th>Due Date</th></tr>
              </thead>
              <tbody>
                {installments.map((i) => (
                  <tr key={i._id} className="hover:bg-gray-50">
                    <td className="font-medium">{i.name}</td>
                    <td className="text-right">{money(i.amount)}</td>
                    <td className="text-right">{money(i.paidAmount)}</td>
                    <td><span className="badge">{i.status || '—'}</span></td>
                    <td>{dateFmt(i.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {payments && payments.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 p-4 border-b border-gray-200">Payment History</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Date</th><th className="text-right">Amount</th><th>Mode</th><th>Reference</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p._id} className="hover:bg-gray-50">
                    <td>{dateFmt(p.paymentDate || p.date || p.createdAt)}</td>
                    <td className="text-right">{money(p.amount)}</td>
                    <td>{p.paymentMode || '—'}</td>
                    <td>{p.referenceNumber || p.transactionNumber || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsTab;
