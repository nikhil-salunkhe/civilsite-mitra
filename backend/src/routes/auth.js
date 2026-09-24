const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { upload } = require('../middleware/fileUpload');

// Public routes
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Protected routes
router.post('/logout', authController.logout);
router.get('/me', auth, authController.getMe);
// `photo` is optional: JSON requests still work, multipart requests can attach
// a profile picture which the controller stores under /uploads.
router.put('/profile', auth, upload.single('photo'), authController.updateProfile);
router.post('/change-password', auth, authController.changePassword);

module.exports = router;
