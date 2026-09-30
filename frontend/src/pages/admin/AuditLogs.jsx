import React, { useState, useEffect } from 'react';
import { PageHeader, SearchInput, Pagination } from '../../components/UI';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';

export const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/admin/audit-logs', { params: { page, limit: 20, search: search || undefined } })
      .then(({ data }) => { setLogs(data.data.logs || []); setPagination(data.data.pagination); })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load logs'))
      .finally(() => setLoading(false));
  }, [page, search]);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs" subtitle="Track all admin activities and system changes" />
      <SearchInput value={search} onChange={setSearch} placeholder="Search logs..." className="max-w-md" />
      <div className="card">
        {loading ? <div className="flex justify-center py-12"><div className="spinner w-8 h-8"></div></div> :
          logs.length === 0 ? <div className="empty-state py-12"><p className="text-gray-500">No audit logs found</p></div> :
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Action</th><th>Admin</th><th>Engineer</th><th>Site</th><th>Date</th><th>Details</th></tr></thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l._id}>
                    <td><span className="font-medium text-primary-600">{l.action}</span></td>
                    <td className="text-gray-600">{l.adminName}</td>
                    <td className="text-gray-600">{l.engineerName || '-'}</td>
                    <td className="text-gray-600">{l.siteName || '-'}</td>
                    <td className="text-gray-500 text-sm">{new Date(l.createdAt).toLocaleString('en-IN')}</td>
                    <td className="text-gray-600 max-w-xs truncate">{l.description || '-'}</td>
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
