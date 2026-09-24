const Site = require('../models/Site');
const { ApiError } = require('./errorHandler');
const { USER_ROLES } = require('../config/constants');

/**
 * MULTI-TENANT SITE LOADER
 * ----------------------------------------------------------------------------
 * Registered once via `router.param('siteId', loadSite)` in routes/sites.js.
 * Express runs it for EVERY route that contains a `:siteId` parameter, so all
 * nested resources (payments, installments, workers, materials, vendors,
 * expenses, activities, documents, reports) inherit the ownership check
 * automatically. A controller can therefore never be reached without the
 * tenant guard having passed.
 *
 * Rules:
 *   - The site must exist AND belong to the authenticated engineer.
 *   - Anything else answers 404 (not 403) so an engineer cannot probe which
 *     site ids exist in other tenants.
 *   - SUPER_ADMIN may inspect any site (read-only global reporting) but may
 *     never mutate engineer-owned site data.
 *
 * On success `req.site` (a hydrated document) is available to the controller.
 */
const loadSite = async (req, res, next, siteId) => {
  try {
    const site = await Site.findById(siteId);

    if (!site) {
      return next(new ApiError('Site not found', 404));
    }

    const isOwner = site.engineer.toString() === req.userId.toString();
    const isSuperAdmin = req.user.role === USER_ROLES.SUPER_ADMIN;

    if (!isOwner && !isSuperAdmin) {
      // Deliberately identical to the "does not exist" response.
      return next(new ApiError('Site not found', 404));
    }

    if (isSuperAdmin && req.method !== 'GET') {
      return next(
        new ApiError(
          'Super Admin has read-only access to engineer site data',
          403
        )
      );
    }

    req.site = site;
    req.siteId = site._id;
    req.isSiteOwner = isOwner;

    return next();
  } catch (error) {
    // Invalid ObjectId format (CastError) surfaces as a normal 404 too.
    if (error.name === 'CastError') {
      return next(new ApiError('Site not found', 404));
    }
    return next(error);
  }
};

module.exports = { loadSite };
