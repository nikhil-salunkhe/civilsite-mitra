const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');

// Import error handling middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const siteRoutes = require('./routes/sites');
const engineerRoutes = require('./routes/engineer');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));

// Rate limiting
// General API budget: generous enough for a site office sharing one IP, but
// still a guard against runaway clients. Limits are env tunable.
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  // Uptime/monitoring probes must never be throttled.
  skip: (req) => req.path === '/health',
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
});
app.use('/api/', limiter);

// Credential endpoints get a much tighter budget than the rest of the API so
// password guessing stays expensive. Successful logins are not counted, so
// normal daily usage is unaffected.
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
  },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// CORS
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Serve uploaded files
app.use('/uploads', express.static(config.upload.path));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'CivilSiteMitra API is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/engineer', engineerRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
