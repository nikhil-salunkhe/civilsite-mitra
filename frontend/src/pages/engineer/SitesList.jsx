import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, SearchInput, Pagination, StatusBadge } from '../../components/UI';

export const SitesList = () => {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  // Deep-link support: /sites?search=... lets the dashboard search box jump
  // straight here with the query pre-filled. Default behaviour is unchanged.
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/sites', { params: { page, limit: 10, search: search || undefined, status: status || undefined } })
      .then(({ data }) => { setSites(data.data.sites || []); setPagination(data.data.pagination); })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load sites'))
      .finally(() => setLoading(false));
  }, [page, search, status]);

  const f = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Construction Sites"
        subtitle="Manage your construction projects"
        actions={
          <button type="button"  onClick={() => navigate('/sites/create')} className="btn btn-primary">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add New Site
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search sites..." className="flex-1" />
        <select value={status} onChange={e => setStatus(e.target.value)} className="select w-full sm:w-48">
          <option value="">All Status</option>
          <option value="Active">Active</option>
          <option value="On Hold">On Hold</option>
          <option value="Completed">Completed</option>
          <option value="Planned">Planned</option>
        </select>
      </div>

      <div className="card">
        {loading ? <div className="flex justify-center py-12"><div className="spinner w-8 h-8"></div></div> :
          sites.length === 0 ? (
            <div className="empty-state py-12">
              <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Sites Yet</h3>
              <p className="text-gray-500 mb-4">Start managing your construction projects by creating your first site.</p>
              <button type="button"  onClick={() => navigate('/sites/create')} className="btn btn-primary">Create Your First Site</button>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Site Name</th>
                    <th>Owner</th>
                    <th>Location</th>
                    <th className="text-right">Project Value</th>
                    <th className="text-right">Investment</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map(site => (
                    <tr key={site._id} className="hover:bg-gray-50">
                      <td>
                        <Link to={`/sites/${site._id}`} className="font-medium text-primary-600 hover:text-primary-700">
                          {site.siteName}
                        </Link>
                      </td>
                      <td className="text-gray-600">{site.ownerName}</td>
                      <td className="text-gray-600">{site.city}, {site.state}</td>
                      <td className="text-right font-medium">{f(site.totalArea * site.ratePerArea)}</td>
                      <td className="text-right text-gray-500">{f(site.estimatedProjectCost || 0)}</td>
                      <td><StatusBadge status={site.status} /></td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div className="bg-primary-500 h-2 rounded-full transition-all" style={{ width: `${site.overallProgress || 0}%` }}></div>
                          </div>
                          <span className="text-sm text-gray-500 min-w-[3rem]">{site.overallProgress || 0}%</span>
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link to={`/sites/${site._id}`} className="btn btn-secondary btn-sm">View</Link>
                          <Link to={`/sites/${site._id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        {pagination.totalPages > 1 && <Pagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} onPageChange={setPage} />}
      </div>
    </div>
  );
};
