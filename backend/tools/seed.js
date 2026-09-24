/* eslint-disable no-console */
/**
 * Creates/refreshes the Super Admin account from environment variables.
 * Safe to run repeatedly - it upserts and never deletes existing engineers.
 *
 * Usage: node tools/seed.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const config = require('../src/config');
const User = require('../src/models/User');
const { USER_ROLES, ACCOUNT_STATUS } = require('../src/config/constants');

const run = async () => {
  await mongoose.connect(config.mongoUri);
  console.log(`Connected to ${mongoose.connection.name}`);

  const email = (config.superAdmin?.email || 'admin@civilsitemitra.com').toLowerCase();
  const password = config.superAdmin?.password || 'Admin@123456';

  const existing = await User.findOne({ email }).select('+password');

  if (existing) {
    if (existing.role !== USER_ROLES.SUPER_ADMIN) {
      console.log(`User ${email} exists but is not a SUPER_ADMIN - skipping password change.`);
    } else {
      existing.password = password;
      existing.status = ACCOUNT_STATUS.ACTIVE;
      await existing.save();
      console.log(`Super Admin ${email} refreshed (password reset to env value).`);
    }
  } else {
    await User.create({
      name: 'Super Admin',
      email,
      mobile: '9999999999',
      password,
      role: USER_ROLES.SUPER_ADMIN,
      status: ACCOUNT_STATUS.ACTIVE,
      mustChangePassword: false,
    });
    console.log(`Super Admin created: ${email} / ${password}`);
  }

  const counts = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);
  console.log('Users by role:', counts.map((c) => `${c._id}=${c.count}`).join(', '));

  await mongoose.disconnect();
  console.log('Seed complete.');
};

run().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
