import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, SearchInput, Pagination, StatusBadge } from '../../components/UI';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';

export const AllSites = () => {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  useEffect(() => {
    api.get('/admin/sites', { params: { page, limit: 15, search: search || undefined, status: status || undefined } })
      .then(({ data }) => { setSites(data.data.sites || []); setPagination(data.data.pagination); })
      .catch(() => toast.error('Failed to load sites'))
      .finally(() => setLoading(false));
  }, [page, search, status]);

  const f = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

  return (
    <div className="space-y-6">
      <PageHeader title="All Construction Sites" subtitle="View all sites across the platform" />
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
          sites.length === 0 ? <div className="empty-state py-12"><p className="text-gray-500">No sites found</p></div> :
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Site Name</th><th>Owner</th><th>Engineer</th><th>Location</th><th className="text-right">Value</th><th>Status</th><th>Progress</th></tr></thead>
              <tbody>
                {sites.map(s => (
                  <tr key={s._id}>
                    <td><Link to={`/sites/${s._id}`} className="font-medium text-primary-600 hover:underline">{s.siteName}</Link></td>
                    <td className="text-gray-600">{s.ownerName}</td>
                    <td className="text-gray-600">{s.engineer?.name || '-'}</td>
                    <td className="text-gray-600">{s.city}, {s.state}</td>
                    <td className="text-right font-medium">{f(s.totalArea * s.ratePerArea)}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td><div className="flex items-center gap-2"><div className="w-20 bg-gray-200 rounded-full h-2"><div className="bg-primary-500 h-2 rounded-full" style={{ width: `${s.overallProgress || 0}%` }}></div></div><span className="text-sm text-gray-500">{s.overallProgress || 0}%</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        }
        {pagination.totalPages > 1 && <Pagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} onPageChange={setPage} />}
      </div>
    </div>
  );
};
