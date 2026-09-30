import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { dateFmt, Modal, Field, TabToolbar, LoadingRow, EmptyRow, extractList } from './shared';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Material Usage tab - consumption register + derived stock position.
 *
 * Usage rows carry NO money; material cost stays on the purchase rows
 * (Materials tab), so consuming material never books a second expense.
 * Stock is always projected server-side as:
 *
 *   currentStock = openingStock + purchased - used   (grouped by name + unit)
 *
 * This tab only displays what GET /material-stock returns - it never
 * recomputes stock on the client.
 */
export default function MaterialUsageTab({ siteId, onChanged }) {
  const [usage, setUsage] = useState([]);
  const [pageInfo, setPageInfo] = useState(null);
  const [totalQuantity, setTotalQuantity] = useState(0);
  const [loading, setLoading] = useState(true);

  const [stock, setStock] = useState([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [stockLoading, setStockLoading] = useState(true);

  const [materials, setMaterials] = useState([]);

  const [filters, setFilters] = useState({ materialId: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null); // { mode: 'add' | 'edit', row }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const PAGE_SIZE = 50;

  const loadUsage = useCallback(() => {
    if (!siteId) return;
    setLoading(true);
    const params = { page, limit: PAGE_SIZE };
    if (filters.materialId) params.materialId = filters.materialId;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    api
      .get(`/sites/${siteId}/material-usage`, { params })
      .then(({ data }) => {
        const d = data?.data || {};
        setUsage(d.usage || []);
        setPageInfo(d.pagination || null);
        setTotalQuantity(d.totalQuantity ?? 0);
      })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load usage records'))
      .finally(() => setLoading(false));
  }, [siteId, page, filters.materialId, filters.from, filters.to]);

  const loadStock = useCallback(() => {
    if (!siteId) return;
    setStockLoading(true);
    api
      .get(`/sites/${siteId}/material-stock`)
      .then(({ data }) => {
        const d = data?.data || {};
        setStock(d.stock || []);
        setLowStockCount(d.lowStockCount || 0);
      })
      .catch(() => {})
      .finally(() => setStockLoading(false));
  }, [siteId]);

  useEffect(() => { loadUsage(); }, [loadUsage]);
  useEffect(() => { loadStock(); }, [loadStock]);

  // Purchase rows drive the material dropdown in the modal.
  useEffect(() => {
    if (!siteId) return;
    api
      .get(`/sites/${siteId}/materials`)
      .then(({ data }) => setMaterials(extractList(data)))
      .catch(() => {});
  }, [siteId]);

  // Any filter change invalidates the current page number.
  const setFilter = (k) => (v) => {
    setPage(1);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({ materialId: '', from: '', to: '' });
  };

  const openAdd = () => {
    setForm({
      material: '',
      quantity: '',
      date: today(),
      workActivity: '',
      notes: '',
    });
    setModal({ mode: 'add' });
  };

  const openEdit = (row) => {
    setForm({
      material: row.material?._id || row.material || '',
      quantity: row.quantity ?? '',
      date: row.date ? String(row.date).slice(0, 10) : today(),
      workActivity: row.workActivity || '',
      notes: row.notes || '',
    });
    setModal({ mode: 'edit', row });
  };

  const refresh = () => {
    loadUsage();
    loadStock();
    if (onChanged) onChanged();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.material) return toast.error('Please select a material');
    setSaving(true);
    try {
      const body = {
        material: form.material,
        quantity: Number(form.quantity) || 0,
        date: form.date || undefined,
        workActivity: form.workActivity || '',
        notes: form.notes || '',
      };
      if (modal.mode === 'add') await api.post(`/sites/${siteId}/material-usage`, body);
      else await api.put(`/sites/${siteId}/material-usage/${modal.row._id}`, body);
      toast.success(modal.mode === 'add' ? 'Usage recorded' : 'Usage updated');
      setModal(null);
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm('Delete this usage record? Stock will be recalculated automatically.')) return;
    try {
      await api.delete(`/sites/${siteId}/material-usage/${row._id}`);
      toast.success('Usage deleted');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const totalPages = pageInfo?.totalPages || 1;
  const matName = (r) => r.material?.name || r.materialName || '—';

  const summaryCards = [
    { label: 'Usage Records', value: pageInfo?.totalItems ?? usage.length },
    { label: 'Quantity Used (filtered)', value: totalQuantity, cls: 'text-warning-600' },
    { label: 'Stock Lines', value: stock.length },
    { label: 'Low Stock Items', value: lowStockCount, cls: lowStockCount > 0 ? 'text-danger-600' : '' },
  ];

  return (
    <div className="space-y-6">
      <TabToolbar
        title="Material Usage"
        onAdd={() => (materials.length === 0 ? toast.error('Add material purchases first (Materials tab)') : openAdd())}
      >
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading || stockLoading}>
          Refresh
        </button>
      </TabToolbar>

      {/* Summary - figures come from the backend, stock never recomputed here. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((c) => (
          <div key={c.label} className="border rounded-lg p-3 bg-gray-50">
            <div className="text-xs uppercase tracking-wide text-gray-500">{c.label}</div>
            <div className={`text-lg font-semibold ${c.cls || ''}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Stock position - derived server-side: opening + purchased - used. */}
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h3 className="card-title">Stock Position</h3>
          <span className="text-xs text-gray-400">Stock = Opening + Purchased − Used (calculated by the server)</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Unit</th>
                <th>Category</th>
                <th className="text-right">Opening</th>
                <th className="text-right">Purchased</th>
                <th className="text-right">Used</th>
                <th className="text-right">Current</th>
                <th className="text-right">Min Level</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stockLoading ? (
                <LoadingRow colSpan={9} />
              ) : stock.length === 0 ? (
                <EmptyRow colSpan={9} msg="No stock lines yet. Add purchases in the Materials tab." />
              ) : (
                stock.map((s) => (
                  <tr key={`${s.materialName}||${s.unit}`} className="hover:bg-gray-50">
                    <td className="font-medium">{s.materialName}</td>
                    <td>{s.unit}</td>
                    <td className="text-sm text-gray-500">{s.category || '—'}</td>
                    <td className="text-right">{s.openingStock}</td>
                    <td className="text-right">{s.purchased}</td>
                    <td className="text-right">{s.used}</td>
                    <td className={`text-right font-medium ${s.currentStock < 0 ? 'text-danger-600' : ''}`}>
                      {s.currentStock}
                    </td>
                    <td className="text-right">{s.trackStock ? s.minStockLevel : '—'}</td>
                    <td>
                      {s.isLowStock ? (
                        <span className="badge badge-danger">Low</span>
                      ) : s.currentStock < 0 ? (
                        <span className="badge badge-warning">Deficit</span>
                      ) : (
                        <span className="badge badge-success">OK</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Usage register */}
      <div className="card">
        <h3 className="card-title mb-3">Usage Register</h3>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="label">Material</label>
            <select className="select" value={filters.materialId} onChange={(e) => setFilter('materialId')(e.target.value)}>
              <option value="">All materials</option>
              {materials.map((m) => (
                <option key={m._id} value={m._id}>{m.name}{m.unit ? ` (${m.unit})` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input type="date" className="input" value={filters.from} onChange={(e) => setFilter('from')(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" value={filters.to} onChange={(e) => setFilter('to')(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button type="button" className="btn btn-secondary w-full" onClick={clearFilters}>Clear Filters</button>
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Material</th>
                <th className="text-right">Qty</th>
                <th>Work Activity</th>
                <th>Notes</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <LoadingRow colSpan={6} />
              ) : usage.length === 0 ? (
                <EmptyRow colSpan={6} msg="No usage records for the selected filters." />
              ) : (
                usage.map((r) => (
                  <tr key={r._id} className="hover:bg-gray-50">
                    <td>{dateFmt(r.date)}</td>
                    <td className="font-medium">{matName(r)}</td>
                    <td className="text-right">{r.quantity} {r.unit || ''}</td>
                    <td>{r.workActivity || '—'}</td>
                    <td className="text-sm text-gray-500">{r.notes || '—'}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(r)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageInfo && pageInfo.totalItems > 0 && (
          <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
            <div className="text-sm text-gray-500">
              Page {pageInfo.currentPage} of {pageInfo.totalPages} — {pageInfo.totalItems} record(s)
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / edit modal */}
      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Record Material Usage' : 'Edit Usage'}
          onClose={() => setModal(null)}
          onSubmit={submit}
          submitting={saving}
        >
          <Field label="Material *">
            <select
              className="select"
              required
              value={form.material}
              onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))}
            >
              <option value="">Select material...</option>
              {materials.map((m) => (
                <option key={m._id} value={m._id}>{m.name}{m.unit ? ` (${m.unit})` : ''}</option>
              ))}
            </select>
          </Field>
          <Field label="Quantity *">
            <input
              type="number"
              className="input"
              step="0.01"
              min="0.01"
              required
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </Field>
          <Field label="Usage Date *">
            <input
              type="date"
              className="input"
              required
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </Field>
          <Field label="Work Activity">
            <input
              type="text"
              className="input"
              placeholder="e.g. Slab casting - first floor"
              value={form.workActivity}
              onChange={(e) => setForm((f) => ({ ...f, workActivity: e.target.value }))}
            />
          </Field>
          <Field label="Notes">
            <textarea
              className="input"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}




