const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authController = require('../controllers/authController');
const { auth, authorize } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');
const { upload } = require('../middleware/fileUpload');

// All routes require authentication and super admin role
router.use(auth);
router.use(authorize(USER_ROLES.SUPER_ADMIN));

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Global reports & analytics (Date/Engineer/Status/Site filters)
router.get('/reports', adminController.getReports);

// Engineers
router.get('/engineers', adminController.getEngineers);
router.get('/engineers/:id', adminController.getEngineer);
router.post('/engineers', upload.single('photo'), adminController.createEngineer);
router.put('/engineers/:id', upload.single('photo'), adminController.updateEngineer);
router.patch('/engineers/:id/status', adminController.changeEngineerStatus);
// Password resets live in the auth controller (shared logic with self-service resets)
router.post('/engineers/:id/reset-password', authController.adminResetPassword);
router.delete('/engineers/:id', adminController.deleteEngineer);

// All Sites (admin view)
router.get('/sites', adminController.getAllSites);

// Audit Logs
router.get('/audit-logs', adminController.getAuditLogs);

module.exports = router;
