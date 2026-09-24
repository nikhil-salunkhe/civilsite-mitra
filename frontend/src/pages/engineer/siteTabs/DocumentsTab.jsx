import React, { useState } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { useList, Modal, Field, money } from './shared';

const fmtSize = (bytes) => {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const nameOf = (d) => d.title || d.name || d.fileName || 'Untitled document';

const DocumentsTab = ({ siteId, onChanged }) => {
  const { items, loading, reload } = useList(siteId, 'documents');
  const [uploading, setUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState('Other');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please choose a file first');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', category);
    fd.append('notes', notes);
    setSaving(true);
    try {
      await api.post(`/sites/${siteId}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Document uploaded successfully');
      setShowModal(false);
      setFile(null);
      setNotes('');
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setSaving(false);
    }
  };

  const download = async (doc) => {
    try {
      const res = await api.get(`/sites/${siteId}/documents/${doc._id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName || nameOf(doc);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Delete "${nameOf(doc)}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/sites/${siteId}/documents/${doc._id}`);
      toast.success('Document deleted');
      reload();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900">Site Documents</h3>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowModal(true)} disabled={uploading}>
          + Upload Document
        </button>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading documents...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No documents uploaded yet.</td></tr>
            ) : items.map((doc) => (
              <tr key={doc._id} className="hover:bg-gray-50">
                <td className="font-medium text-gray-800">{nameOf(doc)}</td>
                <td className="text-gray-600">{doc.category || 'Other'}</td>
                <td className="text-gray-600">{fmtSize(doc.fileSize || doc.size)}</td>
                <td className="text-gray-600">{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => download(doc)}>Download</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(doc)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title="Upload Document" onClose={() => setShowModal(false)} onSubmit={upload} submitting={saving}>
          <Field label="File *">
            <input
              type="file"
              className="input"
              required
              onChange={(e) => setFile(e.target.files[0] || null)}
            />
          </Field>
          <Field label="Category">
            <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {['Agreement', 'Drawing', 'Invoice', 'Approval', 'Photo', 'Other'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </Field>
          {money(0) && null}
        </Modal>
      )}
    </div>
  );
};

export default DocumentsTab;
