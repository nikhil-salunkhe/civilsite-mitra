import { api } from '../context/AuthContext';

/** Triggers a browser download for a blob-returning API endpoint. */
export const downloadFile = async (path, filename) => {
  const res = await api.get(path, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};