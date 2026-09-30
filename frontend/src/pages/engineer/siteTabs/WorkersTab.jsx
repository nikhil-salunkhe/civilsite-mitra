import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { money, dateFmt, useList, Modal, FieldInput, num } from './shared';

const WORKER_TYPES = ['Mason', 'Helper', 'Carpenter', 'Electrician', 'Plumber', 'Painter', 'Labour', 'Other'];
const PAY_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'];

const STATUS_CLS = {
  Paid: 'badge badge-success',
  Partial: 'badge badge-warning',
  Pending: 'badge badge-secondary',
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  name: '', mobile: '', workerType: 'Labour', dailyWage: '', wageType: 'Daily Wage',
  joiningDate: '', address: '', notes: '',
};

/**
 * Workers tab - worker roster CRUD + wage transactions.
 *
 * "Pay" records a WorkerPayment: workDays x dailyWage = totalAmount (what the
 * labour is owed) and paidAmount is the cash actually handed over. The backend
 * derives pendingAmount + Paid/Partial/Pending status, so this UI never does
 * money maths itself.
 *
 * The Payment History table under the roster gives full edit/delete over the
 * same worker-payments endpoint.
 */
const WorkersTab = ({ siteId, onChanged }) => {
  const { items: workers, loading, reload } = useList(siteId, 'workers');
  const [modal, setModal] = useState(null); // { row | null }
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Wage transactions (worker-payments endpoint).
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(true);
  const [payModal, setPayModal] = useState(null); // { mode: 'add'|'edit', worker?, row? }
  const [payForm, setPayForm] = useState({});
  const [paySaving, setPaySaving] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setPay = (k) => (v) => setPayForm((f) => ({ ...f, [k]: v }));

  const loadHistory = useCallback(() => {
    if (!siteId) return;
    setHistLoading(true);
    api
      .get(`/sites/${siteId}/worker-payments`)
      .then(({ data }) => {
        const d = data?.data;
        setHistory(Array.isArray(d) ? d : d?.payments || []);
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load payment history'))
      .finally(() => setHistLoading(false));
  }, [siteId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

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

  // --- Wage transaction handlers -------------------------------------------

  const openPay = (w) => {
    setPayForm({
      workDays: '1',
      dailyWage: w.dailyWage ?? '',
      paidAmount: '',
      paymentDate: today(),
      paymentMode: 'Cash',
      notes: '',
    });
    setPayModal({ mode: 'add', worker: w });
  };

  const openHistEdit = (r) => {
    setPayForm({
      workDays: r.workDays ?? '1',
      dailyWage: r.dailyWage ?? '',
      paidAmount: r.paidAmount ?? '',
      paymentDate: r.paymentDate ? String(r.paymentDate).slice(0, 10) : today(),
      paymentMode: r.paymentMode || 'Cash',
      notes: r.notes || '',
    });
    setPayModal({ mode: 'edit', row: r });
  };

  const submitPay = async (e) => {
    e.preventDefault();
    const days = Number(payForm.workDays);
    const wage = Number(payForm.dailyWage);
    const paid = Number(payForm.paidAmount) || 0;
    if (!Number.isFinite(days) || days < 0) return toast.error('Enter valid work days');
    if (!Number.isFinite(wage) || wage < 0) return toast.error('Enter a valid daily wage');
    if (paid < 0) return toast.error('Paid amount cannot be negative');
    setPaySaving(true);
    try {
      const body = {
        workDays: days,
        dailyWage: wage,
        paidAmount: paid,
        paymentDate: payForm.paymentDate || undefined,
        paymentMode: payForm.paymentMode,
        notes: payForm.notes || '',
      };
      if (payModal.mode === 'add') {
        await api.post(`/sites/${siteId}/worker-payments`, { ...body, worker: payModal.worker._id });
        toast.success('Payment recorded');
      } else {
        await api.put(`/sites/${siteId}/worker-payments/${payModal.row._id}`, body);
        toast.success('Payment updated');
      }
      setPayModal(null);
      loadHistory();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setPaySaving(false);
    }
  };

  const removePayment = async (r) => {
    if (!window.confirm('Delete this wage payment record?')) return;
    try {
      await api.delete(`/sites/${siteId}/worker-payments/${r._id}`);
      toast.success('Payment deleted');
      loadHistory();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const workerName = (r) =>
    r.worker?.name || workers.find((w) => w._id === r.worker)?.name || '—';

  const histPaid = history.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Roster */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="card-title">Workers</h3>
            <p className="text-sm text-gray-500">
              {workers.length} worker{workers.length === 1 ? '' : 's'} · Paid out{' '}
              <span className="font-medium text-gray-900">{money(histPaid)}</span>
            </p>
          </div>
          <button type="button"  className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Worker</button>
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
                      <button type="button"  className="btn btn-primary btn-sm" onClick={() => openPay(w)}>Pay</button>
                      <button type="button"  className="btn btn-secondary btn-sm" onClick={() => openEdit(w)}>Edit</button>
                      <button type="button"  className="btn btn-danger btn-sm" onClick={() => remove(w)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment history - full CRUD over worker-payments */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="card-title">Payment History</h3>
            <p className="text-sm text-gray-500">
              {history.length} transaction{history.length === 1 ? '' : 's'} · Paid{' '}
              <span className="font-medium text-gray-900">{money(histPaid)}</span>
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadHistory} disabled={histLoading}>
            Refresh
          </button>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Worker</th><th className="text-right">Days</th>
                <th className="text-right">Wage/Day</th><th className="text-right">Total</th>
                <th className="text-right">Paid</th><th className="text-right">Pending</th>
                <th>Status</th><th>Mode</th><th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {histLoading ? (
                <tr><td colSpan={10} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">
                  No wage payments yet. Use <strong>Pay</strong> on a worker to record one.
                </td></tr>
              ) : history.map((r) => (
                <tr key={r._id} className="hover:bg-gray-50">
                  <td>{dateFmt(r.date)}</td>
                  <td className="font-medium">{workerName(r)}</td>
                  <td className="text-right">{r.workDays}</td>
                  <td className="text-right">{money(r.dailyWage)}</td>
                  <td className="text-right">{money(r.totalAmount)}</td>
                  <td className="text-right font-medium text-success-600">{money(r.paidAmount)}</td>
                  <td className="text-right text-danger-600">{money(r.pendingAmount)}</td>
                  <td><span className={STATUS_CLS[r.status] || 'badge'}>{r.status || '—'}</span></td>
                  <td>{r.paymentMode || '—'}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openHistEdit(r)}>Edit</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removePayment(r)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Worker add / edit */}
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

      {/* Wage transaction: add (from Pay) / edit (from history) */}
      {payModal && (
        <Modal
          title={
            payModal.mode === 'add'
              ? `Pay ${payModal.worker?.name || 'Worker'}`
              : 'Edit Wage Payment'
          }
          onClose={() => setPayModal(null)}
          onSubmit={submitPay}
          submitting={paySaving}
        >
          <FieldInput label="Work Days" type="number" step="1" min="0" required value={payForm.workDays ?? ''} onChange={setPay('workDays')} />
          <FieldInput label="Daily Wage (₹)" type="number" step="0.01" min="0" required value={payForm.dailyWage ?? ''} onChange={setPay('dailyWage')} />
          <FieldInput
            label="Amount Paid (₹)"
            type="number"
            step="0.01"
            min="0"
            value={payForm.paidAmount ?? ''}
            onChange={setPay('paidAmount')}
            placeholder="Cash handed over (0 to log as pending)"
          />
          <FieldInput label="Payment Date" type="date" value={payForm.paymentDate || ''} onChange={setPay('paymentDate')} />
          <FieldInput label="Payment Mode" type="select" options={PAY_MODES} value={payForm.paymentMode || 'Cash'} onChange={setPay('paymentMode')} />
          <FieldInput label="Notes" value={payForm.notes || ''} onChange={setPay('notes')} />
        </Modal>
      )}
    </div>
  );
};

export default WorkersTab;




