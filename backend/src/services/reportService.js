const Site = require('../models/Site');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const Worker = require('../models/Worker');
const WorkerPayment = require('../models/WorkerPayment');
const Material = require('../models/Material');
const Vendor = require('../models/Vendor');
const VendorPayment = require('../models/VendorPayment');
const Expense = require('../models/Expense');
const Activity = require('../models/Activity');
const { calculateSiteFinancialSummary } = require('./financialService');

/**
 * ---------------------------------------------------------------------------
 * assembleSiteReportData
 * ---------------------------------------------------------------------------
 * Collects every record needed by the PDF report, the Excel workbook and the
 * CSV bundle in ONE place, so all three outputs are guaranteed to show the
 * same numbers.
 *
 * SECURITY: the caller (reportController) resolves the site through the
 * tenant-guarded lookup first, so `site` here is already known to belong to the
 * authenticated engineer. Every sub-query is additionally scoped by site id.
 *
 * @param {object} site Mongoose site document (ownership already verified)
 * @returns {Promise<object>} report payload
 */
const assembleSiteReportData = async (site) => {
  const siteId = site._id;

  const [
    summary,
    installments,
    payments,
    workers,
    workerPayments,
    materials,
    vendors,
    vendorPayments,
    expenses,
    activities,
  ] = await Promise.all([
    calculateSiteFinancialSummary(site),
    Installment.find({ site: siteId }).sort({ order: 1 }).lean(),
    Payment.find({ site: siteId }).sort({ date: -1 }).lean(),
    Worker.find({ site: siteId }).sort({ name: 1 }).lean(),
    WorkerPayment.find({ site: siteId }).populate('worker', 'name workerType').sort({ date: -1 }).lean(),
    Material.find({ site: siteId }).populate('vendor', 'name').sort({ purchaseDate: -1 }).lean(),
    Vendor.find({ site: siteId }).sort({ name: 1 }).lean(),
    VendorPayment.find({ site: siteId }).populate('vendor', 'name').sort({ date: -1 }).lean(),
    Expense.find({ site: siteId }).sort({ expenseDate: -1 }).lean(),
    Activity.find({ site: siteId }).sort({ date: -1 }).lean(),
  ]);

  // Worker-wise rollup used by the worker report/export.
  const workerSummary = workers.map((worker) => {
    const rows = workerPayments.filter((wp) => String(wp.worker?._id || wp.worker) === String(worker._id));
    const totalWorkDays = rows.reduce((acc, row) => acc + (Number(row.workDays) || 0), 0);
    const totalAmount = rows.reduce((acc, row) => acc + (Number(row.totalAmount) || 0), 0);
    const paidAmount = rows.reduce((acc, row) => acc + (Number(row.paidAmount) || 0), 0);

    return {
      ...worker,
      totalWorkDays,
      totalAmount,
      paidAmount,
      pendingAmount: Math.max(0, totalAmount - paidAmount),
    };
  });

  // Vendor-wise rollup (purchase obligation + cash paid to that vendor).
  const vendorSummary = vendors.map((vendor) => {
    const vendorMaterials = materials.filter((m) => String(m.vendor?._id || m.vendor) === String(vendor._id));
    const totalPurchases = vendorMaterials.reduce((acc, m) => acc + (Number(m.totalAmount) || 0), 0);
    const materialPaid = vendorMaterials.reduce((acc, m) => acc + (Number(m.paidAmount) || 0), 0);
    const vendorCash = vendorPayments
      .filter((vp) => String(vp.vendor?._id || vp.vendor) === String(vendor._id))
      .reduce((acc, vp) => acc + (Number(vp.amount) || 0), 0);
    // Same de-duplication rule as the financial service: never count the same
    // outflow twice (once on the material, once on the vendor payment).
    const paid = Math.min(totalPurchases, Math.max(materialPaid, vendorCash));

    return {
      ...vendor,
      materialCount: vendorMaterials.length,
      totalPurchases,
      paidAmount: paid,
      pendingAmount: Math.max(0, totalPurchases - paid),
    };
  });

  return {
    site,
    engineer: {
      name: site.engineerName || '',
      company: '',
      email: '',
      mobile: '',
    },
    summary,
    installments,
    payments,
    workers: workerSummary,
    workerPayments,
    materials,
    vendors: vendorSummary,
    vendorPayments,
    expenses,
    activities,
    generatedAt: new Date(),
  };
};

/**
 * Engineer-level report used by the Super Admin "engineer report" view and by
 * the engineer's own reports screen.
 */
const assembleEngineerReportData = async (engineerId, engineer) => {
  const sites = await Site.find({ engineer: engineerId, isArchived: false })
    .sort({ createdAt: -1 })
    .lean();

  const siteSummaries = [];
  for (const site of sites) {
    // Sequential on purpose: a smaller number of concurrent aggregations keeps
    // the connection pool healthy on modest production hosts.
    // eslint-disable-next-line no-await-in-loop
    siteSummaries.push({ site, summary: await calculateSiteFinancialSummary(site) });
  }

  return {
    engineer,
    generatedAt: new Date(),
    siteSummaries,
  };
};

module.exports = { assembleSiteReportData, assembleEngineerReportData };
