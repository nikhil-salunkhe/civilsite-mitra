import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { money, dateFmt, useList, Modal, FieldInput } from './shared';
import { Icon } from '../../../components/Icon';

const CATEGORIES = ['Cement', 'Steel', 'Sand', 'Bricks', 'Tiles', 'Electrical', 'Plumbing', 'Paint', 'Hardware', 'Wood', 'Other'];
const PAY_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'];

const emptyForm = { name: '', mobile: '', email: '', address: '', category: 'Cement', notes: '' };
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Vendors tab - vendor roster CRUD + vendor transactions + read-only ledger.
 *
 * Payments made to a vendor live on the vendor-payments endpoint (amount,
 * date, mode, transaction ref). The ledger button opens the server-side
 * projection: purchases = debit, payments = credit, with a running balance.
 * Neither table's totals are computed in the client.
 */
const VendorsTab = ({ siteId, onChanged }) => {
  const { items: vendors, loading, reload } = useList(siteId, 'vendors');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Vendor transactions (vendor-payments endpoint).
  const [payments, setPayments] = useState([]);
  const [payLoading, setPayLoading] = useState(true);
  const [payModal, setPayModal] = useState(null); // { vendor }
  const [payForm, setPayForm] = useState({});
  const [paySaving, setPaySaving] = useState(false);

  // Ledger viewer (GET /vendors/:id/ledger).
  const [ledgerFor, setLedgerFor] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setPay = (k) => (v) => setPayForm((f) => ({ ...f, [k]: v }));

  const loadPayments = useCallback(() => {
    if (!siteId) return;
    setPayLoading(true);
    api
      .get(`/sites/${siteId}/vendor-payments`)
      .then(({ data }) => {
        const d = data?.data;
        setPayments(Array.isArray(d) ? d : d?.payments || []);
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load vendor payments'))
      .finally(() => setPayLoading(false));
  }, [siteId]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  const openAdd = () => { setForm(emptyForm); setModal({ row: null }); };
  const openEdit = (v) => {
    setForm({
      name: v.name || '', mobile: v.mobile || '', email: v.email || '',
      address: v.address || '', category: v.category || v.materialCategory || 'Cement',
      notes: v.notes || '',
    });
    setModal({ row: v });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const body = { ...form };
    try {
      if (modal.row) await api.put(`/sites/${siteId}/vendors/${modal.row._id}`, body);
      else await api.post(`/sites/${siteId}/vendors`, body);
      toast.success('Vendor saved');
      setModal(null);
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v) => {
    if (!window.confirm(`Delete vendor "${v.name}"?`)) return;
    try {
      await api.delete(`/sites/${siteId}/vendors/${v._id}`);
      toast.success('Vendor deleted');
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  // --- Vendor transaction handlers -----------------------------------------

  const openPay = (v) => {
    setPayForm({ amount: '', date: today(), paymentMode: 'Cash', transactionRef: '', notes: '' });
    setPayModal({ vendor: v });
  };

  const submitPay = async (e) => {
    e.preventDefault();
    const amount = Number(payForm.amount) || 0;
    if (amount <= 0) return toast.error('Enter a valid amount');
    setPaySaving(true);
    try {
      await api.post(`/sites/${siteId}/vendor-payments`, {
        vendor: payModal.vendor._id,
        amount,
        date: payForm.date || undefined,
        paymentMode: payForm.paymentMode,
        transactionRef: payForm.transactionRef || undefined,
        notes: payForm.notes || '',
      });
      toast.success('Vendor payment recorded');
      setPayModal(null);
      loadPayments();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setPaySaving(false);
    }
  };

  const removePayment = async (p) => {
    if (!window.confirm('Delete this vendor payment?')) return;
    try {
      await api.delete(`/sites/${siteId}/vendor-payments/${p._id}`);
      toast.success('Payment deleted');
      loadPayments();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  // --- Ledger (read-only server projection) --------------------------------

  const openLedger = async (v) => {
    setLedgerFor(v);
    setLedger(null);
    setLedgerLoading(true);
    try {
      const { data } = await api.get(`/sites/${siteId}/vendors/${v._id}/ledger`);
      setLedger(data?.data || null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load ledger');
      setLedgerFor(null);
    } finally {
      setLedgerLoading(false);
    }
  };

  const closeLedger = () => { setLedgerFor(null); setLedger(null); };

  const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Roster */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="card-title">Vendors</h3>
            <p className="text-sm text-gray-500">
              {vendors.length} vendor{vendors.length === 1 ? '' : 's'} · Paid{' '}
              <span className="font-medium text-gray-900">{money(paidTotal)}</span>
            </p>
          </div>
          <button type="button"  className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Vendor</button>
        </div>
        <div className="table-container overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Mobile</th><th>Category</th><th>Address</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
              ) : vendors.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">No vendors yet</td></tr>
              ) : vendors.map((v) => (
                <tr key={v._id} className="hover:bg-gray-50">
                  <td className="font-medium">{v.name}</td>
                  <td>{v.mobile || '—'}</td>
                  <td>{v.category || v.materialCategory || '—'}</td>
                  <td className="text-gray-500">{v.address || '—'}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2 flex-wrap">
                      <button type="button"  className="btn btn-primary btn-sm" onClick={() => openPay(v)}>Pay</button>
                      <button type="button"  className="btn btn-secondary btn-sm" onClick={() => openLedger(v)}>Ledger</button>
                      <button type="button"  className="btn btn-secondary btn-sm" onClick={() => openEdit(v)}>Edit</button>
                      <button type="button"  className="btn btn-danger btn-sm" onClick={() => remove(v)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment history - vendor-payments endpoint */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="card-title">Payment History</h3>
            <p className="text-sm text-gray-500">
              {payments.length} transaction{payments.length === 1 ? '' : 's'} · Paid{' '}
              <span className="font-medium text-gray-900">{money(paidTotal)}</span>
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={loadPayments} disabled={payLoading}>
            Refresh
          </button>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Vendor</th><th>Material</th>
                <th className="text-right">Amount</th><th>Mode</th>
                <th>Reference</th><th>Notes</th><th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payLoading ? (
                <tr><td colSpan={8} className="text-center py-8"><div className="spinner mx-auto" /></td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">
                  No vendor payments yet. Use <strong>Pay</strong> on a vendor to record one.
                </td></tr>
              ) : payments.map((p) => (
                <tr key={p._id} className="hover:bg-gray-50">
                  <td>{dateFmt(p.date)}</td>
                  <td className="font-medium">{p.vendor?.name || '—'}</td>
                  <td>{p.material?.name || p.materialName || '—'}</td>
                  <td className="text-right font-medium">{money(p.amount)}</td>
                  <td>{p.paymentMode || '—'}</td>
                  <td>{p.transactionRef || '—'}</td>
                  <td className="max-w-[200px] truncate text-sm text-gray-500">{p.notes || '—'}</td>
                  <td className="text-right">
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removePayment(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor add / edit */}
      {modal && (
        <Modal title={modal.row ? 'Edit Vendor' : 'Add Vendor'} onClose={() => setModal(null)} onSubmit={submit} submitting={saving}>
          <FieldInput label="Vendor Name" required value={form.name} onChange={set('name')} />
          <FieldInput label="Mobile" value={form.mobile} onChange={set('mobile')} />
          <FieldInput label="Email" type="email" value={form.email} onChange={set('email')} />
          <FieldInput label="Address" value={form.address} onChange={set('address')} />
          <FieldInput label="Material Category" type="select" options={CATEGORIES} value={form.category} onChange={set('category')} />
          <FieldInput label="Notes" value={form.notes} onChange={set('notes')} />
        </Modal>
      )}

      {/* Vendor transaction */}
      {payModal && (
        <Modal
          title={`Pay ${payModal.vendor?.name || 'Vendor'}`}
          onClose={() => setPayModal(null)}
          onSubmit={submitPay}
          submitting={paySaving}
        >
          <FieldInput label="Amount (₹)" type="number" step="0.01" min="0.01" required value={payForm.amount ?? ''} onChange={setPay('amount')} />
          <FieldInput label="Payment Date" type="date" required value={payForm.date || ''} onChange={setPay('date')} />
          <FieldInput label="Payment Mode" type="select" options={PAY_MODES} value={payForm.paymentMode || 'Cash'} onChange={setPay('paymentMode')} />
          <FieldInput label="Transaction / Reference No." value={payForm.transactionRef || ''} onChange={setPay('transactionRef')} placeholder="e.g. Cheque 123456" />
          <FieldInput label="Notes" value={payForm.notes || ''} onChange={setPay('notes')} placeholder="e.g. Part payment for TMT steel" />
        </Modal>
      )}

      {/* Ledger viewer - read-only server projection */}
      {(ledgerFor || ledgerLoading) && (
        <div className="modal-overlay" onClick={closeLedger}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Ledger — {ledgerFor?.name}</h3>
              <button type="button" aria-label="Close ledger" className="btn btn-secondary btn-sm" onClick={closeLedger}>
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="modal-body">
              {ledgerLoading ? (
                <div className="text-center py-8"><div className="spinner mx-auto" /></div>
              ) : ledger ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                    <div className="border rounded-lg p-3 bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Purchases</div>
                      <div className="text-lg font-semibold">{money(ledger.summary?.totalPurchases)}</div>
                    </div>
                    <div className="border rounded-lg p-3 bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Paid</div>
                      <div className="text-lg font-semibold text-success-600">{money(ledger.summary?.totalPaid)}</div>
                    </div>
                    <div className="border rounded-lg p-3 bg-gray-50">
                      <div className="text-xs uppercase tracking-wide text-gray-500">Outstanding</div>
                      <div className="text-lg font-semibold text-danger-600">{money(ledger.summary?.outstanding)}</div>
                    </div>
                  </div>
                  {(!ledger.ledger || ledger.ledger.length === 0) ? (
                    <p className="text-center text-gray-400 py-4">No ledger entries yet.</p>
                  ) : (
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Date</th><th>Type</th><th>Description</th><th>Ref</th>
                            <th className="text-right">Debit</th><th className="text-right">Credit</th>
                            <th className="text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledger.ledger.map((e, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td>{dateFmt(e.date)}</td>
                              <td><span className={`badge ${e.type === 'PAYMENT' ? 'badge-success' : 'badge-secondary'}`}>{e.type}</span></td>
                              <td>{e.description}</td>
                              <td>{e.reference || '—'}</td>
                              <td className="text-right">{e.debit ? money(e.debit) : '—'}</td>
                              <td className="text-right">{e.credit ? money(e.credit) : '—'}</td>
                              <td className="text-right font-medium">{money(e.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorsTab;




