const Site = require('../models/Site');
const { ApiError } = require('../middleware/errorHandler');
const { USER_ROLES } = require('../config/constants');

/**
 * MULTI-TENANT GUARD - the single place where site access is decided.
 *
 * Every site-scoped request (sites, payments, installments, workers, materials,
 * vendors, expenses, activities, documents, reports, exports) resolves the site
 * through this helper, so there is exactly one authorization rule in the whole
 * API and it cannot drift between modules.
 *
 *   - An engineer only ever receives a site where site.engineer === req.userId.
 *   - A missing/foreign site returns 404 (not 403) so an engineer cannot probe
 *     for the existence of another engineer's records.
 *   - The Super Admin is allowed through for the read-only global views.
 *
 * @param {import('express').Request} req must carry req.user and req.userId
 * @returns {Promise<object>} the site document
 */
const findOwnedSite = async (req) => {
  const siteId = req.params.siteId || req.params.id;

  if (!siteId) {
    throw new ApiError('Site id is required', 400);
  }

  const isSuperAdmin = req.user && req.user.role === USER_ROLES.SUPER_ADMIN;

  const site = await Site.findOne(
    isSuperAdmin ? { _id: siteId } : { _id: siteId, engineer: req.userId }
  );

  if (!site) {
    throw new ApiError('Site not found', 404);
  }

  return site;
};

/**
 * Same guard, but for records attached to a site (payment, material, worker...).
 * The child record must belong to the site that belongs to the caller.
 *
 * @param {object} Model mongoose model of the child document
 * @param {import('express').Request} req
 * @returns {Promise<object>} the child document
 */
const findOwnedChild = async (Model, req) => {
  await findOwnedSite(req);

  const doc = await Model.findOne({ _id: req.params.id, site: req.params.siteId });

  if (!doc) {
    throw new ApiError(`${Model.modelName} not found`, 404);
  }

  return doc;
};

module.exports = { findOwnedSite, findOwnedChild };
