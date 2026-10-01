import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { Icon } from '../../../components/Icon';

// ---------------------------------------------------------------------------
// Formatting helpers (self-contained so tabs never depend on uncertain utils)
// ---------------------------------------------------------------------------
export const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);

export const dateFmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

/**
 * Extracts an array from any of the response shapes the backend may use:
 * [ ... ] | { data: [...] } | { data: { payments: [...] } } etc.
 */
export const extractList = (payload) => {
  if (!payload) return [];
  let d = payload;
  if (!Array.isArray(d) && d.data !== undefined) d = d.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    const arr = Object.values(d).find(Array.isArray);
    if (arr) return arr;
  }
  return [];
};

// ---------------------------------------------------------------------------
// Generic list hook - every tab uses this for its GET request
// ---------------------------------------------------------------------------
export const useList = (siteId, basePath) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!siteId) return;
    setLoading(true);
    api
      .get(`/sites/${siteId}/${basePath}`)
      .then(({ data }) => setItems(extractList(data)))
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load records'))
      .finally(() => setLoading(false));
  }, [siteId, basePath]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
};

// ---------------------------------------------------------------------------
// Modal + form field primitives (match the app's modal-* / input CSS classes)
// ---------------------------------------------------------------------------
export const Modal = ({ title, onClose, onSubmit, submitting, children }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h3 className="modal-title">{title}</h3>
        <button type="button" aria-label="Close" className="btn btn-icon btn-secondary btn-sm" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <form onSubmit={onSubmit}>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  </div>
);

export const Field = ({ label, children }) => (
  <div className="mb-3">
    <label className="label">{label}</label>
    {children}
  </div>
);

export const FieldInput = ({ label, type = 'text', value, onChange, options, required, placeholder, step }) => (
  <Field label={label + (required ? ' *' : '')}>
    {type === 'select' ? (
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">Select...</option>
        {(options || []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    ) : type === 'textarea' ? (
      <textarea className="input" rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    ) : (
      <input
        className="input" type={type} step={step} value={value}
        placeholder={placeholder} required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    )}
  </Field>
);

export const TabToolbar = ({ title, onAdd, children }) => (
  <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
    <h3 className="card-title">{title}</h3>
    <div className="flex items-center gap-2">
      {children}
      {onAdd && <button type="button" className="btn btn-primary btn-sm" onClick={onAdd}>+ Add</button>}
    </div>
  </div>
);

export const EmptyRow = ({ colSpan, msg = 'No records yet' }) => (
  <tr><td colSpan={colSpan} className="text-center py-8 text-gray-400">{msg}</td></tr>
);

export const LoadingRow = ({ colSpan }) => (
  <tr><td colSpan={colSpan} className="text-center py-8"><div className="spinner"></div></td></tr>
);

// ---------------------------------------------------------------------------
// makeCrudTab - config-driven factory for standard list/add/edit/delete tabs.
//   basePath : sub-resource under /api/sites/:siteId (e.g. 'materials')
//   columns  : [{ key, label, right?, render?(row) }]
//   fields   : [{ key, label, type?, options?, required?, step?, placeholder? }]
//   toForm   : optional (row) => form values for the modal
//   fromForm : optional (form) => request body (e.g. string -> number)
// ---------------------------------------------------------------------------
export const makeCrudTab = ({ basePath, title, columns, fields, toForm, fromForm, formExtra }) => {
  const singular = title.replace(/s$/, '');
  const Tab = ({ siteId, onChanged }) => {
    const { items, loading, reload } = useList(siteId, basePath);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);

    const openAdd = () => { setForm(toForm ? toForm({}) : {}); setModal({ mode: 'add' }); };
    const openEdit = (row) => { setForm(toForm ? toForm(row) : { ...row }); setModal({ mode: 'edit', row }); };

    const submit = async (e) => {
      e.preventDefault();
      setSaving(true);
      const body = fromForm ? fromForm(form) : form;
      try {
        if (modal.mode === 'add') await api.post(`/sites/${siteId}/${basePath}`, body);
        else await api.put(`/sites/${siteId}/${basePath}/${modal.row._id}`, body);
        toast.success('Saved successfully');
        setModal(null);
        reload();
        if (onChanged) onChanged();
      } catch (err) {
        toast.error(err.response?.data?.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    };

    const remove = async (row) => {
      if (!window.confirm('Delete this record?')) return;
      try {
        await api.delete(`/sites/${siteId}/${basePath}/${row._id}`);
        toast.success('Deleted successfully');
        reload();
        if (onChanged) onChanged();
      } catch (err) {
        toast.error(err.response?.data?.message || 'Delete failed');
      }
    };

    const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

    return (
      <div className="card">
        <TabToolbar title={title} onAdd={openAdd} />
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => <th key={c.key} className={c.right ? 'text-right' : ''}>{c.label}</th>)}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <LoadingRow colSpan={columns.length + 1} />
                : items.length === 0 ? <EmptyRow colSpan={columns.length + 1} />
                : items.map((row) => (
                  <tr key={row._id} className="hover:bg-gray-50">
                    {columns.map((c) => (
                      <td key={c.key} className={c.right ? 'text-right' : ''}>
                        {c.render ? c.render(row) : (row[c.key] ?? '—')}
                      </td>
                    ))}
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>Edit</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(row)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {modal && (
          <Modal
            title={modal.mode === 'add' ? `Add ${singular}` : `Edit ${singular}`}
            onClose={() => setModal(null)}
            onSubmit={submit}
            submitting={saving}
          >
            {fields.map((f) => (
              <FieldInput
                key={f.key}
                label={f.label}
                type={f.type || 'text'}
                options={f.options}
                required={f.required}
                step={f.step}
                placeholder={f.placeholder}
                value={form[f.key] ?? ''}
                onChange={set(f.key)}
              />
            ))}
            {/* Optional live read-out (e.g. a derived total) for tabs whose
                fields imply a calculation. Purely presentational: the value is
                still recomputed server-side on save. */}
            {formExtra && formExtra(form)}
          </Modal>
        )}
      </div>
    );
  };
  Tab.displayName = 'CrudTab';
  return Tab;
};

export const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v));

// Alias kept for older tabs that import `fmtDate`
export const fmtDate = dateFmt;

