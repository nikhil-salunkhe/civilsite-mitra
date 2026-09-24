import React from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { StatusBadge } from '../../../components/UI';
import { money, fmtDate } from './shared';

const OverviewTab = ({ site, summary, onChanged }) => {
  if (!site) return <div className="text-center py-8 text-gray-500">Loading site...</div>;

  const fallbackValue = Number(site.totalArea || 0) * Number(site.ratePerArea || 0);
  const received = summary?.totalReceived ?? summary?.amountReceived ?? 0;
  const pending =
    summary?.pendingAmount ?? summary?.pending ?? Math.max(0, fallbackValue - Number(received || 0));
  const cards = [
    { label: 'Project Value', v: money(summary?.projectValue ?? fallbackValue), c: 'border-l-primary-500' },
    { label: 'Amount Received', v: money(received), c: 'border-l-success-500' },
    { label: 'Pending Amount', v: money(pending), c: 'border-l-danger-500' },
    { label: 'Total Investment', v: money(summary?.totalInvestment ?? 0), c: 'border-l-warning-500' },
    { label: 'Estimated Profit', v: money(summary?.estimatedProfit ?? 0), c: 'border-l-green-500' },
  ];
  const progress = Number(site.overallProgress ?? 0);

  const setProgress = async (p) => {
    try {
      // PUT (with PATCH accepted as an alias) - the API keeps the stage-wise
      // values authoritative, so an explicit percentage is sent on its own.
      await api.put(`/sites/${site._id}/progress`, { overallProgress: p });
      toast.success(`Progress set to ${p}%`);
      onChanged?.();
    } catch {
      toast.error('Failed to update progress');
    }
  };

  const complete = async () => {
    if (!window.confirm('Mark this site as completed?')) return;
    try {
      await api.patch(`/sites/${site._id}/complete`);
      toast.success('Site marked as completed');
      onChanged?.();
    } catch {
      toast.error('Failed to complete site');
    }
  };

  const toggleArchive = async () => {
    const next = site.isArchived ? false : true;
    if (!window.confirm(next ? 'Archive this site?' : 'Restore this site?')) return;
    try {
      await api.patch(`/sites/${site._id}/archive`, { isArchived: next });
      toast.success(next ? 'Site archived' : 'Site restored');
      onChanged?.();
    } catch {
      toast.error('Failed to update site');
    }
  };

  const info = [
    ['Owner', site.ownerName],
    ['Owner Mobile', site.ownerMobile],
    ['Address', [site.address, site.city, site.state].filter(Boolean).join(', ')],
    ['Area', `${site.totalArea} ${site.areaUnit || 'Sq.Ft'}`],
    ['Rate', `${money(site.ratePerArea)}/${site.areaUnit || 'Sq.Ft'}`],
    ['Start Date', fmtDate(site.startDate)],
    ['Expected Completion', fmtDate(site.expectedCompletionDate)],
    ['Notes', site.notes || '-'],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`card border-l-4 ${c.c} py-4`}>
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className="text-lg font-bold text-gray-900">{c.v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="card-title">Site Details</h3>
            <StatusBadge status={site.status} />
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {info.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-gray-500">{k}</dt>
                <dd className="text-sm font-medium text-gray-900 break-words">{v || '-'}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="card">
          <h3 className="card-title mb-4">Overall Progress</h3>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
              <div className="bg-primary-500 h-3 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-sm font-bold min-w-[3rem]">{progress}%</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[0, 25, 50, 75, 100].map((p) => (
              <button
                key={p}
                onClick={() => setProgress(p)}
                className={`btn btn-sm ${progress === p ? 'btn-primary' : 'btn-secondary'}`}
              >
                {p}%
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {site.status !== 'Completed' && (
              <button onClick={complete} className="btn btn-primary w-full">
                Mark as Completed
              </button>
            )}
            <button onClick={toggleArchive} className="btn btn-secondary w-full">
              {site.isArchived ? 'Restore Site' : 'Archive Site'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewTab;
