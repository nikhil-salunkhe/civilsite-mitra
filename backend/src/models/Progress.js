const mongoose = require('mongoose');

/**
 * Progress — the 14th collection.
 *
 * Site.progress / Site.overallProgress remain the fast read-model used by
 * summaries, PDFs and the UI. This collection persists the same values in
 * their own right (one document per site) so progress can be queried and
 * reported on globally without scanning every site document.
 *
 * updateProgress() upserts here on every change, site creation seeds a
 * document, and site/engineer deletion cascades it away.
 */
const progressSchema = new mongoose.Schema(
  {
    site: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      required: true,
      unique: true, // exactly one progress record per site
    },
    engineer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    stages: {
      foundation: { type: Number, default: 0, min: 0, max: 100 },
      plinth: { type: Number, default: 0, min: 0, max: 100 },
      structure: { type: Number, default: 0, min: 0, max: 100 },
      brickwork: { type: Number, default: 0, min: 0, max: 100 },
      electrical: { type: Number, default: 0, min: 0, max: 100 },
      plumbing: { type: Number, default: 0, min: 0, max: 100 },
      flooring: { type: Number, default: 0, min: 0, max: 100 },
      painting: { type: Number, default: 0, min: 0, max: 100 },
      finishing: { type: Number, default: 0, min: 0, max: 100 },
    },
    overallProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

const Progress = mongoose.model('Progress', progressSchema);

module.exports = Progress;