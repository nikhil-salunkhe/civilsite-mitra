require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

/**
 * Read a required environment variable.
 *
 * In production a missing variable is a fatal configuration error - we fail fast
 * with a clear message instead of silently falling back to a localhost default
 * that will never work in a container (and previously caused
 * "ECONNREFUSED 127.0.0.1:27017" on Render).
 *
 * In development the fallback is kept so `npm run dev` works with no setup.
 */
const required = (name, devFallback) => {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (IS_PROD) {
    throw new Error(
      `[config] Missing required environment variable "${name}". `
      + `Set it in your host's environment (e.g. Render dashboard > Environment). `
      + 'The application will not start with a development fallback in production.'
    );
  }
  return devFallback;
};

const optionalUrl = (name, devFallback) => {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  // In production CLIENT_URL/SERVER_URL are optional only if we are served from
  // the same origin; they are still expected, so warn loudly rather than fail
  // (a single-origin deployment legitimately sets neither).
  if (IS_PROD) {
    console.warn(`[config] "${name}" is not set. Assuming same-origin deployment.`);
    return null;
  }
  return devFallback;
};

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: NODE_ENV,
  isProduction: IS_PROD,

  // Required in production. No localhost fallback can survive a container deploy.
  mongoUri: required('MONGO_URI', 'mongodb://localhost:27017/civilsite-mitra'),

  jwt: {
    secret: required('JWT_SECRET', 'your-super-secret-jwt-key-change-in-production'),
    expire: process.env.JWT_EXPIRE || '7d',
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d',
  },

  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@civilsitemitra.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456',
  },

  clientUrl: optionalUrl('CLIENT_URL', 'http://localhost:5173'),
  serverUrl: optionalUrl('SERVER_URL', 'http://localhost:5000'),
  // CORS accepts a list; a single deployment may legitimately have no CLIENT_URL.
  corsOrigins: (() => {
    const list = (process.env.CORS_ORIGINS || process.env.CLIENT_URL || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return list.length ? list : IS_PROD ? false : ['http://localhost:5173'];
  })(),

  // Throttling. A construction site office typically shares a single public IP
  // (or sits behind a NAT), so the general API budget must comfortably cover a
  // handful of engineers browsing dashboards. Only the credential endpoints
  // need a tight budget, which is what slows down password guessing.
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 2000,
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 20,
  },

  upload: {
    path: process.env.UPLOAD_PATH || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760,
    // A gallery upload may carry several photos in one request.
    maxFiles: parseInt(process.env.MAX_FILES_PER_UPLOAD) || 20,
    allowedTypes: (process.env.ALLOWED_FILE_TYPES
      || 'image/jpeg,image/png,image/gif,image/webp,application/pdf')
      .split(',')
      .map(type => type.trim()),
    /**
     * 'local' writes to UPLOAD_PATH (fine for development, lost on redeploy).
     * 's3' uploads to any S3-compatible bucket - AWS S3 or Cloudflare R2.
     * Read by services/storageService.js; the rest of the app is provider
     * agnostic, so no credentials are exposed anywhere else.
     */
    storageProvider: (process.env.STORAGE_PROVIDER || 'local').toLowerCase(),
  },
};
