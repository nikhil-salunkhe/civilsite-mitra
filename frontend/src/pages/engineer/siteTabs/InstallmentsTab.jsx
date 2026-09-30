import React, { useState } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { money, dateFmt, useList, Modal, FieldInput } from './shared';

const STATUS_STYLES = {
  Paid: 'bg-success-100 text-success-800',
  Partial: 'bg-warning-100 text-warning-800',
  Pending: 'bg-gray-100 text-gray-700',
  Overdue: 'bg-danger-100 text-danger-700',
};

// Standard construction payment stages offered in the Add/Edit dropdown.
// Keeps every site's installment naming consistent across engineers.
const STAGE_OPTIONS = [
  'Advance / Booking',
  'Foundation',
  'Plinth Level',
  'Slab / Structure',
  'Brickwork',
  'Plastering',
  'Flooring / Finishing',
  'Handover / Final',
];
const CUSTOM_STAGE = 'Custom\u2026';

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
  const [statusFilter, setStatusFilter] = useState('');

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setForm({ stage: '', name: '', description: '', amount: '', dueDate: '', notes: '' });
    setModal({ mode: 'add' });
  };

  const openEdit = (row) => {
    // Preselect the matching preset stage in the dropdown; names that are not
    // presets open "Custom..." with the existing name kept in the text field.
    const isPreset = STAGE_OPTIONS.includes(row.name);
    setForm({
      stage: isPreset ? row.name : CUSTOM_STAGE,
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
    const name = String(form.stage === CUSTOM_STAGE ? form.name : form.stage || '').trim();
    if (!name) {
      toast.error(
        form.stage === CUSTOM_STAGE
          ? 'Please enter a name for the installment'
          : 'Please select an installment stage'
      );
      return;
    }
    setSaving(true);
    const body = {
      name,
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

  // Status filter dropdown (toolbar) - totals above always cover the full
  // schedule, so the header numbers never change while filtering rows.
  const statusCounts = installments.reduce((acc, row) => {
    const s = computeStatus(row);
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const visible = statusFilter
    ? installments.filter((row) => computeStatus(row) === statusFilter)
    : installments;
  const atLimit = installments.length >= 5;

  // Stages already used by another level are hidden from the dropdown so the
  // same stage can never be picked twice (the row's own stage stays selectable).
  const usedNames = installments
    .filter((r) => r._id !== modal?.row?._id)
    .map((r) => r.name);
  const stageChoices = STAGE_OPTIONS.filter((s) => !usedNames.includes(s));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Installments</h3>
          <p className="text-sm text-gray-500">
            {installments.length} level{installments.length === 1 ? '' : 's'} · Planned{' '}
            <span className="font-medium">{money(totals.amount)}</span> · Received{' '}
            <span className="font-medium">{money(totals.paid)}</span> · Pending{' '}
            <span className="font-medium">{money(Math.max(0, totals.amount - totals.paid))}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="select w-auto py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter installments by status"
          >
            <option value="">All Statuses ({installments.length})</option>
            {['Paid', 'Partial', 'Pending', 'Overdue'].map((s) => (
              <option key={s} value={s}>
                {s} ({statusCounts[s] || 0})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openAdd}
            disabled={atLimit}
            title={atLimit ? 'A site supports a maximum of 5 installment levels' : undefined}
          >
            + Add Installment
          </button>
        </div>
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
            ) : visible.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-6 text-gray-500">No installments match the selected status</td></tr>
            ) : (
              visible.map((row) => {
                const idx = installments.indexOf(row);
                const amount = Number(row.amount) || 0;
                const paid = Number(row.paidAmount) || 0;
                const status = computeStatus(row);
                return (
                  <tr key={row._id} className="hover:bg-gray-50">
                    <td className="text-gray-500">{idx + 1}</td>
                    <td className="font-medium text-gray-900">{row.name}</td>
                    <td className="max-w-[220px] truncate text-gray-500">{row.description || '—'}</td>
                    <td className="text-right">{money(amount)}</td>
                    <td className="text-right text-success-700">{money(paid)}</td>
                    <td className="text-right text-danger-600">{money(Math.max(0, amount - paid))}</td>
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
          <FieldInput
            label="Stage / Level"
            type="select"
            required
            value={form.stage || ''}
            onChange={set('stage')}
            options={[...stageChoices, CUSTOM_STAGE]}
          />
          {form.stage === CUSTOM_STAGE && (
            <FieldInput
              label="Name"
              required
              value={form.name || ''}
              onChange={set('name')}
              placeholder="Enter installment name"
            />
          )}
          <FieldInput label="Description" value={form.description || ''} onChange={set('description')} placeholder="Optional details" />
          <FieldInput label="Amount" type="number" step="0.01" required value={form.amount ?? ''} onChange={set('amount')} />
          <FieldInput label="Due Date" type="date" value={form.dueDate || ''} onChange={set('dueDate')} />
          <FieldInput label="Notes" value={form.notes || ''} onChange={set('notes')} placeholder="Optional notes" />
        </Modal>
      )}
    </div>
  );
}
