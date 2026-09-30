import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, SearchInput, Pagination, StatusBadge, ConfirmDialog } from '../../components/UI';

export const EngineersList = () => {
  const [engineers, setEngineers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('createdAt-desc');
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Any filter change resets to page 1 so users never land on a stale empty page.
  const applyFilter = (setter) => (value) => { setPage(1); setter(value); };

  const fetchEngineers = async () => {
    try {
      const [sortBy, sortOrder] = sort.split('-');
      const { data } = await api.get('/admin/engineers', {
        params: {
          page, limit: 10,
          search: search || undefined,
          status: status || undefined,
          from: from || undefined,
          to: to || undefined,
          sortBy, sortOrder,
        },
      });
      setEngineers(data.data.engineers);
      setPagination(data.data.pagination);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to load engineers'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEngineers(); }, [page, search, status, from, to, sort]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.patch(`/admin/engineers/${id}/status`, { status: newStatus });
      toast.success(`Engineer ${newStatus.toLowerCase()}`);
      fetchEngineers();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update status'); }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await api.delete(`/admin/engineers/${target._id}`);
      toast.success('Engineer deleted permanently');
      fetchEngineers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete engineer');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Engineer Management" subtitle="Manage registered engineers" actions={
        <button type="button"  onClick={() => navigate('/admin/engineers/create')} className="btn btn-primary">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Create Engineer
        </button>
      } />

      <div className="flex flex-col lg:flex-row gap-4">
        <SearchInput value={search} onChange={applyFilter(setSearch)} placeholder="Search by name, email, mobile..." className="flex-1" />
        <select value={status} onChange={(e) => applyFilter(setStatus)(e.target.value)} className="select w-full lg:w-44">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BLOCKED">Blocked</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => applyFilter(setFrom)(e.target.value)} className="input w-40" aria-label="Created from" />
          <span className="text-sm text-gray-500">to</span>
          <input type="date" value={to} onChange={(e) => applyFilter(setTo)(e.target.value)} className="input w-40" aria-label="Created to" />
        </div>
        <select value={sort} onChange={(e) => applyFilter(setSort)(e.target.value)} className="select w-full lg:w-48">
          <option value="createdAt-desc">Newest First</option>
          <option value="createdAt-asc">Oldest First</option>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-12"><div className="spinner w-8 h-8"></div></div>
        ) : engineers.length === 0 ? (
          <div className="empty-state py-12"><p className="text-gray-500">No engineers found</p></div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Engineer</th><th>Mobile</th><th>Email</th><th>Company</th>
                  <th className="text-center">Sites</th><th className="text-center">Status</th>
                  <th>Created</th><th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {engineers.map((eng) => (
                  <tr key={eng._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary-700">{eng.name?.charAt(0)}</span>
                        </div>
                        <span className="font-medium">{eng.name}</span>
                      </div>
                    </td>
                    <td className="text-gray-600">{eng.mobile}</td>
                    <td className="text-gray-600">{eng.email}</td>
                    <td className="text-gray-600">{eng.company || '-'}</td>
                    <td className="text-center">{eng.siteCount || 0}</td>
                    <td className="text-center"><StatusBadge status={eng.status} /></td>
                    <td className="text-gray-500 text-sm">{new Date(eng.createdAt).toLocaleDateString('en-IN')}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/admin/engineers/${eng._id}`} className="btn btn-secondary btn-sm">View</Link>
                        <Link to={`/admin/engineers/${eng._id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
                        <select value={eng.status} onChange={(e) => handleStatusChange(eng._id, e.target.value)} className="select w-32 text-xs">
                          <option value="ACTIVE">Activate</option>
                          <option value="SUSPENDED">Suspend</option>
                          <option value="BLOCKED">Block</option>
                          <option value="INACTIVE">Deactivate</option>
                        </select>
                        <button type="button"  onClick={() => setDeleteTarget(eng)} className="btn btn-danger btn-sm">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination.totalPages > 1 && <Pagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} onPageChange={setPage} />}
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Engineer"
        message={deleteTarget ? `Permanently delete "${deleteTarget.name}" and all of their sites, payments, workers, materials, vendors, expenses and documents? This cannot be undone.` : ''}
        confirmText="Delete"
        isDangerous
      />
    </div>
  );
};
