import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, useAuth } from '../../context/AuthContext';
import { StatusBadge, EmptyState } from '../../components/UI';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import {
  Building2, HardHat, CheckCircle2, PauseCircle, Search, Plus, MapPin,
  Wallet, Banknote, TrendingUp, AlertTriangle, ArrowRight, CalendarCheck,
} from 'lucide-react';

/**
 * CivilSiteMitra - Engineer Dashboard (premium construction-SaaS layout).
 *
 * Data rules: every number on this screen comes from existing backend
 * endpoints - nothing is invented on the client:
 *   - GET /sites/summary           stats + financials + recent sites (primary)
 *   - GET /sites/:siteId/summary   per Active-Project card (<=4, parallel)
 *   - GET /engineer/activities     latest activity logs (<=6, optional panel)
 * Only ratios (percentages) are derived, always by dividing two backend values.
 * No stage-level construction data exists in the schema, so Site Progress stays
 * on overall site progress (real data) instead of invented stages.
 */
const f = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const fc = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
const compact = (n) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0);
const pctOf = (part, whole) => (Number(whole) > 0 ? Math.round((Number(part) / Number(whole)) * 1000) / 10 : 0);
const dateFmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
};

// Palette discipline: blue = primary, green = received/completed, amber =
// warning/investment, red = pending/overdue only, violet + gray as neutrals.
const C = { blue: '#3b82f6', green: '#22c55e', amber: '#f59e0b', red: '#ef4444', violet: '#8b5cf6', gray: '#94a3b8', navy: '#0f172a' };

