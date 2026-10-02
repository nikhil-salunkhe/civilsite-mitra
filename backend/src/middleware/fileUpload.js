const multer = require('multer');
const config = require('../config');
const { ApiError } = require('./errorHandler');
const fs = require('fs');

// Ensure the local upload directory exists. Only meaningful for the local
// storage provider, but harmless otherwise and keeps `uploads/` browsable.
const uploadDir = config.upload.path;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = config.upload.allowedTypes;

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        `File type not allowed: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`,
        400
      ),
      false
    );
  }
};

/**
 * Uploaded files are buffered in memory rather than written straight to disk.
 * That is what lets the same route serve both storage providers: the controller
 * hands the buffer to storageService, which writes it to the filesystem or
 * pushes it to S3/R2. Nothing is written to disk unless the local provider is
 * actually configured.
 */
const storage = multer.memoryStorage();

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: config.upload.maxFiles || 10,
  },
});

// Single file upload middleware
const uploadSingle = upload.single('file');

// Multiple files upload middleware
const uploadMultiple = upload.array('files', 10);

// Field with file upload
const uploadWithField = upload.single('document');

module.exports = { upload, uploadSingle, uploadMultiple, uploadWithField };
