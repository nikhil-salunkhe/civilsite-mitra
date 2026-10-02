const Document = require('../models/Document');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const storage = require('../services/storageService');
const { DOCUMENT_TYPES } = require('../config/constants');

/** How long a generated S3/R2 URL stays valid. */
const SIGNED_URL_TTL = 10 * 60; // 10 minutes

const isImage = (mime) => String(mime || '').startsWith('image/');

/**
 * Ownership is already enforced for the site by router.param('siteId', loadSite),
 * which 404s for a foreign site. These helpers re-check the document itself so
 * a handler can never be reused somewhere the param middleware is missing.
 */
const loadOwnedDocument = async (siteId, documentId) => {
  const document = await Document.findById(documentId);
  // A missing document and someone else's document are reported identically.
  if (!document || document.site.toString() !== String(siteId)) {
    throw new ApiError('Document not found', 404);
  }
  return document;
};

/** The storage key of a row, falling back for records written before the field existed. */
const keyOf = (document) => document.storageKey || document.fileName;

/**
 * Shapes a document for the API, replacing any storage credential with a
 * short-lived URL. Never returns the bucket, key namespace or an access key.
 */
const present = async (document, { withUrl = false } = {}) => {
  const out = {
    _id: document._id,
    site: document.site,
    fileName: document.fileName,
    originalName: document.originalName,
    fileType: document.fileType,
    mimeType: document.mimeType,
    size: document.size,
    uploadedDate: document.uploadedDate,
    notes: document.notes,
    isPhoto: isImage(document.mimeType),
  };
  if (withUrl) {
    // For S3/R2 a signed URL; for local the client uses the authenticated
    // download route, so the URL field stays null.
    out.url = document.storageProvider === 's3'
      ? await storage.signedUrl(keyOf(document), SIGNED_URL_TTL)
      : null;
    out.downloadUrl = `/api/sites/${document.site}/documents/${document._id}/download`;
  }
  return out;
};

/** GET /api/sites/:siteId/documents */
const getDocuments = asyncHandler(async (req, res) => {
  const query = { site: req.params.siteId, isActive: { $ne: false } };
  if (req.query.fileType) query.fileType = req.query.fileType;

  const documents = await Document.find(query).sort({ uploadedDate: -1 });
  res.status(200).json({
    success: true,
    data: await Promise.all(documents.map((d) => present(d, { withUrl: true }))),
  });
});

/** POST /api/sites/:siteId/documents */
const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError('No file uploaded', 400);
  }

  const folder = isImage(req.file.mimetype) ? 'photos' : 'documents';
  const key = storage.buildKey(folder, req.file.originalname);

  // Write through the configured provider. If this throws (misconfigured S3,
  // for example) nothing is recorded, so no orphan metadata row is left behind.
  const saved = await storage.save(key, req.file.buffer);

  const requestedType = req.body.fileType;
  const validTypes = Object.values(DOCUMENT_TYPES);
  const fileType = (requestedType && validTypes.includes(requestedType))
    ? requestedType
    : (isImage(req.file.mimetype) ? DOCUMENT_TYPES.SITE_PHOTO : DOCUMENT_TYPES.OTHER);

  const document = await Document.create({
    site: req.params.siteId,
    engineer: req.userId,
    fileName: key,
    storageKey: saved.key,
    storageProvider: storage.provider,
    originalName: req.file.originalname,
    fileType,
    mimeType: req.file.mimetype,
    size: saved.size,
    notes: req.body.notes || req.body.description || '',
    uploadedDate: req.body.date ? new Date(req.body.date) : new Date(),
  });

  res.status(201).json({
    success: true,
    data: await present(document, { withUrl: true }),
    message: 'Document uploaded successfully',
  });
});

/** DELETE /api/sites/:siteId/documents/:id */
const deleteDocument = asyncHandler(async (req, res) => {
  const document = await loadOwnedDocument(req.params.siteId, req.params.id);
  await storage.remove(keyOf(document));
  await document.deleteOne();
  res.status(200).json({ success: true, message: 'Document deleted successfully' });
});

/** GET /api/sites/:siteId/documents/:id/download */
const getDocumentFile = asyncHandler(async (req, res) => {
  const document = await loadOwnedDocument(req.params.siteId, req.params.id);

  // Remote storage: hand back a short-lived signed URL instead of proxying
  // bytes through the API.
  if (document.storageProvider === 's3' || storage.isRemote) {
    const url = await storage.signedUrl(keyOf(document), SIGNED_URL_TTL);
    return res.json({ success: true, data: { url, expiresIn: SIGNED_URL_TTL } });
  }

  let buffer;
  try {
    buffer = await storage.read(keyOf(document));
  } catch (err) {
    throw new ApiError('File not found', 404);
  }

  res.setHeader('Content-Type', document.mimeType || storage.contentTypeFor(keyOf(document)));
  res.setHeader('Content-Length', buffer.length);
  // Never let a browser render an untrusted upload inline as HTML.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.originalName || 'file')}"`);
  return res.send(buffer);
});

const uploadMultiplePhotos = asyncHandler(async (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    throw new ApiError('No photos uploaded', 400);
  }

  const saved = [];
  // One bad file must not discard the photos that already uploaded, so each is
  // recorded individually and the caller can see exactly what landed.
  for (const file of files) {
    const key = storage.buildKey('photos', file.originalname);
    // eslint-disable-next-line no-await-in-loop
    const result = await storage.save(key, file.buffer);
    // eslint-disable-next-line no-await-in-loop
    const document = await Document.create({
      site: req.params.siteId,
      engineer: req.userId,
      fileName: key,
      storageKey: result.key,
      storageProvider: storage.provider,
      originalName: file.originalname,
      fileType: DOCUMENT_TYPES.SITE_PHOTO,
      mimeType: file.mimetype,
      size: result.size,
      notes: req.body.notes || req.body.description || '',
      uploadedDate: req.body.date ? new Date(req.body.date) : new Date(),
    });
    saved.push(document);
  }

  res.status(201).json({
    success: true,
    data: await Promise.all(saved.map((d) => present(d, { withUrl: true }))),
    message: `${saved.length} photo${saved.length === 1 ? '' : 's'} uploaded`,
  });
});

module.exports = {
  getDocuments, uploadDocument, uploadMultiplePhotos, deleteDocument, getDocumentFile,
};


