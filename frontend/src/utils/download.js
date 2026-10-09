import { api } from '../context/AuthContext';

/**
 * Shared download helper for blob endpoints (PDF / XLSX / CSV / documents).
 *
 * - Honours the server's `Content-Disposition` filename so the saved file keeps
 *   the real extension (`.xlsx` - a `.excel` file is NOT openable: Windows has
 *   no handler for it and routes it to Word, which then reports "unreadable
 *   content"). The caller-supplied name is only a fallback.
 * - Types the Blob with the response Content-Type instead of saving a generic
 *   application/octet-stream blob.
 * - Converts JSON error payloads (which arrive as blobs on 4xx/5xx because of
 *   responseType: 'blob') back into a normal Error carrying the API message, so
 *   callers' `err.response.data.message` toasts keep working.
 */

/** Parses RFC 6266 / RFC 5987 Content-Disposition: filename* then filename. */
export const filenameFromDisposition = (header) => {
  if (!header) return '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim()).replace(/^"|"$/g, '');
    } catch {
      // malformed percent-encoding - fall through to the plain filename
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : '';
};

/** Re-throws a JSON blob error response as a normal Error with the API message. */
const raiseIfJsonBlob = async (res) => {
  const type = res.headers?.['content-type'] || '';
  if (!type.includes('json')) return;
  try {
    const text = await new Blob([res.data]).text();
    const parsed = JSON.parse(text);
    const message = parsed?.message || 'Request failed';
    const err = new Error(message);
    err.response = { status: res.status, data: parsed };
    throw err;
  } catch (e) {
    if (e instanceof SyntaxError) return; // not JSON after all - treat as download
    throw e;
  }
};

/** Triggers a browser download for a blob-returning API endpoint. */
export const downloadFile = async (path, filename) => {
  const res = await api.get(path, { responseType: 'blob' });
  await raiseIfJsonBlob(res);

  const contentType = res.headers?.['content-type'] || '';
  const serverName = filenameFromDisposition(res.headers?.['content-disposition']);
  const name = serverName || filename || 'download';

  const blob = new Blob([res.data], { type: contentType || undefined });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  return name;
};