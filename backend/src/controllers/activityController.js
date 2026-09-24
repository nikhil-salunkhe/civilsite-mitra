const Activity = require('../models/Activity');
const Site = require('../models/Site');
const Progress = require('../models/Progress');
const { asyncHandler } = require('../middleware/errorHandler');
const { ApiError } = require('../middleware/errorHandler');

// Get activities for a site
const getActivities = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, startDate, endDate } = req.query;

  const query = { site: req.params.siteId };

  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  const activities = await Activity.find(query)
    .sort({ date: -1 })
    .skip((parseInt(page) - 1) * parseInt(limit))
    .limit(parseInt(limit));

  const total = await Activity.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      activities,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    },
  });
});

// Create activity
const createActivity = asyncHandler(async (req, res) => {
  const {
    date,
    type,
    workersPresent,
    workDescription,
    workCompleted,
    materialsReceived,
    issues,
    notes,
    photos,
    todayExpense,
  } = req.body;

  if (!workDescription) {
    throw new ApiError('Work description is required', 400);
  }

  // Verify site belongs to user
  const site = await Site.findById(req.params.siteId);
  if (!site) {
    throw new ApiError('Site not found', 404);
  }

  if (site.engineer.toString() !== req.userId.toString()) {
    throw new ApiError('Unauthorized access', 403);
  }

  const activity = new Activity({
    site: req.params.siteId,
    engineer: req.userId,
    date: date ? new Date(date) : new Date(),
    type: type || 'Other',
    workersPresent: workersPresent || 0,
    workDescription,
    workCompleted: workCompleted || '',
    materialsReceived: materialsReceived || '',
    issues: issues || '',
    notes: notes || '',
    photos: photos || [],
    todayExpense: todayExpense || 0,
  });

  await activity.save();

  res.status(201).json({
    success: true,
    data: activity,
    message: 'Activity logged successfully',
  });
});

// Update progress
const updateProgress = asyncHandler(async (req, res) => {
  const site = await Site.findById(req.params.siteId);

  if (!site) {
    throw new ApiError('Site not found', 404);
  }

  if (site.engineer.toString() !== req.userId.toString()) {
    throw new ApiError('Unauthorized access', 403);
  }

  const {
    foundation, plinth, structure, brickwork,
    electrical, plumbing, flooring, painting, finishing,
    overallProgress,
  } = req.body;

  if (foundation !== undefined) site.progress.foundation = Math.min(100, Math.max(0, foundation));
  if (plinth !== undefined) site.progress.plinth = Math.min(100, Math.max(0, plinth));
  if (structure !== undefined) site.progress.structure = Math.min(100, Math.max(0, structure));
  if (brickwork !== undefined) site.progress.brickwork = Math.min(100, Math.max(0, brickwork));
  if (electrical !== undefined) site.progress.electrical = Math.min(100, Math.max(0, electrical));
  if (plumbing !== undefined) site.progress.plumbing = Math.min(100, Math.max(0, plumbing));
  if (flooring !== undefined) site.progress.flooring = Math.min(100, Math.max(0, flooring));
  if (painting !== undefined) site.progress.painting = Math.min(100, Math.max(0, painting));
  if (finishing !== undefined) site.progress.finishing = Math.min(100, Math.max(0, finishing));

  // Stage values are authoritative when supplied. Otherwise the Overview tab's
  // quick control may post an explicit overall percentage directly.
  const hasStages = [
    foundation, plinth, structure, brickwork, electrical,
    plumbing, flooring, painting, finishing,
  ].some((value) => value !== undefined);

  if (!hasStages && overallProgress !== undefined) {
    const pct = Number(overallProgress);
    if (Number.isNaN(pct)) {
      throw new ApiError('overallProgress must be a number', 400);
    }
    site.overallProgress = Math.min(100, Math.max(0, Math.round(pct)));
  } else {
    site.overallProgress = site.updateOverallProgress();
  }

  // Auto-update status based on overall progress
  if (site.overallProgress >= 100) {
    site.status = 'Completed';
    site.actualCompletionDate = new Date();
  } else if (site.overallProgress > 0) {
    site.status = 'Active';
  }

  await site.save();

  // Keep the dedicated Progress collection (one doc per site) in sync with
  // the Site read-model so the 14th model is queryable on its own.
  await Progress.findOneAndUpdate(
    { site: site._id },
    {
      $set: {
        engineer: site.engineer,
        stages: site.progress,
        overallProgress: site.overallProgress,
      },
    },
    { upsert: true }
  );

  res.status(200).json({
    success: true,
    data: site,
    message: 'Progress updated successfully',
  });
});

// Update activity
const updateActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.findOne({ _id: req.params.id, site: req.params.siteId });
  if (!activity) {
    throw new ApiError('Activity not found', 404);
  }

  const site = await Site.findById(req.params.siteId);
  if (!site) {
    throw new ApiError('Site not found', 404);
  }
  if (site.engineer.toString() !== req.userId.toString()) {
    throw new ApiError('Unauthorized access', 403);
  }

  const allowed = ['date', 'type', 'workersPresent', 'workDescription', 'workCompleted', 'materialsReceived', 'issues', 'notes', 'photos', 'todayExpense'];

  if (req.body.workDescription !== undefined && !String(req.body.workDescription).trim()) {
    throw new ApiError('Work description is required', 400);
  }

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      activity[key] = key === 'date' ? new Date(req.body[key]) : req.body[key];
    }
  }

  await activity.save();

  res.status(200).json({
    success: true,
    data: activity,
    message: 'Activity updated successfully',
  });
});

// Delete activity
const deleteActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.findOne({ _id: req.params.id, site: req.params.siteId });
  if (!activity) {
    throw new ApiError('Activity not found', 404);
  }

  const site = await Site.findById(req.params.siteId);
  if (!site) {
    throw new ApiError('Site not found', 404);
  }
  if (site.engineer.toString() !== req.userId.toString()) {
    throw new ApiError('Unauthorized access', 403);
  }

  await activity.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Activity deleted successfully',
  });
});

module.exports = { getActivities, createActivity, updateActivity, deleteActivity, updateProgress };
