import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard,
  IndianRupee,
  CalendarClock,
  Users,
  CalendarCheck,
  Package,
  ClipboardList,
  Store,
  Receipt,
  Activity,
  FileText,
  FolderOpen,
  Images,
} from 'lucide-react';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { ConfirmDialog, StatusBadge } from '../../components/UI';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { money, dateFmt } from './siteTabs/shared';
import TabPanel from './siteTabs';

const TAB_NAMES = ['Overview', 'Payments', 'Installments', 'Workers', 'Attendance', 'Materials', 'Material Usage', 'Vendors', 'Expenses', 'Activities', 'Reports', 'Site Photos', 'Documents'];

// One lucide icon per section - the icon + label pairing is what makes a
// vertical tab rail scannable at a glance (industry-standard navigation).
const TAB_ICONS = {
  Overview: LayoutDashboard,
  Payments: IndianRupee,
  Installments: CalendarClock,
  Workers: Users,
  Attendance: CalendarCheck,
  Materials: Package,
  'Material Usage': ClipboardList,
  Vendors: Store,
  Expenses: Receipt,
  Activities: Activity,
  Reports: FileText,
  'Site Photos': Images,
  Documents: FolderOpen,
};

// URL-friendly tab id: "Material Usage" -> "material-usage".
const tabSlug = (name) => name.toLowerCase().replace(/\s+/g, '-');

export function SiteDashboard() {
  const { id: siteId } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  // The active tab lives in the URL (?tab=...) so every section is deep-linkable,
  // survives a refresh, and browser back/forward moves between sections.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab =
    TAB_NAMES.find((t) => tabSlug(t) === (searchParams.get('tab') || '')) || 'Overview';

  const selectTab = (name) => {
    const next = new URLSearchParams(searchParams);
    if (name === 'Overview') next.delete('tab');
    else next.set('tab', tabSlug(name));
    setSearchParams(next, { replace: true });
  };
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Distinguishes "this site really is not yours" from "the call failed"
  // (network blip / database temporarily unreachable) so the empty state can
  // offer Retry instead of a misleading "Site not found".
  const [loadError, setLoadError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const load = () => {
    api
      .get(`/sites/${siteId}`)
      .then(({ data }) => {
        setSite(data.data?.site || null);
        setSummary(data.data?.summary || null);
        setLoadError('');
        setNotFound(false);
      })
      .catch((err) => {
        const status = err.response?.status;
        const msg = err.response?.data?.message;
        if (status === 404) {
          setNotFound(true);
          setLoadError(msg || 'Site not found');
          toast.error(msg || 'Site not found');
          return;
        }
        setLoadError(msg || 'Could not reach the server. Please check your connection and try again.');
        toast.error(msg || 'Failed to load site');
      })
      .finally(() => setLoading(false));
  };

  const retryLoad = () => {
    setLoading(true);
    setLoadError('');
    setNotFound(false);
    load();
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
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {notFound ? 'Site not found' : 'Could not load this site'}
        </h3>
        <p className="text-gray-500 mb-5">
          {loadError || 'This site does not exist or you do not have access to it.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button type="button" className="btn btn-primary btn-sm" onClick={retryLoad}>
            Retry
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/sites')}>
            Back to Sites
          </button>
        </div>
      </div>
    );
  }

  const fin = summary || {};
  const cards = [
    { label: 'Project Value', value: money(fin.projectValue ?? site.estimatedProjectCost) },
    { label: 'Amount Received', value: money(fin.totalReceived ?? fin.received), cls: 'text-success-600' },
    { label: 'Pending Amount', value: money(fin.pendingReceivable ?? fin.pendingAmount ?? fin.pending), cls: 'text-danger-600' },
    { label: 'Total Investment', value: money(fin.totalInvestment), cls: 'text-warning-600' },
    { label: 'Estimated Profit', value: money(fin.estimatedProfit), cls: 'text-success-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 break-words">{site.siteName}</h1>
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
          <div className="sm:text-right">
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
              <button type="button"  onClick={markComplete} disabled={busy} className="btn btn-secondary btn-sm">
                Mark Complete
              </button>
            ) : (
              <button type="button"  onClick={reopenSite} disabled={busy} className="btn btn-secondary btn-sm">
                Reopen Site
              </button>
            )}
            <button type="button"  onClick={toggleArchive} disabled={busy} className="btn btn-secondary btn-sm">
              {site.isArchived ? 'Restore Site' : 'Archive Site'}
            </button>
            <button type="button"  onClick={() => setConfirmDelete(true)} disabled={busy} className="btn btn-danger btn-sm">
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

      {/* Tab rail is a vertical list at every width. The WRAPPER decides whether
          it sits beside the content (lg+) or above it (mobile/tablet):
          flex-col on small screens, flex-row from lg up. The tablist itself is
          always flex-col, so the sections are never a horizontal strip.
          On mobile the rail is height-capped and scrolls internally so the panel
          below stays visible. Active tab mirrors into ?tab= for deep links. */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <nav
          className="card !py-2 w-full lg:w-56 lg:shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
          aria-label="Site sections"
        >
          <p className="block px-3 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Site Sections
          </p>
          <div
            className="flex flex-col gap-1 max-h-[45vh] overflow-y-auto pb-1 lg:max-h-none lg:overflow-visible lg:pb-0"
            role="tablist"
          >
            {TAB_NAMES.map((t) => {
              const Icon = TAB_ICONS[t];
              const active = tab === t;
              return (
                <button
                  key={t}
                  id={`site-tab-${tabSlug(t)}`}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  aria-controls={`site-tab-panel-${tabSlug(t)}`}
                  onClick={() => selectTab(t)}
                  className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 ${
                    active
                      ? 'bg-primary-50 text-primary-700 font-semibold shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 font-medium'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      active ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'
                    }`}
                    strokeWidth={2}
                  />
                  {t}
                </button>
              );
            })}
          </div>
        </nav>

        <div
          key={tab}
          className="min-w-0 flex-1 w-full animate-fadeIn focus:outline-none"
          role="tabpanel"
          id={`site-tab-panel-${tabSlug(tab)}`}
          aria-labelledby={`site-tab-${tabSlug(tab)}`}
          tabIndex={0}
        >
          {/* onChanged refreshes the site summary. The boundary is per-tab:
              one misbehaving panel cannot blank the page. */}
          <ErrorBoundary compact>
            <TabPanel tab={tab} siteId={siteId} site={site} summary={summary} onChanged={load} />
          </ErrorBoundary>
        </div>
      </div>

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
