/* eslint-disable no-console */
/**
 * ensure-admin.js - makes sure the Super Admin account exists.
 *
 * This is the SAME logic the old tools/seed.js used (no duplicate auth code), made
 * production-safe:
 *
 *   - It NEVER prints a password. The previous version logged
 *     "Super Admin created: <email> / <password>" in plaintext.
 *   - It NEVER overwrites an existing password. Re-running it on every deploy
 *     would silently reset the admin credential.
 *   - Creating the account is idempotent, so it is safe on every restart.
 *
 * Usage
 *   node tools/ensure-admin.js                 ensure the account exists (safe)
 *   node tools/ensure-admin.js --force-create  recreate only if it is missing
 *   node tools/ensure-admin.js --reset-password  EXPLICITLY reset to the env value
 *
 * IMPORTANT: SUPER_ADMIN_PASSWORD in the environment is used ONLY to create a
 * brand new account (or when --reset-password is passed). Changing the Render
 * env var afterwards does NOT change the password already stored in MongoDB -
 * passwords are bcrypt-hashed, so they are never read back from the config.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../src/config');
const User = require('../src/models/User');
const { USER_ROLES, ACCOUNT_STATUS } = require('../src/config/constants');

const args = process.argv.slice(2);
const FORCE_CREATE = args.includes('--force-create');
const RESET_PASSWORD = args.includes('--reset-password');

const run = async () => {
  await mongoose.connect(config.mongoUri);
  console.log(`Connected to database "${mongoose.connection.name}"`);

  const email = (config.superAdmin?.email || 'admin@civilsitemitra.com').toLowerCase().trim();
  const password = config.superAdmin?.password || 'Admin@123456';

  const existing = await User.findOne({ email }).select('+password');

  // --- CASE A: account already exists -------------------------------------
  if (existing) {
    if (existing.role !== USER_ROLES.SUPER_ADMIN) {
      // Never touch an account we do not own.
      console.log(`User ${email} exists with role ${existing.role} - left untouched.`);
      console.log('Resolve the role clash manually before using this address for the admin.');
    } else if (RESET_PASSWORD) {
      // Opt-in only. Without this flag an existing password is never changed.
      existing.password = password;
      existing.status = ACCOUNT_STATUS.ACTIVE;
      await existing.save();
      console.log(`Super Admin ${email}: password EXPLICITLY reset from SUPER_ADMIN_PASSWORD.`);
      console.log('Sign in and change it immediately.');
    } else {
      // The safe, idempotent path - this is what runs on every deploy.
      let changed = false;
      if (existing.status !== ACCOUNT_STATUS.ACTIVE) {
        existing.status = ACCOUNT_STATUS.ACTIVE;
        changed = true;
      }
      if (changed) await existing.save();
      console.log(`Super Admin ${email} already exists${changed ? ' (reactivated)' : ''}.`);
      console.log('Password left as stored in the database (env var is create-only).');
    }
  } else {
    // --- CASE B: create it ---------------------------------------------------
    await User.create({
      name: 'Super Admin',
      email,
      mobile: '9999999999',
      password,
      role: USER_ROLES.SUPER_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      mustChangePassword: false,
    });
    // The password is deliberately NOT echoed to the log.
    console.log(`Super Admin created: ${email}`);
    console.log('Sign in with the password from SUPER_ADMIN_PASSWORD, then change it.');
  }

  const counts = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
  console.log('Users by role:', counts.map((c) => `${c._id}=${c.count}`).join(', '));

  await mongoose.disconnect();
  console.log('Done.');
};

run().catch((error) => {
  console.error('ensure-admin failed:', error.message);
  process.exit(1);
});
