import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, StatusBadge } from '../../components/UI';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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
