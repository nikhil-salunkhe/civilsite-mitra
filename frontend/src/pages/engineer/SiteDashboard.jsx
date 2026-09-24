import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { ConfirmDialog, StatusBadge } from '../../components/UI';
import { money, dateFmt } from './siteTabs/shared';
import TabPanel from './siteTabs';

const TAB_NAMES = ['Overview', 'Payments', 'Installments', 'Workers', 'Materials', 'Vendors', 'Expenses', 'Activities', 'Reports', 'Documents'];

export function SiteDashboard() {
  const { id: siteId } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Overview');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = () => {
    api
      .get(`/sites/${siteId}`)
      .then(({ data }) => {
        setSite(data.data?.site || null);
        setSummary(data.data?.summary || null);
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load site'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [siteId]);

  // Shared wrapper for the lifecycle buttons: run the request, toast, refresh.
  const runLifecycle = async (successMessage, request) => {
    setBusy(true);
    try {
      await request();
      toast.success(successMessage);
      setConfirmDelete(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const markComplete = () =>
    runLifecycle('Site marked as completed', () => api.patch(`/sites/${siteId}/complete`));

  const reopenSite = () =>
    runLifecycle('Site reopened', () => api.put(`/sites/${siteId}`, { status: 'Active' }));

  const toggleArchive = () =>
    runLifecycle(site?.isArchived ? 'Site restored' : 'Site archived', () =>
      api.patch(`/sites/${siteId}/archive`, { isArchived: !site?.isArchived })
    );

  // Hard delete removes every dependent record too, so the API insists on an
  // explicit confirmation flag in addition to this dialog.
  const removeSite = () =>
    runLifecycle('Site deleted', async () => {
      await api.delete(`/sites/${siteId}?confirm=true`);
      navigate('/sites');
    });

  if (loading) {
    return <div className="flex justify-center py-12"><div className="spinner w-8 h-8"></div></div>;
  }

  if (!site) {
    return (
      <div className="card text-center py-12">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Site not found</h3>
        <p className="text-gray-500">This site does not exist or you do not have access to it.</p>
      </div>
    );
  }

  const fin = summary || {};
  const cards = [
    { label: 'Project Value', value: money(fin.projectValue ?? site.estimatedProjectCost) },
    { label: 'Amount Received', value: money(fin.totalReceived ?? fin.received), cls: 'text-success-600' },
    { label: 'Pending Amount', value: money(fin.pendingAmount ?? fin.pending), cls: 'text-danger-600' },
    { label: 'Total Investment', value: money(fin.totalInvestment), cls: 'text-warning-600' },
    { label: 'Estimated Profit', value: money(fin.estimatedProfit), cls: 'text-green-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{site.siteName}</h1>
            <p className="text-sm text-gray-500 mt-1">
              Owner: <span className="font-medium text-gray-700">{site.ownerName}</span>
              {' · '}{site.city}{site.state ? `, ${site.state}` : ''}
              {' · '}{site.totalArea} {site.areaUnit || 'Sq.Ft'}
              {' · ₹'}{Number(site.ratePerArea).toLocaleString('en-IN')}/{site.areaUnit || 'Sq.Ft'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Started {dateFmt(site.startDate)}
              {site.expectedCompletionDate ? ` · Expected ${dateFmt(site.expectedCompletionDate)}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-1">Overall Progress</p>
            <div className="flex items-center gap-2">
              <div className="w-40 bg-gray-200 rounded-full h-3 overflow-hidden">
                <div className="bg-primary-500 h-3 rounded-full transition-all" style={{ width: `${site.overallProgress || 0}%` }}></div>
              </div>
              <span className="font-bold text-primary-600">{site.overallProgress || 0}%</span>
            </div>
          </div>
        </div>

        {/* Lifecycle actions */}
        <div className="flex items-center justify-between flex-wrap gap-3 mt-5 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={site.status} />
            {site.isArchived && <span className="badge status-inactive">Archived</span>}
            {site.actualCompletionDate && (
              <span className="text-xs text-gray-400">Completed {dateFmt(site.actualCompletionDate)}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {site.status !== 'Completed' ? (
              <button onClick={markComplete} disabled={busy} className="btn btn-secondary btn-sm">
                Mark Complete
              </button>
            ) : (
              <button onClick={reopenSite} disabled={busy} className="btn btn-secondary btn-sm">
                Reopen Site
              </button>
            )}
            <button onClick={toggleArchive} disabled={busy} className="btn btn-secondary btn-sm">
              {site.isArchived ? 'Restore Site' : 'Archive Site'}
            </button>
            <button onClick={() => setConfirmDelete(true)} disabled={busy} className="btn btn-danger btn-sm">
              Delete Site
            </button>
          </div>
        </div>

        {/* Financial cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
          {cards.map((c) => (
            <div key={c.label} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={`text-base font-bold ${c.cls || 'text-gray-900'}`}>{c.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="card !py-0 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TAB_NAMES.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Active tab panel - onChanged refreshes the site summary */}
      <TabPanel tab={tab} siteId={siteId} site={site} summary={summary} onChanged={load} />

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={removeSite}
        title="Delete Site"
        message={`Permanently delete "${site.siteName}" together with all of its payments, installments, workers, materials, vendors, expenses, activities and documents? This cannot be undone.`}
        confirmText="Delete"
        isDangerous
      />
    </div>
  );
}
