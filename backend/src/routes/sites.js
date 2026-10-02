const express = require('express');
const router = express.Router();
const { validate, siteSchema, paymentSchema, expenseSchema } = require('../validators');
const siteController = require('../controllers/siteController');
const {
  getPayments, createPayment, updatePayment, deletePayment
} = require('../controllers/paymentController');
const {
  getInstallments, createInstallment, updateInstallment, deleteInstallment
} = require('../controllers/installmentController');
const {
  getWorkers, createWorker, updateWorker, deleteWorker
} = require('../controllers/workerController');
const {
  getWorkerPayments, createWorkerPayment, updateWorkerPayment, deleteWorkerPayment
} = require('../controllers/workerPaymentController');
const {
  getMaterials, createMaterial, updateMaterial, deleteMaterial
} = require('../controllers/materialController');
const {
  getMaterialUsage, createMaterialUsage, updateMaterialUsage, deleteMaterialUsage, getMaterialStock
} = require('../controllers/materialUsageController');
const {
  getAttendance, markAttendance, bulkMarkAttendance, updateAttendance, deleteAttendance, getAttendanceSummary
} = require('../controllers/workerAttendanceController');
const {
  getVendors, createVendor, updateVendor, deleteVendor, getVendorLedger
} = require('../controllers/vendorController');
const {
  getVendorPayments, createVendorPayment, deleteVendorPayment
} = require('../controllers/vendorPaymentController');
const {
  getExpenses, createExpense, updateExpense, deleteExpense
} = require('../controllers/expenseController');
const {
  getActivities, createActivity, updateActivity, deleteActivity, updateProgress
} = require('../controllers/activityController');
const {
  getDocuments, uploadDocument, uploadMultiplePhotos, deleteDocument, getDocumentFile
} = require('../controllers/documentController');
const reportController = require('../controllers/reportController');
const { auth } = require('../middleware/auth');
const { loadSite } = require('../middleware/siteAccess');
const { uploadSingle, uploadMultiple } = require('../middleware/fileUpload');

// All routes require authentication
router.use(auth);

// MULTI-TENANT GUARD
// Every route below that declares ':siteId' first runs loadSite(), which
// verifies the site belongs to the authenticated engineer (404 otherwise) and
// exposes it as req.site. This means nested resources such as
// '/:siteId/payments' can never leak across engineers.
router.param('siteId', loadSite);

// IMPORTANT: static/specific paths must be declared BEFORE '/:siteId'
// otherwise Express would match 'summary' as a site id.

// Site routes
router.get('/', siteController.getSites);
router.post('/', validate(siteSchema), siteController.createSite);
router.get('/summary', siteController.getSiteSummary);
router.get('/latest', siteController.getLatestSite);

// Site by ID routes
router.get('/:siteId', siteController.getSite);
router.put('/:siteId', siteController.updateSite);
router.delete('/:siteId', siteController.deleteSite);
router.get('/:siteId/summary', siteController.getSiteSummary);
router.patch('/:siteId/archive', siteController.archiveSite);
router.patch('/:siteId/complete', siteController.completeSite);

// Progress
router.put('/:siteId/progress', updateProgress);
// Alias: the Overview tab's quick control posts an explicit percentage, and
// PATCH is the natural verb for that partial update.
router.patch('/:siteId/progress', updateProgress);

// Payments
router.get('/:siteId/payments', getPayments);
router.post('/:siteId/payments', validate(paymentSchema), createPayment);
router.put('/:siteId/payments/:id', updatePayment);
router.delete('/:siteId/payments/:id', deletePayment);

// Installments
router.get('/:siteId/installments', getInstallments);
router.post('/:siteId/installments', createInstallment);
router.put('/:siteId/installments/:id', updateInstallment);
router.delete('/:siteId/installments/:id', deleteInstallment);

