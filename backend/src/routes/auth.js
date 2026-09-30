const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validate, loginSchema } = require('../validators');
const { auth } = require('../middleware/auth');
const { upload } = require('../middleware/fileUpload');

// Public routes
router.post('/login', validate(loginSchema), authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
// Sign-out is fired AFTER the client clears its token and lands on /login.
// It must stay public: behind `auth` it 401s ("Access denied. No token
// provided."), and that 401 either toasts on the login screen or, worse,
// the 401 handler bounces back through the router while the login screen is
// showing - unmounting it under the user's feet.
router.post('/logout', authController.logout);

// Protected routes
router.get('/me', auth, authController.getMe);
// `photo` is optional: JSON requests still work, multipart requests can attach
// a profile picture which the controller stores under /uploads.
router.put('/profile', auth, upload.single('photo'), authController.updateProfile);
router.post('/change-password', auth, authController.changePassword);

module.exports = router;
