import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader } from '../../components/UI';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

export const AdminDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/admin/dashboard')
      .then(({ data: response }) => setData(response.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-12"><div className="spinner w-8 h-8"></div></div>;

  const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  const eng = data?.engineers || {};
  const engineerChartData = [
    { name: 'Active', value: eng.active || 0, color: '#16a34a' },
    { name: 'Suspended', value: eng.suspended || 0, color: '#f59e0b' },
    { name: 'Blocked', value: eng.blocked || 0, color: '#dc2626' },
    { name: 'Inactive', value: eng.inactive || 0, color: '#6b7280' },
  ].filter((e) => e.value > 0);

  const financials = data?.financials || {};
  const financialChartData = [
    { name: 'Project Value', value: financials.projectValue || 0 },
    { name: 'Investment', value: financials.totalInvestment || 0 },
    { name: 'Received', value: financials.totalReceived || 0 },
    { name: 'Est. Profit', value: financials.estimatedProfit || 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Dashboard" subtitle="Platform Overview" actions={
        <button onClick={() => navigate('/admin/engineers/create')} className="btn btn-primary">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Create Engineer
        </button>
      } />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Engineers', value: data?.engineers?.total || 0, icon: '👷', color: 'bg-blue-50 text-blue-600' },
          { label: 'Active Engineers', value: data?.engineers?.active || 0, icon: '✅', color: 'bg-green-50 text-green-600' },
          { label: 'Suspended', value: data?.engineers?.suspended || 0, icon: '⏸️', color: 'bg-yellow-50 text-yellow-600' },
          { label: 'Blocked', value: data?.engineers?.blocked || 0, icon: '🚫', color: 'bg-red-50 text-red-600' },
        ].map((card, i) => (
          <div key={i} className="dashboard-card">
            <div className={`dashboard-card-icon ${card.color}`}><span className="text-2xl">{card.icon}</span></div>
            <p className="dashboard-card-value">{card.value}</p>
            <p className="dashboard-card-label">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Sites', value: data?.sites?.total || 0, icon: '🏗️', color: 'bg-primary-50 text-primary-600' },
          { label: 'Running Sites', value: data?.sites?.running || 0, icon: '▶️', color: 'bg-success-50 text-success-600' },
          { label: 'Completed', value: data?.sites?.completed || 0, icon: '🏁', color: 'bg-blue-50 text-blue-600' },
        ].map((card, i) => (
          <div key={i} className="dashboard-card">
            <div className={`dashboard-card-icon ${card.color}`}><span className="text-2xl">{card.icon}</span></div>
            <p className="dashboard-card-value">{card.value}</p>
            <p className="dashboard-card-label">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="dashboard-card border-l-4 border-l-primary-500">
          <p className="text-sm text-gray-500 mb-1">Total Project Value</p>
          <p className="text-2xl font-bold">{fmt(data?.financials?.projectValue)}</p>
        </div>
        <div className="dashboard-card border-l-4 border-l-warning-500">
          <p className="text-sm text-gray-500 mb-1">Total Investment</p>
          <p className="text-2xl font-bold">{fmt(data?.financials?.totalInvestment)}</p>
        </div>
        <div className="dashboard-card border-l-4 border-l-success-500">
          <p className="text-sm text-gray-500 mb-1">Total Received</p>
          <p className="text-2xl font-bold">{fmt(data?.financials?.totalReceived)}</p>
        </div>
        <div className="dashboard-card border-l-4 border-l-danger-500">
          <p className="text-sm text-gray-500 mb-1">Total Pending</p>
          <p className="text-2xl font-bold">{fmt(data?.financials?.pendingReceivable)}</p>
        </div>
        <div className="dashboard-card border-l-4 border-l-secondary-500">
          <p className="text-sm text-gray-500 mb-1">Estimated Profit</p>
          <p className="text-2xl font-bold">{fmt(data?.financials?.estimatedProfit)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="card-title mb-4">Engineers by Status</h3>
          {engineerChartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={engineerChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value">
                    {engineerChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="h-64 flex items-center justify-center text-gray-400">No engineers yet</div>}
          <div className="flex flex-wrap justify-center gap-4 mt-4 text-sm">
            {engineerChartData.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }}></div>
                {c.name}: {c.value}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title mb-4">Financial Overview</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financialChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v)} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
