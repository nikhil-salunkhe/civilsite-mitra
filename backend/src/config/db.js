const mongoose = require('mongoose');
const config = require('./index');

/**
 * Strip any credentials out of a message before it is logged.
 *
 * The Mongoose/MongoDB driver occasionally embeds the connection string in its
 * error messages. We never want a URI - and especially never a password - to
 * reach the log stream on a public host like Render.
 */
const redact = (message = '') => String(message)
  // mongodb://user:pass@host -> mongodb://***:***@host
  .replace(/(mongodb(?:\+srv)?:\/\/)([^:@/\s]+):([^@/\s]+)@/gi, '$1***:***@')
  // any remaining user:pass@host pairs
  .replace(/([^:\s/]+):([^@/\s]+)@([A-Za-z0-9.-]+)/g, '***:***@$3');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    // Host + database name only - never the URI, never the credentials.
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);

    // Connection event listeners
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', redact(err.message));
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });

    // Atlas links can drop on network/VPN switches; the driver reconnects on
    // the next operation - log it so transient outages are visible.
    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${redact(error.message)}`);
    if (config.isProduction) {
      console.error(
        'Hint: check that MONGO_URI is set in your host environment and that the '
        + 'MongoDB Atlas IP access list allows this host. The connection string is '
        + 'never logged.'
      );
    }
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed due to app termination');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed due to app termination');
  process.exit(0);
});

module.exports = connectDB;
