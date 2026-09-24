import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, StatusBadge } from '../../components/UI';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];

export const EngineerDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/sites/summary')
      .then(({ data: d }) => setData(d.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const f = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  if (loading) return <div className="flex justify-center py-12"><div className="spinner w-8 h-8"></div></div>;

  const chartData = data?.sites?.length > 0 ? [
    { name: 'Active', value: data?.stats?.active || 0, color: COLORS[0] },
    { name: 'Completed', value: data?.stats?.completed || 0, color: COLORS[1] },
    { name: 'On Hold', value: data?.stats?.onHold || 0, color: COLORS[2] },
    { name: 'Planned', value: data?.stats?.planned || 0, color: COLORS[3] },
  ] : [];

  // Spec section 9 chart series - visualized only; all numbers come from the
  // backend financial service via /sites/summary (never recomputed here).
  const fin = data?.financials || {};
  const investmentChart = [
    { name: 'Materials', value: fin.materialCost || 0, color: '#3b82f6' },
    { name: 'Workers', value: fin.workerCost || 0, color: '#f59e0b' },
    { name: 'Vendors', value: fin.vendorCost || 0, color: '#8b5cf6' },
    { name: 'Other', value: fin.otherExpenses || 0, color: '#6b7280' },
  ].filter((x) => x.value > 0);
  const paymentChart = [
    { name: 'Received', value: fin.totalReceived || 0, color: '#22c55e' },
    { name: 'Pending', value: fin.pendingReceivable || 0, color: '#ef4444' },
  ].filter((x) => x.value > 0);
  const profitChart = [
    { name: 'Value', value: fin.projectValue || 0 },
    { name: 'Investment', value: fin.totalInvestment || 0 },
    { name: 'Profit', value: fin.estimatedProfit || 0 },
  ];
  const progressChart = (fin.sites || data?.sites || []).slice(0, 6).map((s) => ({
    name: String(s.siteName || '').slice(0, 12),
    progress: s.overallProgress || 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Engineer Dashboard" subtitle={`Welcome back, ${data?.user?.name || 'Engineer'}`} actions={
        <button onClick={() => navigate('/sites/create')} className="btn btn-primary">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add New Site
        </button>
      } />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Sites', value: data?.stats?.total || 0, icon: '🏗️', color: 'bg-blue-50 text-blue-600' },
          { label: 'Running', value: data?.stats?.active || 0, icon: '▶️', color: 'bg-green-50 text-green-600' },
          { label: 'Completed', value: data?.stats?.completed || 0, icon: '✅', color: 'bg-primary-50 text-primary-600' },
          { label: 'On Hold', value: data?.stats?.onHold || 0, icon: '⏸️', color: 'bg-yellow-50 text-yellow-600' },
        ].map((c, i) => <div key={i} className="dashboard-card"><div className={`dashboard-card-icon ${c.color}`}><span className="text-2xl">{c.icon}</span></div><p className="dashboard-card-value">{c.value}</p><p className="dashboard-card-label">{c.label}</p></div>)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Project Value', value: f(data?.financials?.projectValue), color: 'border-l-4 border-l-primary-500' },
          { label: 'Total Investment', value: f(data?.financials?.totalInvestment), color: 'border-l-4 border-l-warning-500' },
          { label: 'Payments Received', value: f(data?.financials?.totalReceived), color: 'border-l-4 border-l-success-500' },
          { label: 'Pending Payments', value: f(data?.financials?.pendingReceivable), color: 'border-l-4 border-l-danger-500' },
          { label: 'Estimated Profit', value: f(data?.financials?.estimatedProfit), color: 'border-l-4 border-l-secondary-500' },
        ].map((item, i) => <div key={i} className={`dashboard-card ${item.color}`}><p className="text-sm text-gray-500 mb-1">{item.label}</p><p className="text-xl font-bold">{item.value}</p></div>)}
      </div>

      {/* Spec section 9: Investment, Payment Status, Profit Overview, Site Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="card-title mb-3">Investment Breakdown</h3>
          {investmentChart.length ? (
            <React.Fragment>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={investmentChart} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value">
                      {investmentChart.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => f(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-2 text-xs">
                {investmentChart.map((c) => (
                  <div key={c.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }}></div>
                    {c.name}: {f(c.value)}
                  </div>
                ))}
              </div>
            </React.Fragment>
          ) : <div className="h-52 flex items-center justify-center text-gray-400">No investment recorded yet</div>}
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Payment Status</h3>
          {paymentChart.length ? (
            <React.Fragment>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentChart} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value">
                      {paymentChart.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => f(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-2 text-xs">
                {paymentChart.map((c) => (
                  <div key={c.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }}></div>
                    {c.name}: {f(c.value)}
                  </div>
                ))}
              </div>
            </React.Fragment>
          ) : <div className="h-52 flex items-center justify-center text-gray-400">No payments recorded yet</div>}
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Profit Overview</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profitChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => f(v)} />
                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title mb-3">Site Progress</h3>
          {progressChart.length ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progressChart} layout="vertical" margin={{ left: 0, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="progress" fill="#22c55e" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="h-56 flex items-center justify-center text-gray-400">No sites yet</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="card-title mb-4">Sites Overview</h3>
          {chartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">{chartData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="h-64 flex items-center justify-center text-gray-400">No sites yet</div>}
          <div className="flex flex-wrap justify-center gap-4 mt-4 text-sm">{chartData.map(c => <div key={c.name} className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }}></div>{c.name}: {c.value}</div>)}</div>
        </div>

        <div className="card">
          <h3 className="card-title mb-4">Recent Sites</h3>
          {data?.sites?.length > 0 ? (
            <div className="space-y-4">
              {data.sites.slice(0, 5).map(site => (
                <div key={site._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Link to={`/sites/${site._id}`} className="font-medium text-primary-600 hover:underline">{site.siteName}</Link>
                    <p className="text-sm text-gray-500">{site.ownerName} - {site.city}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{f(site.totalArea * site.ratePerArea)}</p>
                    <StatusBadge status={site.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="text-center py-8 text-gray-500">No sites yet. Create your first site!</div>}
          {data?.sites?.length > 0 && data.sites.length > 5 && (
            <button onClick={() => navigate('/sites')} className="btn btn-secondary w-full mt-4">View All Sites</button>
          )}
        </div>
      </div>
    </div>
  );
};
