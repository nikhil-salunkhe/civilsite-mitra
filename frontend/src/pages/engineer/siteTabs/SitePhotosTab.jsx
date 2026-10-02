import React, { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import { ConfirmDialog } from '../../../components/UI';
import { Icon } from '../../../components/Icon';
import { API_BASE_URL } from '../../../utils/format';
import { Modal, dateFmt } from './shared';

/** Small inline label + control, matching the site's form styling. */
const FieldLabel = ({ label, hint, children }) => (
  <div className="mb-3">
    <label className="label">{label}</label>
    {children}
    {hint && <p className="help-text mt-1">{hint}</p>}
  </div>
);


const fmtSize = (bytes) => {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Turns a stored file reference into something an <img> can load.
 *  - S3/R2: the API already returned a short-lived signed URL.
 *  - local: the authenticated download route. The absolute origin is added here
 *    because the browser would otherwise resolve "/api/..." against the
 *    frontend's own host and 404 in production.
 */
const srcFor = (photo) => {
  if (photo.url) return photo.url;
  if (photo.downloadUrl) return `${API_BASE_URL}${photo.downloadUrl}`;
  return '';
};

const SitePhotosTab = ({ siteId, onChanged }) => {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [files, setFiles] = useState([]);
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get(`/sites/${siteId}/documents`, {
        params: { fileType: 'Site Photo' },
      });
      setPhotos(Array.isArray(data?.data) ? data.data : []);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { load(); }, [load]);

  // Object URLs are revoked so a long browsing session does not leak memory.
  useEffect(() => () => {
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
  }, [files]);

  const pickFiles = (list) => {
    const all = Array.from(list || []);
    const picked = all.filter((f) => f.type.startsWith('image/'));
    const rejected = all.length - picked.length;
    if (rejected > 0) toast.warn(`${rejected} file(s) skipped — only images can be added here`);
    if (!picked.length) return;
    setFiles((prev) => [
      ...prev,
      ...picked.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
  };

  const removePicked = (index) => {
    setFiles((prev) => {
      const target = prev[index];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const resetComposer = () => {
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    setCaption('');
  };

  const upload = async () => {
    if (!files.length) {
      toast.error('Choose at least one photo');
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const fd = new FormData();
      files.forEach(({ file }) => fd.append('files', file));
      if (caption.trim()) fd.append('notes', caption.trim());

      await api.post(`/sites/${siteId}/photos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      toast.success(`${files.length} photo${files.length === 1 ? '' : 's'} uploaded`);
      setShowUpload(false);
      resetComposer();
      load();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/sites/${siteId}/documents/${pendingDelete._id}`);
      toast.success('Photo deleted');
      setPendingDelete(null);
      if (preview && preview._id === pendingDelete._id) setPreview(null);
      load();
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-200">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Icon name="image" className="w-4 h-4" /> Site Photos
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {loading ? 'Loading photos…' : `${photos.length} photo${photos.length === 1 ? '' : 's'} on this site`}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setShowUpload(true)}
          disabled={loading || uploading}
        >
          <Icon name="plus" className="w-4 h-4 mr-1" /> Add Photos
        </button>
      </div>

      <div className="p-4">
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && loadError && (
          <div className="alert alert-danger flex items-center justify-between">
            <span>{loadError}</span>
            <button type="button" className="btn btn-sm btn-secondary" onClick={load}>Retry</button>
          </div>
        )}

        {!loading && !loadError && photos.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon"><Icon name="image" className="w-6 h-6" /></div>
            <p className="empty-state-title">No photos yet</p>
            <p className="empty-state-description">
              Add site photos to keep a visual record of daily progress for this project.
            </p>
            <button type="button" className="btn btn-primary btn-sm mt-3" onClick={() => setShowUpload(true)}>
              + Add Photos
            </button>
          </div>
        )}

        {!loading && !loadError && photos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((photo) => (
              <figure
                key={photo._id}
                className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
              >
                <button
                  type="button"
                  className="block w-full aspect-square focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  onClick={() => setPreview(photo)}
                  aria-label={`View photo ${photo.originalName || ''}`}
                >
                  <img
                    src={srcFor(photo)}
                    alt={photo.notes || photo.originalName || 'Site photo'}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                  />
                </button>

                <button
                  type="button"
                  className="absolute top-2 right-2 btn btn-icon bg-white/90 text-danger-600 shadow"
                  onClick={() => setPendingDelete(photo)}
                  aria-label={`Delete photo ${photo.originalName || ''}`}
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>

                <figcaption className="px-2 py-1.5 text-xs text-gray-600 bg-white border-t border-gray-200">
                  <span className="block truncate font-medium text-gray-800" title={photo.originalName}>
                    {photo.notes || photo.originalName || 'Photo'}
                  </span>
                  <span className="text-gray-400">
                    {dateFmt(photo.uploadedDate)} · {fmtSize(photo.size)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>


      {/* ---- upload composer ---- */}
      {showUpload && (
        <Modal
          title="Add Site Photos"
          onClose={() => { if (!uploading) { setShowUpload(false); resetComposer(); } }}
          onSubmit={upload}
          submitting={uploading}
        >
          <Field label="Photos" hint="Select one or many images. On a phone this also offers the camera.">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="input"
              onChange={(e) => { pickFiles(e.target.files); e.target.value = ''; }}
              disabled={uploading}
            />
          </Field>

          {files.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-gray-500 mb-2">{files.length} selected</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {files.map((f, i) => (
                  <div key={f.preview} className="relative">
                    <img
                      src={f.preview}
                      alt=""
                      className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                    />
                    <button
                      type="button"
                      className="absolute top-1 right-1 btn btn-icon bg-white/90 text-danger-600"
                      onClick={() => removePicked(i)}
                      aria-label={`Remove ${f.file.name}`}
                      disabled={uploading}
                    >
                      <Icon name="close" className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3">
            <Field label="Caption (optional)" hint="Shown under the photo, e.g. 'Foundation completed'.">
              <input
                type="text"
                className="input"
                value={caption}
                maxLength={200}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Foundation completed"
                disabled={uploading}
              />
            </Field>
          </div>

          {uploading && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ---- lightbox ---- */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
        >
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={srcFor(preview)}
              alt={preview.notes || preview.originalName || 'Site photo'}
              className="w-full max-h-[80vh] object-contain rounded-lg"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-white">
              <div className="min-w-0">
                <p className="font-medium truncate">{preview.notes || preview.originalName}</p>
                <p className="text-xs text-gray-300">
                  {dateFmt(preview.uploadedDate)} · {fmtSize(preview.size)}
                </p>
              </div>
              <div className="flex gap-2">
                <a className="btn btn-sm btn-secondary" href={srcFor(preview)} download={preview.originalName || 'photo'}>
                  Download
                </a>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => setPendingDelete(preview)}>
                  Delete
                </button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingDelete)}
        title="Delete photo"
        message={`Delete "${pendingDelete?.notes || pendingDelete?.originalName || 'this photo'}"? This cannot be undone.`}
        confirmText={deleting ? 'Deleting…' : 'Delete'}
        isDangerous
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default SitePhotosTab;
