require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const app = require('./src/app');
const connectDB = require('./src/config/db');
const config = require('./src/config');

// Connect to MongoDB
connectDB();

// Start server.
// PORT is supplied by the host (Render sets it automatically). It is never
// hardcoded to a fixed number - the fallback is only for local development.
const PORT = process.env.PORT || config.port || 5000;

const server = app.listen(PORT, () => {
  console.log(`\n🚀 CivilSiteMitra Server running on port ${PORT}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`📁 Upload path: ${config.upload.path}`);
  // clientUrl may be null in production when CLIENT_URL is intentionally unset
  // (same-origin deployment), so never print an empty line as if it were a URL.
  console.log(`🔗 Client URL: ${config.clientUrl || '(same-origin / not configured)'}\n`);
});

// Handle server errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  console.error('Shutting down...');
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  console.error('Shutting down...');
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = server;
