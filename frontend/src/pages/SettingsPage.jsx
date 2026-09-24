import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import { PageHeader, FormSection, FormGroup, StatusBadge } from '../components/UI';

const roleLabel = (role) => (role === 'SUPER_ADMIN' ? 'Super Admin' : 'Engineer');

export const SettingsPage = () => {
  const { user, mustChangePassword, changePassword, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  const chg = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.currentPassword) e.currentPassword = 'Current password is required';
    if (!form.newPassword) e.newPassword = 'New password is required';
    else if (form.newPassword.length < 6) e.newPassword = 'Must be at least 6 characters';
    if (!form.confirmPassword) e.confirmPassword = 'Please confirm the new password';
    else if (form.newPassword !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      toast.success('Password changed successfully');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      // First-login flow: once the temporary password is replaced, continue into the app.
      if (mustChangePassword) {
        navigate(isAdmin ? '/admin/dashboard' : '/dashboard');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title="Settings" subtitle="Manage your password and account" />

      {mustChangePassword && (
        <div className="mb-6 rounded-lg border border-warning-300 bg-warning-50 p-4 text-sm text-warning-800">
          <p className="font-semibold">Temporary password detected</p>
          <p className="mt-1">
            You must change your temporary password before you can continue using CivilSiteMitra.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-6">
        <FormSection title="Change Password">
          <FormGroup label="Current Password" error={errors.currentPassword}>
            <input
              type={show ? 'text' : 'password'}
              value={form.currentPassword}
              onChange={(e) => chg('currentPassword', e.target.value)}
              className="input"
              autoComplete="current-password"
            />
          </FormGroup>
          <FormGroup label="New Password" error={errors.newPassword}>
            <input
              type={show ? 'text' : 'password'}
              value={form.newPassword}
              onChange={(e) => chg('newPassword', e.target.value)}
              className="input"
              minLength={6}
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-400 mt-1">Minimum 6 characters</p>
          </FormGroup>
          <FormGroup label="Confirm New Password" error={errors.confirmPassword}>
            <input
              type={show ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={(e) => chg('confirmPassword', e.target.value)}
              className="input"
              autoComplete="new-password"
            />
          </FormGroup>

          <label className="flex items-center gap-2 text-sm text-gray-600 mt-2">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="rounded" />
            Show passwords
          </label>
        </FormSection>

        <div className="flex justify-end pt-4 border-t">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(isAdmin ? '/admin/dashboard' : '/dashboard')}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Updating...' : 'Change Password'}
            </button>
          </div>
        </div>
      </form>

      <div className="card mt-6">
        <h3 className="card-title mb-4">Account Overview</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-gray-500">Name</dt>
            <dd className="font-medium">{user?.name || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Email (Login ID)</dt>
            <dd className="font-medium">{user?.email || '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Role</dt>
            <dd className="font-medium">{roleLabel(user?.role)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Account Status</dt>
            <dd>
              <StatusBadge status={user?.status} />
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Last Login</dt>
            <dd className="font-medium">
              {user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : '—'}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
};