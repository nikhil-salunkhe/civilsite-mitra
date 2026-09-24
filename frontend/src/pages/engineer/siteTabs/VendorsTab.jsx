import React, { useState } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { money, dateFmt, useList, Modal, FieldInput, num } from './shared';

const CATEGORIES = ['Cement', 'Steel', 'Sand', 'Bricks', 'Tiles', 'Electrical', 'Plumbing', 'Paint', 'Hardware', 'Wood', 'Other'];

const emptyForm = { name: '', mobile: '', email: '', address: '', category: 'Cement', notes: '' };

const VendorsTab = ({ siteId, onChanged }) => {
  const { items: vendors, loading, reload } = useList(siteId, 'vendors');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

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

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="card-title">Vendors</h3>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Vendor</button>
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
                  <div className="flex justify-end gap-2">
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(v)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(v)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </div>
  );
};

export default VendorsTab;
