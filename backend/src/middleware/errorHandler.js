// Custom API Error Class
class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal Server Error';

  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error(`❌ ERROR: ${err.message}`);
    console.error(err.stack);
  }

  // Handle specific errors
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    err = new ApiError(messages.join(', '), 400);
  }

  if (err.name === 'CastError') {
    err = new ApiError(`Invalid ID format: ${err.value}`, 400);
  }

  if (err.code === 11000) {
    const key = Object.keys(err.keyPattern)[0];
    err = new ApiError(`Duplicate field value: ${key}`, 400);
  }

  if (err.name === 'JsonWebTokenError') {
    err = new ApiError('Invalid token', 401);
  }

  if (err.name === 'TokenExpiredError') {
    err = new ApiError('Token expired', 401);
  }

  // Send response
  res.status(err.statusCode).json({
    success: false,
    message: err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Not found handler
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = { ApiError, asyncHandler, errorHandler, notFoundHandler };
