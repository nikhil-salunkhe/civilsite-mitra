import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, SearchInput, Pagination, StatusBadge } from '../../components/UI';
import { downloadFile } from '../../utils/download';

/**
 * Engineer-wide Reports page (spec STEP 38 sidebar). Portfolio financial
 * summary from /sites/summary plus per-site PDF/Excel/CSV exports using the
 * same endpoints as the site Reports tab.
 */
export const EngineerReports = () => {
  const [summary, setSummary] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api.get('/sites/summary')
      .then(({ data: r }) => setSummary(r.data?.financials || null))
      .catch(() => { /* cards fall back to zeros */ });
  }, []);

  useEffect(() => {
    setLoading(true);
    api.get('/sites', { params: { page, limit: 10, search: search || undefined, status: status || undefined } })
      .then(({ data: r }) => { setSites(r.data.data.sites || []); setPagination(r.data.data.pagination); })
      .catch(() => toast.error('Failed to load sites'))
      .finally(() => setLoading(false));
  }, [page, search, status]);

  const f = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  const exportFile = async (site, format) => {
    const key = `${site._id}-${format}`;
    setBusy(key);
    try {
      // PDF lives at /report/pdf while Excel/CSV live at /export/*.
      const path = format === 'pdf'
        ? `/sites/${site._id}/report/pdf`
        : `/sites/${site._id}/export/${format}`;
      const ext = format === 'excel' ? 'xlsx' : format;
      await downloadFile(path, `site-report-${site._id}.${ext}`);
      toast.success(`${format.toUpperCase()} exported`);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to export ${format.toUpperCase()}`);
    } finally {
      setBusy('');
    }
  };

  const cards = [
    { label: 'Portfolio Value', value: f(summary?.projectValue), cls: 'border-l-primary-500' },
    { label: 'Total Investment', value: f(summary?.totalInvestment), cls: 'border-l-warning-500' },
    { label: 'Payments Received', value: f(summary?.totalReceived), cls: 'border-l-success-500' },
    { label: 'Pending Payments', value: f(summary?.pendingReceivable), cls: 'border-l-danger-500' },
    { label: 'Estimated Profit', value: f(summary?.estimatedProfit), cls: 'border-l-secondary-500' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Portfolio summary and site exports" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`dashboard-card border-l-4 ${c.cls}`}>
            <p className="text-sm text-gray-500 mb-1">{c.label}</p>
            <p className="text-xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput value={search} onChange={(v) => { setPage(1); setSearch(v); }} placeholder="Search sites..." className="flex-1" />
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="select w-full sm:w-48">
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="On Hold">On Hold</option>
          <option value="Completed">Completed</option>
          <option value="Planned">Planned</option>
        </select>
      </div>

      <div className="card">
        <h3 className="card-title mb-4">Site Exports</h3>
        {loading ? (
          <div className="flex justify-center py-12"><div className="spinner w-8 h-8"></div></div>
        ) : sites.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            No sites found. Create your first construction site to generate reports.
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Owner</th>
                  <th className="text-right">Project Value</th>
                  <th>Status</th>
                  <th className="text-right">Exports</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site._id} className="hover:bg-gray-50">
                    <td>
                      <Link to={`/sites/${site._id}`} className="font-medium text-primary-600 hover:text-primary-700">
                        {site.siteName}
                      </Link>
                    </td>
                    <td className="text-gray-600">{site.ownerName}</td>
                    <td className="text-right font-medium">{f((site.totalArea || 0) * (site.ratePerArea || 0))}</td>
                    <td><StatusBadge status={site.status} /></td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busy === `${site._id}-pdf`}
                          onClick={() => exportFile(site, 'pdf')}
                        >
                          {busy === `${site._id}-pdf` ? '...' : 'PDF'}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busy === `${site._id}-excel`}
                          onClick={() => exportFile(site, 'excel')}
                        >
                          {busy === `${site._id}-excel` ? '...' : 'Excel'}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busy === `${site._id}-csv`}
                          onClick={() => exportFile(site, 'csv')}
                        >
                          {busy === `${site._id}-csv` ? '...' : 'CSV'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination.totalPages > 1 && (
          <Pagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
};