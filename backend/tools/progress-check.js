// Temporary verification: Progress model (14th collection) behavior.
const mongoose = require('mongoose');
const config = require('../src/config');
const Progress = require('../src/models/Progress');

(async () => {
  await mongoose.connect(config.mongoUri);
  const siteId = new mongoose.Types.ObjectId();
  const engineerId = new mongoose.Types.ObjectId();

  // First update creates the doc (upsert)
  await Progress.findOneAndUpdate(
    { site: siteId },
    { $set: { engineer: engineerId, stages: { foundation: 50 }, overallProgress: 50 } },
    { upsert: true }
  );
  // Second update must NOT create a duplicate (unique per site)
  await Progress.findOneAndUpdate(
    { site: siteId },
    { $set: { engineer: engineerId, stages: { foundation: 80 }, overallProgress: 80 } },
    { upsert: true }
  );

  const count = await Progress.countDocuments({ site: siteId });
  const doc = await Progress.findOne({ site: siteId });

  // Duplicate site id must be rejected by the unique index
  let uniqueBlocked = false;
  try {
    await Progress.create({ site: siteId, engineer: engineerId });
  } catch (e) {
    uniqueBlocked = true;
  }

  // 0-100 validation
  let rangeBlocked = false;
  try {
    await Progress.create({ site: new mongoose.Types.ObjectId(), engineer: engineerId, overallProgress: 150 });
  } catch (e) {
    rangeBlocked = true;
  }

  await Progress.deleteMany({ site: { $in: [siteId] } });
  await Progress.deleteMany({ engineer: engineerId });
  await mongoose.disconnect();

  console.log(
    `PROGRESS_DOCS=${count} OVERALL=${doc.overallProgress} FOUNDATION=${doc.stages.foundation} ` +
    `UNIQUE_BLOCKED=${uniqueBlocked} RANGE_BLOCKED=${rangeBlocked}`
  );
  const ok = count === 1 && doc.overallProgress === 80 && doc.stages.foundation === 80 && uniqueBlocked && rangeBlocked;
  console.log(ok ? 'PROGRESS_CHECK=PASS' : 'PROGRESS_CHECK=FAIL');
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.log('ERR:' + e.message);
  process.exit(1);
});
