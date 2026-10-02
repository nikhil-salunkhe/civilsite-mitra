/**
 * storageService.js - one interface for file storage, two backends.
 *
 *   STORAGE_PROVIDER=local  (default)  -> filesystem under UPLOAD_PATH
 *   STORAGE_PROVIDER=s3                  -> any S3-compatible bucket, which
 *                                           covers both AWS S3 and Cloudflare R2
 *
 * The rest of the application never touches the filesystem or the S3 SDK
 * directly: it calls save() / read() / remove() / signedUrl() with a storage
 * key, so switching providers in production is a one-line env change.
 *
 * SECURITY: nothing is made public. S3 objects are private and handed to the
 * browser as short-lived signed URLs; local files are only ever streamed
 * through an authenticated route. Credentials come from the environment and are
 * never returned, logged or sent to the client.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const PROVIDER = String(process.env.STORAGE_PROVIDER || 'local').toLowerCase();

/** Builds a collision-free key that never leaks a filesystem path. */
const buildKey = (folder, originalName) => {
  const ext = path.extname(String(originalName || '')).slice(0, 12);
  return `${folder}/${uuidv4()}${ext}`;
};

/** Guards against a stored key escaping its prefix. */
const assertSafeKey = (key) => {
  const k = String(key || '');
  if (!k || k.includes('..') || k.startsWith('/') || k.includes('\\')) {
    throw new Error('Unsafe storage key');
  }
  return k;
};

const contentTypeFor = (key) => {
  const ext = path.extname(String(key || '')).toLowerCase();
  return ({
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })[ext] || 'application/octet-stream';
};

// ---------------------------------------------------------------------------
// local filesystem
// ---------------------------------------------------------------------------
const localDir = () => path.resolve(config.upload.path);

const localPathFor = (key) => {
  const full = path.resolve(localDir(), assertSafeKey(key));
  // Defence in depth: the resolved path must stay inside the upload root.
  if (full.indexOf(localDir() + path.sep) !== 0) throw new Error('Unsafe storage key');
  return full;
};

const local = {
  async save(key, buffer) {
    const full = localPathFor(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, buffer);
    return { key, size: buffer.length };
  },
  async read(key) {
    return fsp.readFile(localPathFor(key));
  },
  async remove(key) {
    try {
      await fsp.unlink(localPathFor(key));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      return;
    }
    // Prune the folder when it is left empty, so the upload root does not
    // accumulate empty photos/ documents/ profiles/ directories forever.
    try {
      const dir = path.dirname(localPathFor(key));
      if (dir !== localDir() && dir.startsWith(localDir() + path.sep)) {
        const left = await fsp.readdir(dir);
        if (left.length === 0) await fsp.rmdir(dir);
      }
    } catch (err) {
      // Pruning is best-effort only.
    }
  },
  exists(key) {
    try {
      return fs.existsSync(localPathFor(key));
    } catch (err) {
      return false;
    }
  },
  // Local files are streamed by the authenticated route, never linked directly.
  async signedUrl() {
    return null;
  },
  contentTypeFor,
};

// ---------------------------------------------------------------------------
// S3 / Cloudflare R2  (the SDK is an OPTIONAL dependency, needed only when used)
// ---------------------------------------------------------------------------
let s3ClientPromise = null;
let s3Sdk = null;

const loadS3Sdk = () => {
  if (s3Sdk) return s3Sdk;
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    s3Sdk = require('@aws-sdk/client-s3');
    // eslint-disable-next-line global-require, import/no-unresolved
    require('@aws-sdk/s3-request-presigner');
  } catch (err) {
    const e = new Error(
      'STORAGE_PROVIDER=s3 requires the optional AWS SDK. Install it with: '
      + 'npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner',
    );
    e.statusCode = 500;
    throw e;
  }
  return s3Sdk;
};

/** Accepts either the S3_* or the R2_* naming, so both providers work. */
const s3Config = () => ({
  bucket: process.env.S3_BUCKET_NAME || process.env.R2_BUCKET_NAME,
  region: process.env.S3_REGION || process.env.R2_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT || (process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined),
  accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY,
});

/** Fails loudly rather than silently writing uploads to a disposable disk. */
const assertS3Configured = () => {
  const c = s3Config();
  const missing = ['bucket', 'accessKeyId', 'secretAccessKey'].filter((k) => !c[k]);
  if (missing.length) {
    const e = new Error(
      `STORAGE_PROVIDER=s3 but these are not set: ${missing.join(', ')}. `
      + 'Refusing to start - uploads would otherwise be written to a local disk '
      + 'that is lost on every redeploy.',
    );
    e.statusCode = 500;
    throw e;
  }
  return c;
};

