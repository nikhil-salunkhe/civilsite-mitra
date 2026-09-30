import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { PageHeader, FormSection, FormGroup, FormRow } from '../../components/UI';

export const CreateSite = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [loadingSite, setLoadingSite] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState({
    siteName: '', ownerName: '', ownerMobile: '', ownerEmail: '', address: '', city: '', state: '', pincode: '',
    totalArea: '', ratePerArea: '', areaUnit: 'Sq.Ft', status: 'Planned', startDate: '', expectedCompletionDate: '',
    estimatedProjectCost: '', engineerCharges: '', notes: '',
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (id) {
      setIsEdit(true);
      setLoadingSite(true);
      api.get(`/sites/${id}`).then(({ data }) => {
        // GET /sites/:id answers { data: { site, summary } }.
        const s = data.data?.site || data.data;
        setForm({ siteName: s.siteName, ownerName: s.ownerName, ownerMobile: s.ownerMobile, ownerEmail: s.ownerEmail || '', address: s.address, city: s.city, state: s.state || '', pincode: s.pincode || '', totalArea: s.totalArea.toString(), ratePerArea: s.ratePerArea.toString(), areaUnit: s.areaUnit || 'Sq.Ft', status: s.status || 'Planned', startDate: s.startDate ? new Date(s.startDate).toISOString().split('T')[0] : '', expectedCompletionDate: s.expectedCompletionDate ? new Date(s.expectedCompletionDate).toISOString().split('T')[0] : '', estimatedProjectCost: s.estimatedProjectCost?.toString() || '', engineerCharges: s.engineerCharges?.toString() || '', notes: s.notes || '' });
      }).catch((err) => toast.error(err.response?.data?.message || 'Failed to load site'))
        .finally(() => setLoadingSite(false));
    }
  }, [id]);

  const chg = (f, v) => { setForm(p => ({ ...p, [f]: v })); if (errors[f]) setErrors(e => ({ ...e, [f]: '' })); };
  const validate = () => { const e = {}; if (!form.siteName.trim()) e.siteName = 'Required'; if (!form.ownerName.trim()) e.ownerName = 'Required'; if (!form.ownerMobile.trim()) e.ownerMobile = 'Required'; else if (!/^\d{10}$/.test(form.ownerMobile)) e.ownerMobile = '10 digits'; if (!form.address.trim()) e.address = 'Required'; if (!form.city.trim()) e.city = 'Required'; if (!form.totalArea) e.totalArea = 'Required'; else if (isNaN(form.totalArea) || Number(form.totalArea) <= 0) e.totalArea = 'Valid'; if (!form.ratePerArea) e.ratePerArea = 'Required'; else if (isNaN(form.ratePerArea) || Number(form.ratePerArea) < 0) e.ratePerArea = 'Valid'; setErrors(e); return !Object.keys(e).length; };

  const submit = async (ev) => { ev.preventDefault(); if (!validate()) return; setLoading(true); try { const data = { ...form, totalArea: parseFloat(form.totalArea), ratePerArea: parseFloat(form.ratePerArea), estimatedProjectCost: form.estimatedProjectCost ? parseFloat(form.estimatedProjectCost) : 0, engineerCharges: form.engineerCharges ? parseFloat(form.engineerCharges) : 0 }; if (isEdit) { await api.put(`/sites/${id}`, data); toast.success('Updated'); } else { await api.post('/sites', data); toast.success('Created'); } navigate('/sites'); } catch (err) { toast.error(err.response?.data?.message || 'Failed'); } finally { setLoading(false); } };

  const f = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
  const calcVal = () => (parseFloat(form.totalArea) || 0) * (parseFloat(form.ratePerArea) || 0);

  // Edit mode must not flash an empty "Add New Site" form while the site loads.
  if (loadingSite) return <div className="flex justify-center py-12"><div className="spinner w-8 h-8"></div></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title={isEdit ? 'Edit Site' : 'Add New Site'} subtitle={isEdit ? 'Update details' : 'Create project'} />
      <form onSubmit={submit} className="card space-y-6">
        <FormSection title="Site Details">
          <FormGroup label="Site Name *" error={errors.siteName}><input type="text" value={form.siteName} onChange={e => chg('siteName', e.target.value)} className="input" placeholder="e.g., ABC Residence" /></FormGroup>
          <FormRow><FormGroup label="Owner Name *" error={errors.ownerName}><input type="text" value={form.ownerName} onChange={e => chg('ownerName', e.target.value)} className="input" /></FormGroup><FormGroup label="Owner Mobile *" error={errors.ownerMobile}><input type="text" value={form.ownerMobile} onChange={e => chg('ownerMobile', e.target.value)} className="input" maxLength={10} /></FormGroup></FormRow>
          <FormGroup label="Owner Email"><input type="email" value={form.ownerEmail} onChange={e => chg('ownerEmail', e.target.value)} className="input" /></FormGroup>
          <FormGroup label="Site Address *" error={errors.address}><input type="text" value={form.address} onChange={e => chg('address', e.target.value)} className="input" /></FormGroup>
          <FormRow><FormGroup label="City *" error={errors.city}><input type="text" value={form.city} onChange={e => chg('city', e.target.value)} className="input" /></FormGroup><FormGroup label="State"><input type="text" value={form.state} onChange={e => chg('state', e.target.value)} className="input" /></FormGroup></FormRow>
          <FormRow><FormGroup label="Pincode"><input type="text" value={form.pincode} onChange={e => chg('pincode', e.target.value)} className="input" /></FormGroup><FormGroup label="Status"><select value={form.status} onChange={e => chg('status', e.target.value)} className="select"><option value="Planned">Planned</option><option value="Active">Active</option><option value="On Hold">On Hold</option><option value="Completed">Completed</option></select></FormGroup></FormRow>
        </FormSection>
        <FormSection title="Construction Details">
          <FormRow><FormGroup label="Total Area *" error={errors.totalArea}><input type="number" value={form.totalArea} onChange={e => chg('totalArea', e.target.value)} className="input" min={0} step={0.01} /></FormGroup><FormGroup label="Unit"><select value={form.areaUnit} onChange={e => chg('areaUnit', e.target.value)} className="select"><option value="Sq.Ft">Sq.Ft</option><option value="Sq.Mtr">Sq.Mtr</option></select></FormGroup></FormRow>
          <FormRow><FormGroup label="Rate Per Area *" error={errors.ratePerArea}><input type="number" value={form.ratePerArea} onChange={e => chg('ratePerArea', e.target.value)} className="input" min={0} step={0.01} /></FormGroup><FormGroup label="Est. Cost"><input type="number" value={form.estimatedProjectCost} onChange={e => chg('estimatedProjectCost', e.target.value)} className="input" min={0} step={0.01} /></FormGroup></FormRow>
          <div className="p-4 rounded bg-primary-50 border border-primary-200"><p className="text-sm text-primary-800"><strong>Project Value: {f(calcVal())}</strong></p><p className="text-xs text-primary-600">{form.totalArea || 0} {form.areaUnit} × ₹{form.ratePerArea || 0}</p></div>
          <FormGroup label="Your Charges"><input type="number" value={form.engineerCharges || ''} onChange={e => chg('engineerCharges', e.target.value)} className="input" min={0} step={0.01} /></FormGroup>
          <FormRow><FormGroup label="Start Date"><input type="date" value={form.startDate} onChange={e => chg('startDate', e.target.value)} className="input" /></FormGroup><FormGroup label="Expected Completion"><input type="date" value={form.expectedCompletionDate} onChange={e => chg('expectedCompletionDate', e.target.value)} className="input" /></FormGroup></FormRow>
        </FormSection>
        <FormSection title="Notes"><FormGroup label=""><textarea value={form.notes} onChange={e => chg('notes', e.target.value)} className="textarea" rows={3} placeholder="Notes..." /></FormGroup></FormSection>
        <div className="flex justify-between pt-4 border-t"><p className="text-sm text-gray-500">* Required fields</p><div className="flex gap-3"><button type="button" onClick={() => navigate('/sites')} className="btn btn-secondary">Cancel</button><button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Saving...' : (isEdit ? 'Update' : 'Create')}</button></div></div>
      </form>
    </div>
  );
};

