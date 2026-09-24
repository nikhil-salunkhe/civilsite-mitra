import React, { useState } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { money, dateFmt, useList, Modal, FieldInput } from './shared';

const MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'];

export default function PaymentsTab({ siteId, summary, onChanged }) {
  const { items: payments, loading, reload } = useList(siteId, 'payments');
  const { items: installments } = useList(siteId, 'installments');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => {
    setForm({
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      installment: '',
      paymentMode: 'Cash',
      transactionRef: '',
      notes: '',
    });
    setModal({ mode: 'add' });
  };

  const openEdit = (row) => {
    setForm({
      amount: row.amount ?? '',
      date: row.date ? String(row.date).slice(0, 10) : '',
      installment: row.installment?._id || (typeof row.installment === 'string' ? row.installment : ''),
      paymentMode: row.paymentMode || 'Cash',
      // Read the canonical field first, then the legacy spellings.
      transactionRef: row.transactionRef || row.transactionNumber || row.referenceNumber || '',
      notes: row.notes || '',
    });
    setModal({ mode: 'edit', row });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = {
      amount: Number(form.amount) || 0,
      date: form.date,
      paymentMode: form.paymentMode,
      transactionRef: form.transactionRef || undefined,
      notes: form.notes || undefined,
      installment: form.installment || undefined,
    };
    try {
      if (modal.mode === 'add') await api.post(`/sites/${siteId}/payments`, body);
      else await api.put(`/sites/${siteId}/payments/${modal.row._id}`, body);
      toast.success('Payment saved successfully');
      setModal(null);
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm('Delete this payment? This will update the installment balance.')) return;
    try {
      await api.delete(`/sites/${siteId}/payments/${row._id}`);
      toast.success('Payment deleted');
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete payment');
    }
  };

  const listedTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Payments</h3>
          <p className="text-sm text-gray-500">
            {payments.length} record{payments.length === 1 ? '' : 's'} · Received{' '}
            <span className="font-medium text-gray-900">{money(listedTotal)}</span>
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Payment</button>
      </div>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="text-right">Amount</th>
              <th>Mode</th>
              <th>Installment</th>
              <th>Reference</th>
              <th>Notes</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-6 text-gray-500">Loading payments...</td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-6 text-gray-500">No payments recorded yet</td></tr>
            ) : (
              payments.map((row) => (
                <tr key={row._id} className="hover:bg-gray-50">
                  <td>{dateFmt(row.date || row.paymentDate)}</td>
                  <td className="text-right font-medium">{money(row.amount)}</td>
                  <td>{row.paymentMode || '—'}</td>
                  <td>{row.installment?.name || (typeof row.installment === 'string' ? row.installment : '—')}</td>
                  <td>{row.transactionRef || row.transactionNumber || row.referenceNumber || '—'}</td>
                  <td className="max-w-[220px] truncate">{row.notes || '—'}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>Edit</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(row)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Record Payment' : 'Edit Payment'}
          onClose={() => setModal(null)}
          onSubmit={submit}
          submitting={saving}
        >
          <FieldInput label="Amount" type="number" step="0.01" required value={form.amount ?? ''} onChange={set('amount')} />
          <FieldInput label="Payment Date" type="date" required value={form.date || ''} onChange={set('date')} />
          <FieldInput label="Payment Mode" type="select" options={MODES} required value={form.paymentMode || ''} onChange={set('paymentMode')} />
          <div className="mb-3">
            <label className="label">Installment</label>
            <select className="select" value={form.installment || ''} onChange={(e) => set('installment')(e.target.value)}>
              <option value="">Select installment (optional)...</option>
              {installments.map((i) => (
                <option key={i._id} value={i._id}>{i.name}</option>
              ))}
            </select>
          </div>
          <FieldInput label="Transaction / Reference No." value={form.transactionRef || ''} onChange={set('transactionRef')} placeholder="e.g. UPI Ref 123456" />
          <FieldInput label="Notes" value={form.notes || ''} onChange={set('notes')} placeholder="Optional notes" />
        </Modal>
      )}
    </div>
  );
}