// Worker payments -- declared BEFORE '/:siteId/workers/:id' so that
// PUT '/:siteId/workers/payments' is not swallowed by the ':id' route.
router.get('/:siteId/worker-payments', getWorkerPayments);
router.post('/:siteId/worker-payments', createWorkerPayment);
router.put('/:siteId/worker-payments/:id', updateWorkerPayment);
router.delete('/:siteId/worker-payments/:id', deleteWorkerPayment);

// Workers
router.get('/:siteId/workers', getWorkers);
router.post('/:siteId/workers', createWorker);
router.put('/:siteId/workers/:id', updateWorker);
router.delete('/:siteId/workers/:id', deleteWorker);

// Materials
router.get('/:siteId/materials', getMaterials);
router.post('/:siteId/materials', createMaterial);
router.put('/:siteId/materials/:id', updateMaterial);
router.delete('/:siteId/materials/:id', deleteMaterial);

// Material usage + derived stock (read-only projection over purchases/usage)
router.get('/:siteId/material-stock', getMaterialStock);
router.get('/:siteId/material-usage', getMaterialUsage);
router.post('/:siteId/material-usage', createMaterialUsage);
router.put('/:siteId/material-usage/:id', updateMaterialUsage);
router.delete('/:siteId/material-usage/:id', deleteMaterialUsage);

// Worker attendance.
// 'bulk' and 'summary' are declared BEFORE '/:id' so Express does not treat
// those literal segments as an attendance id.
router.get('/:siteId/attendance/summary', getAttendanceSummary);
router.post('/:siteId/attendance/bulk', bulkMarkAttendance);
router.get('/:siteId/attendance', getAttendance);
router.post('/:siteId/attendance', markAttendance);
router.put('/:siteId/attendance/:id', updateAttendance);
router.delete('/:siteId/attendance/:id', deleteAttendance);

// Vendor payments -- declared BEFORE '/:siteId/vendors/:id' (same reason as above)
router.get('/:siteId/vendor-payments', getVendorPayments);
router.post('/:siteId/vendor-payments', createVendorPayment);
router.delete('/:siteId/vendor-payments/:id', deleteVendorPayment);

// Vendors
router.get('/:siteId/vendors', getVendors);
router.post('/:siteId/vendors', createVendor);
router.put('/:siteId/vendors/:id', updateVendor);
router.delete('/:siteId/vendors/:id', deleteVendor);
// Read-only ledger (purchases as debit, payments as credit, running balance)
router.get('/:siteId/vendors/:id/ledger', getVendorLedger);

// Expenses
router.get('/:siteId/expenses', getExpenses);
router.post('/:siteId/expenses', validate(expenseSchema), createExpense);
router.put('/:siteId/expenses/:id', updateExpense);
router.delete('/:siteId/expenses/:id', deleteExpense);

// Activities
router.get('/:siteId/activities', getActivities);
router.post('/:siteId/activities', createActivity);
router.put('/:siteId/activities/:id', updateActivity);
router.delete('/:siteId/activities/:id', deleteActivity);

// Documents
router.get('/:siteId/documents', getDocuments);
router.post('/:siteId/documents', uploadSingle, uploadDocument);
// Gallery upload: many photos in one request (field name "files").
router.post('/:siteId/photos', uploadMultiple, uploadMultiplePhotos);
router.get('/:siteId/documents/:id/download', getDocumentFile);
router.delete('/:siteId/documents/:id', deleteDocument);

// Reports & exports
router.get('/:siteId/reports', reportController.getReports);
router.get('/:siteId/report/pdf', reportController.getSitePdfReport);
router.get('/:siteId/export/excel', reportController.exportExcel);
router.get('/:siteId/export/csv', reportController.exportCsv);
// Per-material PDF (complete history of one material) - declared after the
// generic /reports route so it can never be shadowed by it.
router.get(
  '/:siteId/reports/material/:materialId/pdf',
  reportController.getMaterialPdfReport,
);
// Weekly / monthly / custom material purchase + usage report.
router.get(
  '/:siteId/reports/material-period',
  reportController.getMaterialPeriodPdfReport,
);
router.get(
  '/:siteId/reports/material-period/preview',
  reportController.getMaterialPeriodPreview,
);

module.exports = router;

