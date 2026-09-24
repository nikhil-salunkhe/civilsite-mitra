import React, { useState } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { money, dateFmt, useList, Modal, FieldInput, num } from './shared';

const WORKER_TYPES = ['Mason', 'Helper', 'Carpenter', 'Electrician', 'Plumber', 'Painter', 'Labour', 'Other'];

const emptyForm = {
  name: '', mobile: '', workerType: 'Labour', dailyWage: '', wageType: 'Daily Wage',
  joiningDate: '', address: '', notes: '',
};

const WorkersTab = ({ siteId, onChanged }) => {
  const { items: workers, loading, reload } = useList(siteId, 'workers');
  const [modal, setModal] = useState(null); // { row | null }
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => { setForm(emptyForm); setModal({ row: null }); };
  const openEdit = (w) => {
    setForm({
      name: w.name || '', mobile: w.mobile || '', workerType: w.workerType || 'Labour',
      dailyWage: w.dailyWage ?? '', wageType: w.wageType || 'Daily Wage',
      joiningDate: w.joiningDate ? String(w.joiningDate).slice(0, 10) : '',
      address: w.address || '', notes: w.notes || '',
    });
    setModal({ row: w });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      name: form.name,
      mobile: form.mobile,
      workerType: form.workerType,
      dailyWage: num(form.dailyWage),
      wageType: form.wageType,
      joiningDate: form.joiningDate || undefined,
      address: form.address,
      notes: form.notes,
    };
    try {
      if (modal.row) await api.put(`/sites/${siteId}/workers/${modal.row._id}`, body);
      else await api.post(`/sites/${siteId}/workers`, body);
      toast.success('Worker saved');
      setModal(null);
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (w) => {
    if (!window.confirm(`Delete worker "${w.name}"?`)) return;
    try {
      await api.delete(`/sites/${siteId}/workers/${w._id}`);
      toast.success('Worker deleted');
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const pay = async (w) => {
    const input = window.prompt(`Payment amount for ${w.name} (₹):`, '');
    if (input === null) return;
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await api.post(`/sites/${siteId}/worker-payments`, { worker: w._id, amount, paymentDate: new Date().toISOString().slice(0, 10) });
      toast.success('Payment recorded');
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Payment failed');
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="card-title">Workers</h3>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Worker</button>
      </div>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th><th>Type</th><th>Mobile</th><th className="text-right">Daily Wage</th>
              <th>Joined</th><th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
            ) : workers.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No workers yet</td></tr>
            ) : workers.map((w) => (
              <tr key={w._id} className="hover:bg-gray-50">
                <td className="font-medium">{w.name}</td>
                <td>{w.workerType}</td>
                <td>{w.mobile || '—'}</td>
                <td className="text-right">{money(w.dailyWage)}</td>
                <td>{dateFmt(w.joiningDate)}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <button className="btn btn-secondary btn-sm" onClick={() => pay(w)}>Pay</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(w)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(w)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal.row ? 'Edit Worker' : 'Add Worker'} onClose={() => setModal(null)} onSubmit={submit} submitting={saving}>
          <FieldInput label="Name" required value={form.name} onChange={set('name')} />
          <FieldInput label="Mobile" value={form.mobile} onChange={set('mobile')} />
          <FieldInput label="Worker Type" type="select" options={WORKER_TYPES} required value={form.workerType} onChange={set('workerType')} />
          <FieldInput label="Wage Type" type="select" options={['Daily Wage', 'Contract']} value={form.wageType} onChange={set('wageType')} />
          <FieldInput label="Daily Wage (₹)" type="number" step="0.01" value={form.dailyWage} onChange={set('dailyWage')} />
          <FieldInput label="Joining Date" type="date" value={form.joiningDate} onChange={set('joiningDate')} />
          <FieldInput label="Address" value={form.address} onChange={set('address')} />
          <FieldInput label="Notes" value={form.notes} onChange={set('notes')} />
        </Modal>
      )}
    </div>
  );
};

export default WorkersTab;
