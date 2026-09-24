require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/civilsite-mitra',

  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expire: process.env.JWT_EXPIRE || '7d',
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d',
  },

  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@civilsitemitra.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@123456',
  },

  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  serverUrl: process.env.SERVER_URL || 'http://localhost:5000',

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
    allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,application/pdf')
      .split(',')
      .map(type => type.trim()),
  },
};
