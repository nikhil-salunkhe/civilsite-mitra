const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const config = require('../config');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const { ACCOUNT_STATUS, USER_ROLES, TERMS_VERSION } = require('../config/constants');
const storage = require('../services/storageService');

// Human readable text for each account status - used by login and the auth
// middleware so the engineer always knows why they cannot get in.
const STATUS_MESSAGES = {
  [ACCOUNT_STATUS.SUSPENDED]: 'Your account has been suspended. Please contact your administrator.',
  [ACCOUNT_STATUS.BLOCKED]: 'Your account has been blocked. Please contact your administrator.',
  [ACCOUNT_STATUS.INACTIVE]: 'Your account is inactive. Please contact your administrator.',
};

const COOKIE_NAME = 'csm_token';

/**
 * Whether this user still has to accept the current Terms & Conditions.
 *
 * Engineers provisioned by the Super Admin start with termsAccepted = false,
 * so they are held at the T&C gate on first sign-in. Acceptance is pinned to a
 * revision, so publishing a new version re-prompts everyone who accepted an
 * older one. Super Admins are exempt - they publish the terms rather than
 * being asked to agree to them.
 */
const mustAcceptTerms = (user) => {
  if (user.role === USER_ROLES.SUPER_ADMIN) return false;
  return !user.termsAccepted || user.termsVersion !== TERMS_VERSION;
};

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Sign a JWT for a user
const generateToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role, status: user.status },
    config.jwt.secret,
    { expiresIn: config.jwt.expire }
  );

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError('Please provide email and password', 400);
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');

  // Same message for unknown user and wrong password (no account enumeration).
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError('Invalid email or password', 401);
  }

  // Account status is validated on the backend - not just hidden in the UI.
  if (user.status !== ACCOUNT_STATUS.ACTIVE) {
    const message = STATUS_MESSAGES[user.status] || 'Your account is not active. Please contact your administrator.';
    return res.status(403).json({ success: false, message, code: user.status });
  }

  user.lastLogin = new Date();
  user.loginCount = (user.loginCount || 0) + 1;
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user);

  res.cookie(COOKIE_NAME, token, cookieOptions);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    token,
    data: {
      user: user.getPublicProfile(),
      mustChangePassword: user.mustChangePassword,
      mustAcceptTerms: mustAcceptTerms(user),
      termsVersion: TERMS_VERSION,
    },
  });
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

// GET /api/auth/me
// Returns the authenticated user. The UI calls this on every app boot, which is
// what makes a Super Admin status change take effect on the engineer's very next
// request (the auth middleware re-reads the status from the database).
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  res.status(200).json({
    success: true,
    data: {
      user: user.getPublicProfile(),
      mustChangePassword: user.mustChangePassword,
      mustAcceptTerms: mustAcceptTerms(user),
      termsVersion: TERMS_VERSION,
    },
  });
});

// POST /api/auth/accept-terms
//
// Records that the signed-in user read and accepted the current Terms &
// Conditions. Only the acceptance metadata is written - never the IP, the
// password, or anything else that would make this an audit trail the user
// cannot control. An AuditLog entry is left to the admin-facing audit system.
const acceptTerms = asyncHandler(async (req, res) => {
  const { accepted } = req.body || {};

  if (accepted !== true) {
    throw new ApiError('You must accept the Terms & Conditions to continue', 400);
  }

  const user = await User.findById(req.userId);
  if (!user) {
    throw new ApiError('User not found', 404);
  }

  user.termsAccepted = true;
  user.termsAcceptedAt = new Date();
  user.termsVersion = TERMS_VERSION;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Terms & Conditions accepted',
    data: {
      termsAccepted: true,
      termsAcceptedAt: user.termsAcceptedAt,
      termsVersion: user.termsVersion,
    },
  });
});

