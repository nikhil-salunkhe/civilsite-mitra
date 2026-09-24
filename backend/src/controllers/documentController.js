const Document = require('../models/Document');
const Site = require('../models/Site');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Get documents for a site
const getDocuments = asyncHandler(async (req, res) => {
  const documents = await Document.find({ site: req.params.siteId })
    .sort({ uploadedDate: -1 });

  res.status(200).json({
    success: true,
    data: documents,
  });
});

// Upload document
const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError('No file uploaded', 400);
  }

  // Verify site belongs to user
  const site = await Site.findById(req.params.siteId);
  if (!site) {
    throw new ApiError('Site not found', 404);
  }

  if (site.engineer.toString() !== req.userId.toString()) {
    throw new ApiError('Unauthorized access', 403);
  }

  // Determine file type
  const fileTypeMap = {
    'application/pdf': 'Invoice',
    'application/msword': 'Other',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Other',
    'application/vnd.ms-excel': 'Other',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Other',
  };

  let fileType = fileTypeMap[req.file.mimetype] || 'Site Photo';

  // For images, use Site Photo
  if (req.file.mimetype.startsWith('image/')) {
    fileType = 'Site Photo';
  }

  const document = new Document({
    site: req.params.siteId,
    engineer: req.userId,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    fileType,
    mimeType: req.file.mimetype,
    size: req.file.size,
    notes: req.body.notes || '',
  });

  await document.save();

  res.status(201).json({
    success: true,
    data: document,
    message: 'Document uploaded successfully',
  });
});

// Delete document
const deleteDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id);

  if (!document) {
    throw new ApiError('Document not found', 404);
  }

  if (document.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  // Delete file from disk
  const filePath = path.join(config.upload.path, document.fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await document.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Document deleted successfully',
  });
});

// Serve document file
const getDocumentFile = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id);

  if (!document) {
    throw new ApiError('Document not found', 404);
  }

  if (document.site.toString() !== req.params.siteId) {
    throw new ApiError('Unauthorized access', 403);
  }

  const filePath = path.join(config.upload.path, document.fileName);

  if (!fs.existsSync(filePath)) {
    throw new ApiError('File not found', 404);
  }

  res.download(filePath, document.originalName);
});

module.exports = { getDocuments, uploadDocument, deleteDocument, getDocumentFile };
