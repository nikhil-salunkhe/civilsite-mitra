import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, StatusBadge, ConfirmDialog, EmptyState } from '../../components/UI';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const STATUS_ACTIONS = [
  { status: 'ACTIVE', label: 'Activate', className: 'btn-success', confirm: 'Activate this engineer account? The engineer will regain full access.' },
  { status: 'SUSPENDED', label: 'Suspend', className: 'btn-warning', confirm: 'Suspend this engineer? The engineer will immediately lose access on the next API call.' },
  { status: 'BLOCKED', label: 'Block', className: 'btn-danger', confirm: 'Block this engineer? The engineer will not be able to log in at all.' },
];

export const EngineerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [engineer, setEngineer] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const fetchDetail = async () => {
    try {
      const { data } = await api.get(`/admin/engineers/${id}`);
      setEngineer(data.data);
    } catch {
      toast.error('Failed to load engineer');
    } finally {
      setLoading(false);
    }
  };

  const fetchSites = async () => {
    try {
      const { data } = await api.get('/admin/sites', { params: { engineerId: id, limit: 50 } });
      setSites(data.data.sites || []);
    } catch {
      /* sites list is non-critical for the detail view */
    }
  };

  useEffect(() => {
    fetchDetail();
    fetchSites();
  }, [id]);

  const handleStatusChange = async () => {
    const target = confirmAction;
    setConfirmAction(null);
    try {
      await api.patch(`/admin/engineers/${id}/status`, { status: target.status });
      toast.success(`Engineer ${target.status.toLowerCase()} successfully`);
      fetchDetail();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleResetPassword = async () => {
    try {
      const { data } = await api.post(`/admin/engineers/${id}/reset-password`, {
        password: newPassword || undefined,
      });
      toast.success('Password reset. Share the temporary password with the engineer.');
      setNewPassword(data.temporaryPassword || data.data?.temporaryPassword || '');
      fetchDetail();
    } catch {
      toast.error('Failed to reset password');
    }
  };

  const handleDelete = async () => {
    setConfirmAction(null);
    try {
      await api.delete(`/admin/engineers/${id}`);
      toast.success('Engineer deleted permanently');
      navigate('/admin/engineers');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete engineer');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="spinner w-8 h-8"></div></div>;
  }

  if (!engineer) {
    return (
      <EmptyState
        title="Engineer not found"
        description="This account does not exist."
        action={<button onClick={() => navigate('/admin/engineers')} className="btn btn-primary">Back to Engineers</button>}
      />
    );
  }

  const fin = engineer.financials || {};
  const address = engineer.address || {};

  const stats = [
    { label: 'Total Sites', value: engineer.siteCount ?? 0 },
    { label: 'Total Project Value', value: fmt(fin.projectValue) },
    { label: 'Total Investment', value: fmt(fin.totalInvestment) },
    { label: 'Total Received', value: fmt(fin.totalReceived) },
    { label: 'Pending Receivable', value: fmt(fin.pendingReceivable) },
    { label: 'Estimated Profit', value: fmt(fin.estimatedProfit) },
    { label: 'Profit Margin', value: `${fin.profitMargin || 0}%` },
    { label: 'Outstanding Payable', value: fmt(fin.outstandingPayable) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={engineer.name}
        subtitle={`${engineer.company || 'Independent'} • ${engineer.email}`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => navigate(`/admin/engineers/${id}/edit`)} className="btn btn-primary">Edit</button>
            <button onClick={() => navigate('/admin/engineers')} className="btn btn-secondary">Back to List</button>
          </div>
        }
      />

      {/* Profile + actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h3 className="card-title mb-4">Engineer Profile</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div><dt className="text-gray-500">Full Name</dt><dd className="font-medium">{engineer.name}</dd></div>
            <div><dt className="text-gray-500">Email (Login ID)</dt><dd className="font-medium">{engineer.email}</dd></div>
            <div><dt className="text-gray-500">Mobile</dt><dd className="font-medium">{engineer.mobile}</dd></div>
            <div><dt className="text-gray-500">Company</dt><dd className="font-medium">{engineer.company || '—'}</dd></div>
            <div><dt className="text-gray-500">Account Status</dt><dd><StatusBadge status={engineer.status} /></dd></div>
            <div><dt className="text-gray-500">Account Created</dt><dd className="font-medium">{fmtDate(engineer.createdAt)}</dd></div>
            <div><dt className="text-gray-500">Last Login</dt><dd className="font-medium">{engineer.lastLogin ? fmtDate(engineer.lastLogin) : 'Never'}</dd></div>
            <div>
              <dt className="text-gray-500">Address</dt>
              <dd className="font-medium">{[address.street, address.city, address.state].filter(Boolean).join(', ') || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h3 className="card-title mb-4">Account Actions</h3>
          <div className="space-y-2">
            {STATUS_ACTIONS.map((action) => (
              <button
                key={action.status}
                disabled={engineer.status === action.status}
                onClick={() => setConfirmAction(action)}
                className={`btn ${action.className} w-full`}
              >
                {action.label}
              </button>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <label className="label">Reset Password</label>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                className="input flex-1"
                placeholder="Leave empty to auto-generate"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button onClick={handleResetPassword} className="btn btn-primary">Reset</button>
            </div>
            {newPassword && (
              <button
                onClick={() => { navigator.clipboard.writeText(newPassword); toast.success('Password copied'); }}
                className="btn btn-secondary btn-sm w-full mt-2"
              >
                Copy Temporary Password
              </button>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={() =>
                setConfirmAction({
                  type: 'delete',
                  label: 'Delete',
                  confirm: `Permanently delete ${engineer.name} and all of their sites, payments, workers, materials, vendors, expenses and documents? This cannot be undone.`,
                })
              }
              className="btn btn-danger w-full"
            >
              Delete Engineer
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="dashboard-card">
            <p className="dashboard-card-label">{s.label}</p>
            <p className="dashboard-card-value">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Engineer's sites */}
      <div className="card">
        <h3 className="card-title mb-4">Engineer's Sites ({sites.length})</h3>
        {sites.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No sites created by this engineer yet.</div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Site Name</th>
                  <th>Owner</th>
                  <th>Location</th>
                  <th className="text-right">Project Value</th>
                  <th>Status</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site._id} className="hover:bg-gray-50">
                    <td className="font-medium text-gray-900">{site.siteName}</td>
                    <td className="text-gray-600">{site.ownerName}</td>
                    <td className="text-gray-600">{site.city}</td>
                    <td className="text-right font-medium">{fmt(site.totalArea * site.ratePerArea)}</td>
                    <td><StatusBadge status={site.status} /></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div className="bg-primary-500 h-2" style={{ width: `${site.overallProgress || 0}%` }}></div>
                        </div>
                        <span className="text-sm text-gray-500">{site.overallProgress || 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmAction?.type === 'delete' ? handleDelete : handleStatusChange}
        title={confirmAction ? `${confirmAction.label} Engineer` : ''}
        message={confirmAction ? confirmAction.confirm : ''}
        confirmText={confirmAction?.label}
        isDangerous={confirmAction?.type === 'delete' || confirmAction?.status === 'BLOCKED'}
      />
    </div>
  );
};
