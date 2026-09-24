import React, { useState } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { money, dateFmt, useList, Modal, FieldInput } from './shared';

const STATUS_STYLES = {
  Paid: 'bg-green-100 text-green-800',
  Partial: 'bg-yellow-100 text-yellow-800',
  Pending: 'bg-gray-100 text-gray-700',
  Overdue: 'bg-red-100 text-red-700',
};

const computeStatus = (row) => {
  if (row.status) return row.status;
  const amount = Number(row.amount) || 0;
  const paid = Number(row.paidAmount) || 0;
  if (amount > 0 && paid >= amount) return 'Paid';
  if (paid > 0) return 'Partial';
  if (row.dueDate && new Date(row.dueDate) < new Date()) return 'Overdue';
  return 'Pending';
};

export default function InstallmentsTab({ siteId, summary, onChanged }) {
  const { items: installments, loading, reload } = useList(siteId, 'installments');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setForm({ name: '', description: '', amount: '', dueDate: '', notes: '' });
    setModal({ mode: 'add' });
  };

  const openEdit = (row) => {
    setForm({
      name: row.name || '',
      description: row.description || '',
      amount: row.amount ?? '',
      dueDate: row.dueDate ? String(row.dueDate).slice(0, 10) : '',
      notes: row.notes || '',
    });
    setModal({ mode: 'edit', row });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      name: form.name,
      description: form.description || undefined,
      amount: Number(form.amount) || 0,
      dueDate: form.dueDate || undefined,
      notes: form.notes || undefined,
    };
    try {
      if (modal.mode === 'add') await api.post(`/sites/${siteId}/installments`, body);
      else await api.put(`/sites/${siteId}/installments/${modal.row._id}`, body);
      toast.success('Installment saved successfully');
      setModal(null);
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save installment');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete installment "${row.name}"?`)) return;
    try {
      await api.delete(`/sites/${siteId}/installments/${row._id}`);
      toast.success('Installment deleted');
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete installment');
    }
  };

  const totals = installments.reduce(
    (acc, i) => {
      acc.amount += Number(i.amount) || 0;
      acc.paid += Number(i.paidAmount) || 0;
      return acc;
    },
    { amount: 0, paid: 0 }
  );

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Installments</h3>
          <p className="text-sm text-gray-500">
            {installments.length} level{installments.length === 1 ? '' : 's'} · Planned{' '}
            <span className="font-medium">{money(totals.amount)}</span> · Received{' '}
            <span className="font-medium">{money(totals.paid)}</span> · Pending{' '}
            <span className="font-medium">{money(Math.max(0, totals.amount - totals.paid))}</span>
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Installment</button>
      </div>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Description</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Pending</th>
              <th>Due Date</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-6 text-gray-500">Loading installments...</td></tr>
            ) : installments.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-6 text-gray-500">No installments defined yet (supports 1–5 levels)</td></tr>
            ) : (
              installments.map((row, idx) => {
                const amount = Number(row.amount) || 0;
                const paid = Number(row.paidAmount) || 0;
                const status = computeStatus(row);
                return (
                  <tr key={row._id} className="hover:bg-gray-50">
                    <td className="text-gray-500">{idx + 1}</td>
                    <td className="font-medium text-gray-900">{row.name}</td>
                    <td className="max-w-[220px] truncate text-gray-500">{row.description || '—'}</td>
                    <td className="text-right">{money(amount)}</td>
                    <td className="text-right text-green-700">{money(paid)}</td>
                    <td className="text-right text-red-600">{money(Math.max(0, amount - paid))}</td>
                    <td>{dateFmt(row.dueDate)}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.Pending}`}>
                        {status}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>Edit</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(row)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Installment' : 'Edit Installment'}
          onClose={() => setModal(null)}
          onSubmit={submit}
          submitting={saving}
        >
          <FieldInput label="Name" required value={form.name || ''} onChange={set('name')} placeholder="e.g. Foundation, Plinth, Slab, Finishing, Final" />
          <FieldInput label="Description" value={form.description || ''} onChange={set('description')} placeholder="Optional details" />
          <FieldInput label="Amount" type="number" step="0.01" required value={form.amount ?? ''} onChange={set('amount')} />
          <FieldInput label="Due Date" type="date" value={form.dueDate || ''} onChange={set('dueDate')} />
          <FieldInput label="Notes" value={form.notes || ''} onChange={set('notes')} placeholder="Optional notes" />
        </Modal>
      )}
    </div>
  );
}