// PUT /api/auth/profile
const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  const { name, mobile, company, address, profilePhoto, email } = req.body;

  const oldPhoto = user.profilePhoto;

  // An uploaded file takes precedence over any profilePhoto string in the body.
  // The file arrives as a memory buffer (multer.memoryStorage), so it is
  // written through storageService rather than relying on a disk filename.
  const uploadedPhoto = req.file ? await storage.saveProfilePhoto(req.file) : profilePhoto;

  // Multipart bodies only contain flat strings, so the client may send the
  // address either as a real object (JSON request) or as JSON text (FormData).
  let addressInput = address;
  if (typeof addressInput === 'string') {
    try {
      addressInput = JSON.parse(addressInput);
    } catch (err) {
      addressInput = undefined;
    }
  }

  // Engineers are identified by the email the Super Admin issued, so only the
  // Super Admin may change an email address.
  if (email && email.toLowerCase() !== user.email) {
    if (user.role !== USER_ROLES.SUPER_ADMIN) {
      throw new ApiError('Engineers cannot change their email address. Please contact your administrator.', 403);
    }
    const duplicate = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
    if (duplicate) {
      throw new ApiError('This email is already in use', 400);
    }
    user.email = email.toLowerCase();
  }

  if (name) user.name = name;
  if (mobile) user.mobile = mobile;
  if (company !== undefined) user.company = company;
  if (uploadedPhoto !== undefined) user.profilePhoto = uploadedPhoto;

  if (addressInput && typeof addressInput === 'object') {
    user.address = {
      street: addressInput.street !== undefined ? addressInput.street : user.address?.street,
      city: addressInput.city !== undefined ? addressInput.city : user.address?.city,
      state: addressInput.state !== undefined ? addressInput.state : user.address?.state,
    };
  }

  await user.save();

  // Best-effort: remove the replaced/removed photo from storage. Key
  // traversal is guarded inside the service, so a corrupted or foreign value
  // can never reach outside the uploads folder.
  if (oldPhoto && oldPhoto !== user.profilePhoto) {
    await storage.removeProfilePhoto(oldPhoto);
  }

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: user.getPublicProfile(),
  });
});

// POST /api/auth/change-password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ApiError('Please provide current and new password', 400);
  }

  if (newPassword.length < 6) {
    throw new ApiError('New password must be at least 6 characters', 400);
  }

  const user = await User.findById(req.userId).select('+password');

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  const isMatch = await user.comparePassword(currentPassword);

  if (!isMatch) {
    throw new ApiError('Current password is incorrect', 401);
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  user.resetToken = null;
  user.resetExpiry = null;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password changed successfully',
  });
});

// POST /api/auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError('Please provide email', 400);
  }

  const user = await User.findOne({ email: String(email).toLowerCase().trim() });

  const genericResponse = {
    success: true,
    message: 'If this email exists, a password reset link will be sent.',
  };

  if (!user) {
    return res.status(200).json(genericResponse);
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.resetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save({ validateBeforeSave: false });

  // NOTE: no mail provider is configured for this deployment. In development the
  // raw token is returned so the flow is testable; in production it is withheld.
  res.status(200).json({
    ...genericResponse,
    resetToken: config.nodeEnv === 'production' ? undefined : resetToken,
  });
});

// POST /api/auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    throw new ApiError('Please provide token and new password', 400);
  }

  if (newPassword.length < 6) {
    throw new ApiError('New password must be at least 6 characters', 400);
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    resetToken: hashedToken,
    resetExpiry: { $gt: new Date() },
  }).select('+password');

  if (!user) {
    throw new ApiError('Invalid or expired reset token', 400);
  }

  user.password = newPassword;
  user.resetToken = null;
  user.resetExpiry = null;
  user.mustChangePassword = false;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password reset successfully. You can now login with your new password.',
  });
});

// POST /api/admin/engineers/:id/reset-password
// Super Admin issues a fresh temporary password for an engineer.
const adminResetPassword = asyncHandler(async (req, res) => {
  const { generateTempPassword } = require('./adminController');
  const password = req.body.password || generateTempPassword();

  if (password.length < 6) {
    throw new ApiError('Password must be at least 6 characters', 400);
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  user.password = password;
  user.mustChangePassword = true;
  user.resetToken = null;
  user.resetExpiry = null;
  await user.save();

  await AuditLog.create({
    admin: req.userId,
    adminName: req.user.name,
    adminEmail: req.user.email,
    action: 'Password Reset',
    engineer: user._id,
    engineerName: user.name,
    description: `Password reset for ${user.email}`,
  });

  res.status(200).json({
    success: true,
    message: 'Password reset successfully. The engineer must change it on next login.',
    data: { temporaryPassword: password, email: user.email },
  });
});

module.exports = {
  login,
  logout,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  adminResetPassword,
  acceptTerms,
  generateToken,
};
