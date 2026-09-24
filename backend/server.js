require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const app = require('./src/app');
const connectDB = require('./src/config/db');
const config = require('./src/config');

// Connect to MongoDB
connectDB();

// Start server
const PORT = config.port || 5000;

const server = app.listen(PORT, () => {
  console.log(`\n🚀 CivilSiteMitra Server running on port ${PORT}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`📁 Upload path: ${config.upload.path}`);
  console.log(`🔗 Client URL: ${config.clientUrl}\n`);
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