const getS3Client = () => {
  if (!s3ClientPromise) {
    const { S3Client } = loadS3Sdk();
    const c = assertS3Configured();
    s3ClientPromise = Promise.resolve(new S3Client({
      region: c.region,
      endpoint: c.endpoint,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    }));
  }
  return s3ClientPromise;
};

const s3Send = async (commandName, input) => {
  const client = await getS3Client();
  return client.send(new (loadS3Sdk()[commandName])(input));
};

const s3Impl = {
  async save(key, buffer) {
    const c = assertS3Configured();
    await s3Send('PutObjectCommand', {
      Bucket: c.bucket,
      Key: key,
      Body: buffer,
      // No public-read ACL: objects stay private and are reachable only through
      // a signed URL issued after the ownership check has passed.
      ContentType: contentTypeFor(key),
    });
    return { key, size: buffer.length };
  },
  async read(key) {
    const c = assertS3Configured();
    const res = await s3Send('GetObjectCommand', { Bucket: c.bucket, Key: assertSafeKey(key) });
    return Buffer.from(await res.Body.transformToByteArray());
  },
  async remove(key) {
    const c = assertS3Configured();
    await s3Send('DeleteObjectCommand', { Bucket: c.bucket, Key: assertSafeKey(key) });
  },
  async exists() {
    // Presence is decided by the Document record, not a per-request HEAD call.
    return true;
  },
  async signedUrl(key, expiresIn) {
    const c = assertS3Configured();
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    return getSignedUrl(
      await getS3Client(),
      new (loadS3Sdk().GetObjectCommand)({ Bucket: c.bucket, Key: assertSafeKey(key) }),
      { expiresIn },
    );
  },
  contentTypeFor,
};

const impl = PROVIDER === 's3' ? s3Impl : local;

// Fail fast at boot rather than on the first upload.
if (PROVIDER === 's3') {
  try {
    assertS3Configured();
  } catch (err) {
    // Surfaced through /health and on first use; not thrown at require time so
    // tooling that only inspects the app can still load it.
    // eslint-disable-next-line no-console
    console.error(`[storage] ${err.message}`);
  }
}

/**
 * --------------------------------------------------------------------------------
 * PROFILE PHOTO STORAGE
 * --------------------------------------------------------------------------------
 * Uploads are buffered in memory (see middleware/fileUpload.js) and written
 * through storageService, so a profile photo survives a redeploy exactly like a
 * site photo does. The stored value is the PUBLIC url the browser will request
 * from app.js's static mount - not the storage key.
 *
 * Only ever called for the local provider: profile photos must be servable
 * straight from <img src>, which the app exposes at /uploads.
 */
const saveProfilePhoto = async (file) => {
  const key = `profiles/${uuidv4()}${path.extname(file.originalname || '').slice(0, 12)}`;
  // `impl` is the active backend in this module (local or S3).
  await impl.save(key, file.buffer);
  return `/uploads/${key}`;
};

/**
 * Best-effort removal of a replaced/removed photo. Guarded so a corrupted or
 * foreign value can never escape the uploads folder, and silent when the file
 * is already gone (the database record is the source of truth).
 */
const removeProfilePhoto = async (photoUrl) => {
  if (!photoUrl || typeof photoUrl !== 'string' || !photoUrl.startsWith('/uploads/')) return;
  try {
    const key = photoUrl.slice('/uploads/'.length);
    if (PROVIDER === 'local') {
      await impl.remove(key);
      return;
    }
    // For S3/R2 the photo was stored under the profiles/ prefix.
    const s3Key = key.startsWith('profiles/') ? key : `profiles/${path.basename(key)}`;
    await impl.remove(s3Key);
  } catch (err) {
    // Cleanup is best-effort; never fail the request over it.
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn('[storage] could not remove previous photo:', err.message);
    }
  }
};

module.exports = {
  provider: PROVIDER,
  isRemote: PROVIDER === 's3',
  buildKey,
  contentTypeFor,
  saveProfilePhoto,
  removeProfilePhoto,
  save: (...a) => impl.save(...a),
  read: (...a) => impl.read(...a),
  remove: (...a) => impl.remove(...a),
  exists: (...a) => impl.exists(...a),
  signedUrl: (...a) => impl.signedUrl(...a),
  /** Safe for /health - never returns a credential. */
  configStatus() {
    if (PROVIDER !== 's3') return { provider: 'local', ready: true };
    const c = s3Config();
    const missing = ['bucket', 'accessKeyId', 'secretAccessKey'].filter((k) => !c[k]);
    return { provider: 's3', ready: missing.length === 0, missing };
  },
};
