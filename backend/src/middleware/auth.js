const config = require('../config');
const { verify } = require('jsonwebtoken');
const User = require('../models/User');
const { ACCOUNT_STATUS } = require('../config/constants');

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const decoded = verify(token, config.jwt.secret);

    const user = await User.findById(decoded.id).select('-password -resetToken -resetExpiry');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Check account status
    if (user.status === ACCOUNT_STATUS.BLOCKED) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact admin.',
      });
    }

    if (user.status === ACCOUNT_STATUS.SUSPENDED) {
      return res.status(403).json({
        success: false,
        message: 'Your account is suspended. Please contact admin.',
      });
    }

    if (user.status === ACCOUNT_STATUS.INACTIVE) {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact admin.',
      });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Authentication error.',
    });
  }
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource.',
      });
    }
    next();
  };
};

module.exports = { auth, authorize };
