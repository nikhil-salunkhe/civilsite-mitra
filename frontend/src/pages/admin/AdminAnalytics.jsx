import React, { useState, useEffect } from 'react';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader } from '../../components/UI';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const compact = (v) => new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v);
const PIE_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#6b7280'];

/**
 * Admin Analytics (spec section 39) - platform-wide charts built from the
 * existing /admin/reports + /admin/dashboard endpoints (no money logic here).
 */
export const AdminAnalytics = () => {
  const [reports, setReports] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/admin/reports'), api.get('/admin/dashboard')])
      .then(([r, d]) => { setReports(r.data.data); setDashboard(d.data.data); })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><div className="spinner w-8 h-8"></div></div>;
  if (!reports || !dashboard) return <div className="card text-center py-12 text-gray-500">Failed to load analytics. Please try again.</div>;

  const t = reports.totals || {};
  const eng = dashboard.engineers || {};
  const statusColors = { Active: '#22c55e', 'On Hold': '#f59e0b', Planned: '#3b82f6', Completed: '#8b5cf6', Closed: '#6b7280' };
  const siteStatusData = (reports.sitesByStatus || []).map((s) => ({ name: s.status, value: s.count, color: statusColors[s.status] || '#94a3b8' }));
  const engineerStatusData = [
    { name: 'Active', value: eng.active || 0, color: '#22c55e' },
    { name: 'Suspended', value: eng.suspended || 0, color: '#f59e0b' },
    { name: 'Blocked', value: eng.blocked || 0, color: '#ef4444' },
    { name: 'Inactive', value: eng.inactive || 0, color: '#6b7280' },
  ].filter((e) => e.value > 0);
  const investmentData = [
    { name: 'Materials', value: t.materialCost || 0 },
    { name: 'Workers', value: t.workerCost || 0 },
    { name: 'Vendors', value: t.vendorCost || 0 },
    { name: 'Other', value: t.otherExpenses || 0 },
  ].filter((x) => x.value > 0);
  const topEngineers = (reports.engineers || []).slice(0, 8).map((e) => ({
    name: String(e.name || '?').split(' ')[0], value: e.projectValue || 0,
  }));

  const PieCard = ({ title, data, isMoney }) => (
    <div className="card">
      <h3 className="card-title mb-3">{title}</h3>
      {data.length ? (
        <React.Fragment>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value">
                  {data.map((e, i) => <Cell key={i} fill={e.color || PIE_COLORS[i % 4]} />)}
                </Pie>
                <Tooltip formatter={(v) => (isMoney ? fmt(v) : v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-2 text-xs">
            {data.map((c) => (
              <div key={c.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color || PIE_COLORS[0] }}></div>
                {c.name}: {isMoney ? fmt(c.value) : c.value}
              </div>
            ))}
          </div>
        </React.Fragment>
      ) : <div className="h-52 flex items-center justify-center text-gray-400">No data yet</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" subtitle="Platform-wide visual analytics" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Engineers', value: eng.total || 0 },
          { label: 'Total Sites', value: t.totalSites || 0 },
          { label: 'Project Value', value: fmt(t.projectValue) },
          { label: 'Estimated Profit', value: fmt(t.estimatedProfit) },
        ].map((c) => (
          <div key={c.label} className="dashboard-card">
            <p className="text-sm text-gray-500 mb-1">{c.label}</p>
            <p className="text-xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PieCard title="Sites by Status" data={siteStatusData} />
        <PieCard title="Engineers by Status" data={engineerStatusData} />
        <PieCard title="Investment Breakdown" data={investmentData} isMoney />
        <div className="card">
          <h3 className="card-title mb-3">Top Engineers by Project Value</h3>
          {topEngineers.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topEngineers} layout="vertical" margin={{ left: 0, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => fmt(v)} />
                  <Bar dataKey="value" fill="#2563eb" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="h-64 flex items-center justify-center text-gray-400">No data yet</div>}
        </div>
      </div>
    </div>
  );
};