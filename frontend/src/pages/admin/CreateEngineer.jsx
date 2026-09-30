import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, FormSection, FormGroup, FormRow } from '../../components/UI';
import { Icon } from '../../components/Icon';

const STATUSES = ['ACTIVE', 'SUSPENDED', 'BLOCKED', 'INACTIVE'];
const todayStr = () => new Date().toISOString().split('T')[0];
const genPw = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%&*';
  const b = new Uint32Array(14);
  crypto.getRandomValues(b);
  return Array.from(b, n => c[n % c.length]).join('');
};
const empty = {
  name: '', email: '', mobile: '', company: '', address: '', city: '', state: '',
  status: 'ACTIVE', accountStartDate: todayStr(), notes: '', customPassword: '',
};

export const CreateEngineer = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [origStatus, setOrigStatus] = useState('ACTIVE');
  const [created, setCreated] = useState(null); // { engineer, temporaryPassword }
  const [showPw, setShowPw] = useState(false);
  const [photo, setPhoto] = useState(null); // File selected for upload
  const [photoPreview, setPhotoPreview] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/admin/engineers/${id}`)
      .then(({ data }) => {
        const e = data.data;
        const a = e.address || {};
        setOrigStatus(e.status || 'ACTIVE');
        setForm({
          ...empty,
          name: e.name || '', email: e.email || '', mobile: e.mobile || '',
          company: e.company || '', address: a.street || '', city: a.city || '',
          state: a.state || '', status: e.status || 'ACTIVE',
          accountStartDate: e.accountStartDate ? String(e.accountStartDate).slice(0, 10) : todayStr(),
          notes: e.notes || '',
        });
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load engineer'))
      .finally(() => setFetching(false));
  }, [id, isEdit]);

  const chg = (f, v) => {
    setForm(p => ({ ...p, [f]: v }));
    if (errors[f]) setErrors(e => ({ ...e, [f]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!form.mobile.trim()) e.mobile = 'Required';
    else if (!/^\d{10}$/.test(form.mobile)) e.mobile = '10 digits';
    if (!isEdit) {
      if (!form.email.trim()) e.email = 'Required';
      else if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Invalid email';
      if (form.customPassword && form.customPassword.length < 6) e.customPassword = 'Min 6 characters';
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const toFormData = () => {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
    if (photo) fd.append('photo', photo);
    return fd;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      // multipart/form-data so the optional profile photo reaches multer;
      // explicit header overrides the instance's JSON default, and axios
      // lets the browser add the multipart boundary for FormData bodies.
      const config = { headers: { 'Content-Type': 'multipart/form-data' } };
      if (isEdit) {
        const { data: upd } = await api.put(`/admin/engineers/${id}`, toFormData(), config);
        const current = upd.data?.status || origStatus;
        if (form.status !== current) {
          await api.patch(`/admin/engineers/${id}/status`, { status: form.status });
        }
        toast.success('Engineer updated successfully');
        navigate(`/admin/engineers/${id}`);
      } else {
        const { data } = await api.post('/admin/engineers', toFormData(), config);
        setCreated({
          engineer: data.data.engineer,
          temporaryPassword: data.data.credentials.temporaryPassword,
        });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const copyCreds = () => {
    const g = created.engineer;
    const lines = [
      'CivilSiteMitra - Engineer Credentials', '',
      `Name: ${g.name}`,
      `Login ID: ${g.email}`,
      `Mobile: ${g.mobile || '-'}`,
      `Temporary Password: ${created.temporaryPassword}`,
      `Account Status: ${g.status || 'ACTIVE'}`, '',
      `Login: ${window.location.origin}/login`,
      'Note: Change the temporary password after first login.',
    ];
    navigator.clipboard.writeText(lines.join('\n'))
      .then(() => toast.success('Credentials copied'))
      .catch(() => toast.error('Copy failed'));
  };

  if (fetching) {
    return <div className="flex justify-center py-12"><div className="spinner w-8 h-8"></div></div>;
  }

  if (created) {
    return (
      <div className="max-w-2xl mx-auto">
                <div className="card text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-success-100 text-success-600 flex items-center justify-center">
            <Icon name="check" size={28} strokeWidth={2.2} />
          </div>
          <h2 className="text-xl font-semibold mt-4">Engineer Created Successfully</h2>
          <dl className="mt-6 text-left max-w-sm mx-auto space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Name</dt>
              <dd className="font-medium">{created.engineer.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Login ID</dt>
              <dd className="font-medium break-all">{created.engineer.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Temporary Password</dt>
              <dd className="font-mono font-medium">
                {showPw ? created.temporaryPassword : '********'}
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="ml-2 text-xs text-primary-600 hover:underline"
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Status</dt>
              <dd className="font-medium">{created.engineer.status || 'ACTIVE'}</dd>
            </div>
          </dl>
          <p className="text-sm text-gray-600 mt-4 max-w-md mx-auto">
            Copy these credentials and share them securely with the engineer.
            The password is hidden after this screen.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <button type="button" onClick={copyCreds} className="btn btn-primary">Copy Credentials</button>
            <button type="button" onClick={() => navigate('/admin/engineers')} className="btn btn-secondary">Go to Engineers</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
            <PageHeader
        title={isEdit ? 'Edit Engineer' : 'Create Engineer'}
        subtitle={isEdit ? 'Update engineer details and account status' : 'Create a new engineer / contractor account'}
        actions={
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/admin/engineers/${id}` : '/admin/engineers')}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        }
      />

      <form onSubmit={submit} className="space-y-6">
        <FormSection title="Personal Information">
          <FormRow>
            <FormGroup label="Full Name" required error={errors.name}>
              <input className="input" value={form.name} onChange={e => chg('name', e.target.value)} placeholder="e.g. Rahul Patil" />
            </FormGroup>
            <FormGroup label="Mobile Number" required error={errors.mobile}>
              <input className="input" value={form.mobile} onChange={e => chg('mobile', e.target.value)} placeholder="10-digit mobile" maxLength={10} />
            </FormGroup>
          </FormRow>
          <FormRow>
            <FormGroup label="Company / Business Name">
              <input className="input" value={form.company} onChange={e => chg('company', e.target.value)} placeholder="Optional" />
            </FormGroup>
            <FormGroup label="Profile Photo" hint="Image (JPG/PNG), optional">
              <input
                className="input"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  if (photoPreview) URL.revokeObjectURL(photoPreview);
                  setPhoto(f || null);
                  setPhotoPreview(f ? URL.createObjectURL(f) : '');
                }}
              />
              {photoPreview && (
                <img src={photoPreview} alt="Preview" className="mt-2 h-16 w-16 rounded-full object-cover border border-gray-200" />
              )}
            </FormGroup>
          </FormRow>
          <FormGroup label="Address">
            <input className="input" value={form.address} onChange={e => chg('address', e.target.value)} placeholder="Street address" />
          </FormGroup>
          <FormRow>
            <FormGroup label="City">
              <input className="input" value={form.city} onChange={e => chg('city', e.target.value)} />
            </FormGroup>
            <FormGroup label="State">
              <input className="input" value={form.state} onChange={e => chg('state', e.target.value)} />
            </FormGroup>
          </FormRow>
        </FormSection>

        <FormSection title="Account Information">
          <FormRow>
            <FormGroup label="Username / Email (Login ID)" required={!isEdit} error={errors.email}>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={e => chg('email', e.target.value)}
                placeholder="rahul@example.com"
                disabled={isEdit}
              />
            </FormGroup>
            <FormGroup label="Account Status" required>
              <select className="input" value={form.status} onChange={e => chg('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormGroup>
          </FormRow>

          {!isEdit && (
            <FormRow>
              <FormGroup label="Temporary Password" error={errors.customPassword}>
                <div className="flex gap-2 flex-wrap">
                  <input
                    className="input flex-1 min-w-[180px]"
                    type={showPw ? 'text' : 'password'}
                    value={form.customPassword}
                    onChange={e => chg('customPassword', e.target.value)}
                    placeholder="Leave blank to auto-generate (min 6)"
                  />
                  <button type="button" className="btn btn-secondary" onClick={() => setShowPw(v => !v)}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => { chg('customPassword', genPw()); setShowPw(true); }}
                  >
                    Generate Password
                  </button>
                </div>
              </FormGroup>
              <FormGroup label="Account Start Date">
                <input className="input" type="date" value={form.accountStartDate} onChange={e => chg('accountStartDate', e.target.value)} />
              </FormGroup>
            </FormRow>
          )}

          <FormGroup label="Notes">
            <textarea
              className="input"
              rows={3}
              value={form.notes}
              onChange={e => chg('notes', e.target.value)}
              placeholder="Internal notes (visible to admin only)"
            />
          </FormGroup>
        </FormSection>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => navigate(isEdit ? `/admin/engineers/${id}` : '/admin/engineers')}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Engineer'}
          </button>
        </div>
      </form>
    </div>
  );
};