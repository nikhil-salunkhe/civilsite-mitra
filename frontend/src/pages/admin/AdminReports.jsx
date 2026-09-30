import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, StatusBadge } from '../../components/UI';

/**
 * GET /api/admin/reports with Date/Engineer/Status/Site filters (spec STEP 28).
 * Totals come from the shared financial service via the backend, so these
 * numbers always match the admin dashboard.
 */
export const AdminReports = () => {
  // Pre-seed from /admin/reports?engineerId=... ("View Reports" drill-through).
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    engineerId: searchParams.get('engineerId') || '',
    status: '',
  });
  const [data, setData] = useState(null);
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Engineer dropdown for the filter bar.
  useEffect(() => {
    api.get('/admin/engineers', { params: { limit: 100 } })
      .then(({ data: r }) => setEngineers(r.data?.engineers || r.data?.users || []))
      .catch(() => { /* filter still works without the dropdown */ });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.engineerId) params.engineerId = filters.engineerId;
    if (filters.status) params.status = filters.status;
    api.get('/admin/reports', { params })
      .then(({ data: r }) => setData(r.data))
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load reports'))
      .finally(() => setLoading(false));
  }, [filters]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const reset = () => setFilters({ from: '', to: '', engineerId: '', status: '' });
  const hasFilters = Boolean(filters.from || filters.to || filters.engineerId || filters.status);

  const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  const t = (data && data.totals) || {};
  const cards = [
    { label: 'Total Project Value', value: fmt(t.projectValue), cls: 'border-l-primary-500' },
    { label: 'Total Investment', value: fmt(t.totalInvestment), cls: 'border-l-warning-500' },
    { label: 'Total Received', value: fmt(t.totalReceived), cls: 'border-l-success-500' },
    { label: 'Total Pending', value: fmt(t.pendingReceivable), cls: 'border-l-danger-500' },
    { label: 'Estimated Profit', value: fmt(t.estimatedProfit), cls: 'border-l-secondary-500' },
  ];

  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        subtitle="System-wide business overview"
        actions={hasFilters ? <button type="button"  onClick={reset} className="btn btn-secondary">Reset Filters</button> : null}
      />

      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>From Date</label>
            <input type="date" value={filters.from} onChange={set('from')} className="input" />
          </div>
          <div>
            <label className={labelCls}>To Date</label>
            <input type="date" value={filters.to} onChange={set('to')} className="input" />
          </div>
          <div>
            <label className={labelCls}>Engineer</label>
            <select value={filters.engineerId} onChange={set('engineerId')} className="select">
              <option value="">All Engineers</option>
              {engineers.map((e) => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Site Status</label>
            <select value={filters.status} onChange={set('status')} className="select">
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="On Hold">On Hold</option>
              <option value="Planned">Planned</option>
              <option value="Completed">Completed</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="spinner w-8 h-8"></div></div>
      ) : !data ? (
        <div className="card text-center py-12 text-gray-500">Failed to load reports. Please try again.</div>
      ) : (
        <React.Fragment>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {cards.map((c) => (
              <div key={c.label} className={`dashboard-card border-l-4 ${c.cls}`}>
                <p className="text-sm text-gray-500 mb-1">{c.label}</p>
                <p className="text-xl font-bold">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {(data.sitesByStatus || []).map((s) => (
              <div key={s.status} className="card text-center">
                <p className="text-2xl font-bold text-gray-900">{s.count}</p>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{s.status}</p>
                <p className="text-sm text-gray-600 mt-1">{fmt(s.projectValue)}</p>
              </div>
            ))}
            {(data.sitesByStatus || []).length === 0 && (
              <div className="card text-center col-span-full text-gray-500">No sites match the selected filters.</div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="card-title">Engineer-wise Summary</h3>
              <span className="text-sm text-gray-500">{(data.engineers || []).length} of {data.engineersTotal} engineers</span>
            </div>
            {(data.engineers || []).length === 0 ? (
              <div className="text-center py-10 text-gray-500">No engineer data for the selected filters.</div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Engineer</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th className="text-right">Sites</th>
                      <th className="text-right">Running</th>
                      <th className="text-right">Completed</th>
                      <th className="text-right">Project Value</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.engineers.map((e) => (
                      <tr key={e.engineerId} className="hover:bg-gray-50">
                        <td className="font-medium">
                          {e.name}
                          {e.company ? <span className="block text-xs text-gray-400">{e.company}</span> : null}
                        </td>
                        <td className="text-gray-600">{e.email}</td>
                        <td><StatusBadge status={e.status} /></td>
                        <td className="text-right">{e.siteCount}</td>
                        <td className="text-right">{e.running}</td>
                        <td className="text-right">{e.completed}</td>
                        <td className="text-right font-medium">{fmt(e.projectValue)}</td>
                        <td className="text-right">
                          <Link to={`/admin/engineers/${e.engineerId}`} className="btn btn-secondary btn-sm">View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </React.Fragment>
      )}
    </div>
  );
};