const TOOLTIP = {
  contentStyle: { borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(15,23,42,.06)' },
  labelStyle: { fontSize: 12, color: '#334155' },
};
const AXIS = { fontSize: 11, fill: '#64748b' };

const Skel = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

const ProgressBar = ({ value, color = C.blue, className = '' }) => {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div
      className={`w-full bg-gray-100 rounded-full overflow-hidden ${className || 'h-2'}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
};

const MoneyRow = ({ label, value, cls = 'text-gray-900' }) => (
  <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className={`font-semibold ${cls}`}>{value}</span>
  </div>
);

const SectionHead = ({ title, action }) => (
  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
    <h3 className="card-title">{title}</h3>
    {action}
  </div>
);

const DonutCenter = ({ big, small }) => (
  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
    <span className="text-2xl font-bold text-gray-900">{big}</span>
    <span className="text-xs text-gray-500">{small}</span>
  </div>
);

const EmptyBox = ({ title, description }) => (
  <div className="py-8 text-center">
    <p className="text-sm font-medium text-gray-700">{title}</p>
    {description && <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">{description}</p>}
  </div>
);
export const EngineerDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [siteSummaries, setSiteSummaries] = useState({});
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [activity, setActivity] = useState({ items: [], siteNames: {}, loading: false });
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    api.get('/sites/summary')
      .then(({ data: d }) => {
        const payload = d.data;
        setData(payload);

        // Existing endpoint, only for the Active Projects cards (<=4 parallel).
        const active = (payload.sites || []).filter((s) => s.status === 'Active').slice(0, 4);
        if (active.length > 0) {
          setProjectsLoading(true);
          Promise.allSettled(
            active.map((s) => api.get(`/sites/${s._id}/summary`).then((r) => [s._id, r.data.data]))
          )
            .then((results) => {
              const map = {};
              results.forEach((r) => {
                if (r.status === 'fulfilled' && r.value) map[r.value[0]] = r.value[1];
              });
              setSiteSummaries(map);
            })
            .finally(() => setProjectsLoading(false));
        }

        // Existing engineer-scoped activity feed. Optional section - silent on
        // failure so one unavailable module never breaks the dashboard.
        setActivity((a) => ({ ...a, loading: true }));
        api.get('/engineer/activities', { params: { page: 1, limit: 6 } })
          .then(({ data: r }) => setActivity({
            items: (r.data.items || []).slice(0, 6),
            siteNames: r.data.siteNames || {},
            loading: false,
          }))
          .catch(() => setActivity({ items: [], siteNames: {}, loading: false }));
      })
      .catch((err) => {
        console.error('Dashboard: failed to load /sites/summary', err);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = data?.stats || {};
  const fin = data?.financials || {};
  const sites = data?.sites || [];
  const name = data?.user?.name || user?.name || 'Engineer';
  const initial = (name || 'E').charAt(0).toUpperCase();

  const runSearch = () => {
    const q = query.trim();
    navigate(q ? `/sites?search=${encodeURIComponent(q)}` : '/sites');
  };

  // ---- Error state: generic message + retry, raw errors stay in console -----
  if (loadError && !data) {
    return (
      <div className="card text-center py-16 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-full bg-danger-50 text-danger-500 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Unable to load dashboard data.</h2>
        <p className="text-sm text-gray-500 mb-5">Please check your connection and try again.</p>
        <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
      </div>
    );
  }
  // ---- Loading state: skeleton, never a blank screen ------------------------
  if (loading && !data) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div><Skel className="h-7 w-64" /><Skel className="h-4 w-72 mt-2" /></div>
          <Skel className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card">
              <Skel className="h-4 w-24" /><Skel className="h-8 w-16 mt-3" /><Skel className="h-3 w-32 mt-3" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="card">
              <Skel className="h-4 w-24" /><Skel className="h-8 w-28 mt-3" /><Skel className="h-3 w-24 mt-3" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card"><Skel className="h-4 w-36 mb-4" /><Skel className="h-56" /></div>
          <div className="card"><Skel className="h-4 w-36 mb-4" /><Skel className="h-56" /></div>
        </div>
      </div>
    );
  }

  // ---- Header: time-based greeting + search + profile + Add New Site --------
  const header = (
    <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 break-words">
          {greeting()}, {name} <span aria-hidden="true">👋</span> {/* design-audit-allow: greeting per product spec */}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Construction project overview and financial summary for your sites.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:flex-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder="Search sites..."
            aria-label="Search sites"
            className="input pl-9 w-full sm:w-52"
          />
        </div>
        <Link
          to="/profile"
          title="Profile"
          aria-label="Profile"
          className="w-10 h-10 shrink-0 rounded-full bg-primary-100 text-primary-700 font-semibold flex items-center justify-center hover:bg-primary-200 transition-colors"
        >
          {initial}
        </Link>
        <button type="button" onClick={() => navigate('/sites/create')} className="btn btn-primary">
          <Plus className="w-4 h-4" aria-hidden="true" /> Add New Site
        </button>
      </div>
    </header>
  );

  // ---- True empty account: no sites at all ---------------------------------
  if (stats.total === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="card">
          <EmptyState
            icon={
              <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            title="No Sites Yet"
            description="Create your first construction site to start tracking projects, expenses and payments."
            action={
              <button type="button" className="btn btn-primary" onClick={() => navigate('/sites/create')}>
                <Plus className="w-4 h-4" aria-hidden="true" /> Add New Site
              </button>
            }
          />
        </div>
      </div>
    );
  }
  // ---- Derived display values. Percentages only divide backend numbers. -----
  const hasValue = Number(fin.projectValue) > 0;
  const receivedPct = pctOf(fin.totalReceived, fin.projectValue);
  const pendingPct = pctOf(fin.pendingReceivable, fin.projectValue);
  const paidPct = pctOf(fin.totalPaid, fin.totalInvestment);

  const statCards = [
    { label: 'Total Sites', value: stats.total || 0, sub: `${fin.siteCount || sites.length} in active portfolio`, Icon: Building2, tone: 'bg-primary-50 text-primary-600' },
    { label: 'Active Sites', value: stats.active || 0, sub: stats.total ? `${pctOf(stats.active, stats.total)}% of all sites` : 'No sites yet', Icon: HardHat, tone: 'bg-success-50 text-success-600' },
    { label: 'Completed', value: stats.completed || 0, sub: 'Finished & handed over', Icon: CheckCircle2, tone: 'bg-success-50 text-success-600' },
    { label: 'On Hold', value: stats.onHold || 0, sub: stats.onHold > 0 ? 'Needs your attention' : 'Nothing on hold', Icon: PauseCircle, tone: 'bg-warning-50 text-warning-600' },
  ];

  const finCards = [
    { label: 'Total Project Value', value: f(fin.projectValue), desc: hasValue ? `${fin.siteCount || sites.length} sites · area × rate` : 'No project value yet', Icon: Building2, tone: 'bg-primary-50 text-primary-600' },
    { label: 'Total Investment', value: f(fin.totalInvestment), desc: Number(fin.totalInvestment) > 0 ? `${paidPct}% paid · ${f(fin.totalPaid)}` : 'No investment recorded', bar: Number(fin.totalInvestment) > 0 ? { p: paidPct, c: C.amber } : null, Icon: Wallet, tone: 'bg-primary-50 text-primary-600' },
    { label: 'Payments Received', value: f(fin.totalReceived), desc: hasValue ? `${receivedPct}% collected` : 'No project value yet', bar: hasValue ? { p: receivedPct, c: C.green } : null, Icon: Banknote, tone: 'bg-success-50 text-success-600' },
    { label: 'Pending Payments', value: f(fin.pendingReceivable), desc: hasValue ? `${pendingPct}% pending` : 'No project value yet', bar: hasValue ? { p: pendingPct, c: C.red } : null, Icon: AlertTriangle, tone: 'bg-danger-50 text-danger-600' },
    { label: 'Estimated Profit', value: f(fin.estimatedProfit), desc: hasValue ? `${fin.profitMargin ?? 0}% margin` : 'No project value yet', Icon: TrendingUp, tone: 'bg-slate-100 text-slate-700' },
  ];

  const statusDonut = stats.total > 0 ? [
    { name: 'Active', value: stats.active || 0, color: C.blue },
    { name: 'Completed', value: stats.completed || 0, color: C.green },
    { name: 'On Hold', value: stats.onHold || 0, color: C.amber },
    { name: 'Planned', value: stats.planned || 0, color: C.violet },
    { name: 'Closed', value: stats.closed || 0, color: C.gray },
  ].filter((x) => x.value > 0) : [];

  const investmentRows = [
    { name: 'Materials', value: Number(fin.materialCost) || 0, color: C.blue },
    { name: 'Workers', value: Number(fin.workerCost) || 0, color: C.amber },
    { name: 'Vendors', value: Number(fin.vendorCost) || 0, color: C.violet },
    { name: 'Other Expenses', value: Number(fin.otherExpenses) || 0, color: C.gray },
  ].filter((x) => x.value > 0);
  const investmentTotal = Number(fin.totalInvestment) || investmentRows.reduce((a, r) => a + r.value, 0);

  const paymentSlices = [
    { name: 'Received', value: Number(fin.totalReceived) || 0, color: C.green },
    { name: 'Pending', value: Number(fin.pendingReceivable) || 0, color: C.red },
  ].filter((x) => x.value > 0);
  const paymentTotal = (Number(fin.totalReceived) || 0) + (Number(fin.pendingReceivable) || 0);

  const perfData = [
    { name: 'Project Value', value: Number(fin.projectValue) || 0, color: C.blue },
    { name: 'Investment', value: Number(fin.totalInvestment) || 0, color: C.amber },
    { name: 'Received', value: Number(fin.totalReceived) || 0, color: C.green },
    { name: 'Pending', value: Number(fin.pendingReceivable) || 0, color: C.red },
    { name: 'Est. Profit', value: Number(fin.estimatedProfit) || 0, color: C.navy },
  ];
  const perfEmpty = perfData.every((d) => !d.value);

  const activeSites = sites.filter((s) => s.status === 'Active').slice(0, 4);
  const inProgress = sites.filter(
    (s) => s.status !== 'Completed' && s.overallProgress !== undefined && s.overallProgress !== null
  );
  const overallProgress = inProgress.length
    ? Math.round(inProgress.reduce((a, s) => a + (Number(s.overallProgress) || 0), 0) / inProgress.length)
    : 0;
  const siteValue = (s) => (Number(s.totalArea) || 0) * (Number(s.ratePerArea) || 0);
  return (
    <div className="space-y-6">
      {header}

      {/* ---- Top statistics ------------------------------------------------- */}
      <section aria-label="Site statistics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{c.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{c.value}</p>
                <p className="text-xs text-gray-500 mt-1.5 truncate">{c.sub}</p>
              </div>
              <span className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${c.tone}`}>
                <c.Icon className="w-5 h-5" aria-hidden="true" />
              </span>
            </div>
          </div>
        ))}
      </section>

      {/* ---- Financial overview --------------------------------------------- */}
      <section aria-label="Financial overview">
        <SectionHead title="Financial Overview" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {finCards.map((c) => (
            <div key={c.label} className="card hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 truncate">{c.label}</p>
                <span className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${c.tone}`}>
                  <c.Icon className="w-4 h-4" aria-hidden="true" />
                </span>
              </div>
              <p className="text-xl font-bold text-gray-900 mt-2">{c.value}</p>
              {c.bar ? (
                <>
                  <ProgressBar value={c.bar.p} color={c.bar.c} className="h-1.5 mt-2.5" />
                  <p className="text-xs text-gray-500 mt-1.5">{c.desc}</p>
                </>
              ) : (
                <p className="text-xs text-gray-500 mt-2">{c.desc}</p>
              )}
            </div>
          ))}
        </div>
      </section>
      {/* ---- Active projects ------------------------------------------------ */}
      <section aria-label="Active projects" className="card">
        <SectionHead
          title="Active Projects"
          action={
            <Link to="/sites" className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1">
              View All Sites <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          }
        />
        {projectsLoading && activeSites.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4">
                <Skel className="h-5 w-40" /><Skel className="h-3 w-32 mt-2" />
                <Skel className="h-4 w-full mt-4" /><Skel className="h-4 w-3/4 mt-2" />
                <Skel className="h-8 w-full mt-4" />
              </div>
            ))}
          </div>
        ) : activeSites.length === 0 ? (
          <EmptyBox
            title="No active projects"
            description="Sites with status Active appear here with their financials and progress."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSites.map((s) => {
              const sum = siteSummaries[s._id];
              const progress = Number(s.overallProgress) || 0;
              return (
                <div key={s._id} className="border border-gray-100 rounded-xl p-4 hover:border-primary-200 hover:shadow-sm transition-all bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{s.siteName}</p>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span>Client: {s.ownerName}</span>
                        {s.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" aria-hidden="true" /> {s.city}
                          </span>
                        )}
                      </p>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>

                  <div className="mt-3 space-y-0.5">
                    <MoneyRow label="Project Value" value={f(sum?.projectValue ?? siteValue(s))} />
                    {sum && <MoneyRow label="Investment" value={f(sum.totalInvestment)} />}
                    {sum && <MoneyRow label="Received" value={f(sum.totalReceived)} cls="text-success-600" />}
                    {sum && <MoneyRow label="Pending" value={f(sum.pendingReceivable)} cls="text-danger-600" />}
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Project Progress</span>
                      <span className="font-semibold text-gray-700">{progress}%</span>
                    </div>
                    <ProgressBar value={progress} color={progress >= 100 ? C.green : C.blue} />
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Link to={`/sites/${s._id}`} className="btn btn-primary btn-sm flex-1">View Site</Link>
                    <Link to={`/sites/${s._id}?tab=reports`} className="btn btn-secondary btn-sm flex-1">View Report</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {/* ---- Site progress + Investment breakdown --------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card" aria-label="Site progress">
          <SectionHead title="Site Progress" />
          {inProgress.length === 0 ? (
            <EmptyBox
              title="No in-progress sites"
              description="Set a site to Active and record progress to see it here."
            />
          ) : (
            <>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700">Overall Project Progress</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Average of {inProgress.length} in-progress site{inProgress.length === 1 ? '' : 's'}
                  </p>
                </div>
                <p className="text-3xl font-bold text-gray-900">{overallProgress}%</p>
              </div>
              <ProgressBar value={overallProgress} color={C.green} className="h-2.5 mt-3" />
              <div className="mt-5 pt-4 border-t border-gray-100 space-y-3">
                {inProgress.slice(0, 5).map((s) => (
                  <div key={s._id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-600 truncate mr-2">{s.siteName}</span>
                      <span className="font-medium text-gray-700 shrink-0">{Number(s.overallProgress) || 0}%</span>
                    </div>
                    <ProgressBar value={Number(s.overallProgress) || 0} />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="card" aria-label="Investment breakdown">
          <SectionHead title="Investment Breakdown" />
          {investmentRows.length === 0 ? (
            <EmptyBox
              title="No investment recorded yet"
              description="Material, vendor, worker and expense entries are totalled here."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={investmentRows} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
                      {investmentRows.map((e) => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                    <Tooltip {...TOOLTIP} formatter={(v) => f(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <DonutCenter big={fc(investmentTotal)} small="Total" />
              </div>
              <div>
                {investmentRows.map((r) => (
                  <div key={r.name} className="flex items-center justify-between gap-2 py-1.5 text-sm border-b border-dashed border-gray-100 last:border-0">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="truncate text-gray-600">{r.name}</span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="font-semibold text-gray-900">{f(r.value)}</span>
                      <span className="text-xs text-gray-400 ml-1.5">{pctOf(r.value, investmentTotal)}%</span>
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 text-sm">
                  <span className="font-medium text-gray-700">Total Investment</span>
                  <span className="font-bold text-gray-900">{f(investmentTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
      {/* ---- Payment status + Financial performance ------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card" aria-label="Payment status">
          <SectionHead title="Payment Status" />
          {paymentTotal <= 0 ? (
            <EmptyBox
              title="No payment data yet"
              description="Receipts recorded against a site appear here."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div className="relative h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentSlices} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={2} stroke="none">
                      {paymentSlices.map((e) => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                    <Tooltip {...TOOLTIP} formatter={(v) => f(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <DonutCenter big={`${receivedPct}%`} small="Received" />
              </div>
              <div>
                <MoneyRow label="Payments Received" value={f(fin.totalReceived)} cls="text-success-600" />
                <MoneyRow label="Pending Payments" value={f(fin.pendingReceivable)} cls="text-danger-600" />
                <MoneyRow label="Total Project Value" value={f(fin.projectValue)} />
                <div className="mt-3">
                  <div className="flex h-2 rounded-full overflow-hidden bg-gray-100" aria-hidden="true">
                    <div style={{ width: `${receivedPct}%`, backgroundColor: C.green }} />
                    <div style={{ width: `${pendingPct}%`, backgroundColor: C.red }} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    <span className="font-medium text-success-600">{receivedPct}% Received</span>
                    {' · '}
                    <span className="font-medium text-danger-600">{pendingPct}% Pending</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="card" aria-label="Financial performance">
          <SectionHead title="Financial Performance" />
          {perfEmpty ? (
            <EmptyBox
              title="No financial data yet"
              description="Values appear once sites, payments and costs are recorded."
            />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perfData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={54}
                  />
                  <YAxis tickFormatter={(v) => compact(v)} tick={AXIS} tickLine={false} axisLine={false} width={48} />
                  <Tooltip {...TOOLTIP} formatter={(v) => f(v)} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {perfData.map((e) => <Cell key={e.name} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
      {/* ---- Sites overview + Recent activities ----------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="card" aria-label="Sites overview">
          <SectionHead title="Sites Overview" />
          {statusDonut.length === 0 ? (
            <EmptyBox title="No sites yet" />
          ) : (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDonut} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72} paddingAngle={2} stroke="none">
                      {statusDonut.map((e) => <Cell key={e.name} fill={e.color} />)}
                    </Pie>
                    <Tooltip {...TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3 text-sm">
                {statusDonut.map((c) => (
                  <span key={c.name} className="inline-flex items-center gap-1.5 text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name} <span className="font-semibold text-gray-900">{c.value}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="card" aria-label="Recent site activities">
          <SectionHead
            title="Recent Site Activities"
            action={
              <Link to="/activities" className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1">
                View All <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            }
          />
          {activity.loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skel className="w-8 h-8 rounded-lg" />
                  <div className="flex-1"><Skel className="h-3.5 w-2/3" /><Skel className="h-3 w-1/3 mt-1.5" /></div>
                </div>
              ))}
            </div>
          ) : activity.items.length === 0 ? (
            <EmptyBox
              title="No activities recorded yet"
              description="Daily site work logs recorded by your team will appear here."
            />
          ) : (
            <div>
              {activity.items.map((a) => (
                <div key={a._id} className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0">
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-primary-50 text-primary-600 flex items-center justify-center">
                    <CalendarCheck className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.workDescription || 'Site activity'}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {activity.siteNames[a.site] || 'Site'} · {dateFmt(a.date)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-gray-900">{f(a.todayExpense)}</p>
                    <p className="text-[11px] text-gray-400">{Number(a.workersPresent) || 0} workers</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {/* ---- Recent sites --------------------------------------------------- */}
      <section className="card" aria-label="Recent sites">
        <SectionHead
          title="Recent Sites"
          action={
            <Link to="/sites" className="text-sm font-medium text-primary-600 hover:text-primary-700 inline-flex items-center gap-1">
              View All Sites <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          }
        />
        {sites.length === 0 ? (
          <EmptyBox title="No sites yet" description="Create your first construction site to get started." />
        ) : (
          <>
            {/* Desktop / tablet: compact table */}
            <div className="hidden sm:block table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Client</th>
                    <th>Location</th>
                    <th className="text-right">Project Value</th>
                    <th className="w-44">Progress</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.slice(0, 6).map((s) => (
                    <tr key={s._id} className="hover:bg-gray-50">
                      <td className="font-medium text-gray-900">{s.siteName}</td>
                      <td className="text-gray-600">{s.ownerName}</td>
                      <td className="text-gray-600">{s.city || '-'}</td>
                      <td className="text-right font-medium">{f(siteValue(s))}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <ProgressBar value={Number(s.overallProgress) || 0} />
                          <span className="text-xs text-gray-500 w-9 text-right shrink-0">{Number(s.overallProgress) || 0}%</span>
                        </div>
                      </td>
                      <td><StatusBadge status={s.status} /></td>
                      <td className="text-right">
                        <Link to={`/sites/${s._id}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap">View <ArrowRight size={14} aria-hidden="true" /></Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards instead of a squeezed table */}
            <div className="sm:hidden space-y-3">
              {sites.slice(0, 6).map((s) => (
                <div key={s._id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-900 truncate">{s.siteName}</p>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {s.ownerName}{s.city ? ` · ${s.city}` : ''}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 mt-2">{f(siteValue(s))}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <ProgressBar value={Number(s.overallProgress) || 0} />
                    <span className="text-xs text-gray-500 w-9 text-right shrink-0">{Number(s.overallProgress) || 0}%</span>
                  </div>
                  <Link to={`/sites/${s._id}`} className="btn btn-secondary btn-sm w-full mt-3">View Site</Link>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};









