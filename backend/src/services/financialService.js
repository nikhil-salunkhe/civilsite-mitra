const mongoose = require('mongoose');
const Site = require('../models/Site');
const Payment = require('../models/Payment');
const Installment = require('../models/Installment');
const Material = require('../models/Material');
const WorkerPayment = require('../models/WorkerPayment');
const VendorPayment = require('../models/VendorPayment');
const Expense = require('../models/Expense');
const { INSTALLMENT_STATUS } = require('../config/constants');

/**
 * ============================================================================
 * FINANCIAL MODEL - single source of truth. Never duplicate this logic.
 * ============================================================================
 *
 * Every cost is tracked on two bases:
 *
 *   committed -> the full obligation created by the record
 *                (e.g. a material purchase of 100 bags @ 350 = 35,000)
 *   paid      -> the cash that has actually left the business
 *
 * Profit is always computed on the COMMITTED basis so the engineer sees the
 * true bottom line of the project:
 *
 *   Estimated Profit = Project Value - Total Committed Investment
 *
 * DOUBLE COUNTING RULE (materials vs vendors):
 *   - A `Material` record creates the purchase obligation.
 *   - A `VendorPayment` records cash paid to a vendor.
 *   - When a VendorPayment is linked to a Material, that payment settles that
 *     material and is therefore NOT added as a cost of its own. The material's
 *     effective paid amount becomes
 *         max(material.paidAmount, vendor payments linked to that material)
 *     Taking the maximum means the same outflow is never counted twice and is
 *     never missed when the engineer records the cash on either side.
 *   - A VendorPayment with no material link is a standalone vendor obligation
 *     and is counted in full (committed = paid = amount).
 */

const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const emptyBucket = () => ({ committed: 0, paid: 0, pending: 0 });

/**
 * Core aggregation used by the site, engineer and system summaries.
 * Runs a constant number of queries regardless of how many sites are involved.
 *
 * @param {object} match MongoDB match filter: { site: id } | { engineer: id } | {}
 * @returns {Promise<object>} investment breakdown on committed / paid basis
 */
const computeInvestment = async (match) => {
  const [materialRows, vendorRows, workerRows, expenseRows] = await Promise.all([
    Material.aggregate([
      { $match: match },
      { $group: { _id: '$_id', committed: { $sum: '$totalAmount' }, paid: { $sum: '$paidAmount' } } },
    ]),
    VendorPayment.aggregate([
      { $match: match },
      { $group: { _id: '$material', paid: { $sum: '$amount' } } },
    ]),
    WorkerPayment.aggregate([
      { $match: match },
      { $group: { _id: null, committed: { $sum: '$totalAmount' }, paid: { $sum: '$paidAmount' } } },
    ]),
    Expense.aggregate([
      { $match: match },
      { $group: { _id: null, committed: { $sum: '$amount' }, paid: { $sum: '$paidAmount' } } },
    ]),
  ]);

  // Vendor payments grouped by the material they settle. `_id: null` collects
  // the standalone vendor payments that are not tied to any material.
  const vendorPaidByMaterial = new Map();
  let vendorStandalone = 0;
  for (const row of vendorRows) {
    if (row._id) {
      vendorPaidByMaterial.set(String(row._id), round2(row.paid));
    } else {
      vendorStandalone += Number(row.paid) || 0;
    }
  }

  const materials = emptyBucket();
  for (const row of materialRows) {
    const committed = round2(row.committed);
    const viaVendor = vendorPaidByMaterial.get(String(row._id)) || 0;
    // max() -> see DOUBLE COUNTING RULE above
    const paid = Math.min(committed, Math.max(round2(row.paid), viaVendor));
    materials.committed += committed;
    materials.paid += paid;
  }
  materials.committed = round2(materials.committed);
  materials.paid = round2(materials.paid);
  materials.pending = round2(Math.max(0, materials.committed - materials.paid));

  // Only vendor payments NOT attached to a material are a cost of their own.
  const vendors = emptyBucket();
  vendors.committed = round2(vendorStandalone);
  vendors.paid = round2(vendorStandalone);
  vendors.pending = 0;

  const workers = emptyBucket();
  workers.committed = round2(workerRows[0] && workerRows[0].committed);
  workers.paid = round2(workerRows[0] && workerRows[0].paid);
  workers.pending = round2(Math.max(0, workers.committed - workers.paid));

  const otherExpenses = emptyBucket();
  otherExpenses.committed = round2(expenseRows[0] && expenseRows[0].committed);
  otherExpenses.paid = round2(expenseRows[0] && expenseRows[0].paid);
  otherExpenses.pending = round2(Math.max(0, otherExpenses.committed - otherExpenses.paid));

  const committedTotal = round2(
    materials.committed + vendors.committed + workers.committed + otherExpenses.committed
  );
  const paidTotal = round2(materials.paid + vendors.paid + workers.paid + otherExpenses.paid);

  return {
    materials,
    vendors,
    workers,
    otherExpenses,
    committedTotal,
    paidTotal,
    outstandingPayable: round2(Math.max(0, committedTotal - paidTotal)),
  };
};

/**
 * Profit helpers - kept here so every screen, report and export agrees.
 *
 *   estimatedProfit = projectValue - committed investment   (bottom line)
 *   profitMargin    = estimatedProfit / projectValue * 100
 *   realizedProfit  = cash received - cash paid             (cash-flow view)
 */
const computeProfit = (projectValue, investmentCommitted, investmentPaid, totalReceived = 0) => {
  const value = round2(projectValue);
  const committed = round2(investmentCommitted);
  const estimatedProfit = round2(value - committed);

  return {
    projectValue: value,
    totalInvestment: committed,
    estimatedProfit,
    profitMargin: value > 0 ? round2((estimatedProfit / value) * 100) : 0,
    totalPaid: round2(investmentPaid),
    realizedProfit: round2(round2(totalReceived) - round2(investmentPaid)),
  };
};

/**
 * Receivables: what the owner has actually paid.
 * @param {object} match e.g. { site: id } or { engineer: id }
 */
const computeReceivables = async (match) => {
  const [paymentRows, installmentRows] = await Promise.all([
    Payment.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Installment.aggregate([{ $match: match }, { $group: { _id: null, agreed: { $sum: '$amount' } } }]),
  ]);

  return {
    totalReceived: round2(paymentRows[0] && paymentRows[0].total),
    installmentAgreed: round2(installmentRows[0] && installmentRows[0].agreed),
  };
};

/**
 * Derives each installment's paid / pending / status from the payments actually
 * recorded against it, so the installment ledger can never drift away from the
 * payment ledger. (`paidAmount` stored on the installment is kept as a manual
 * override and the higher of the two is used - never double counted.)
 */
const getInstallmentBreakdown = async (match) => {
  const [installments, paymentRows] = await Promise.all([
    Installment.find(match).sort({ site: 1, order: 1 }).lean(),
    Payment.aggregate([
      { $match: { ...match, installment: { $ne: null } } },
      { $group: { _id: '$installment', paid: { $sum: '$amount' } } },
    ]),
  ]);

  // Payments grouped by the installment they were recorded against, using the
  // same match filter that selected the installments.
  const paidMap = new Map();
  paymentRows.forEach((row) => paidMap.set(String(row._id), round2(row.paid)));

  return installments.map((item) => {
    const amount = round2(item.amount);
    const viaPayments = paidMap.get(String(item._id)) || 0;
    const paidAmount = Math.min(amount, Math.max(round2(item.paidAmount), viaPayments));
    const pendingAmount = round2(Math.max(0, amount - paidAmount));

    let status = INSTALLMENT_STATUS.PENDING;
    if (pendingAmount === 0) status = INSTALLMENT_STATUS.PAID;
    else if (paidAmount > 0) status = INSTALLMENT_STATUS.PARTIAL;
    else if (item.dueDate && new Date(item.dueDate) < new Date()) status = INSTALLMENT_STATUS.OVERDUE;

    return {
      ...item,
      amount,
      paidAmount,
      pendingAmount,
      status,
    };
  });
};

/**
 * ---------------------------------------------------------------------------
 * calculateSiteFinancialSummary  <- the function every site screen uses
 * ---------------------------------------------------------------------------
 * Accepts a Site document or a site id and returns the canonical numbers.
 *
 * @returns {Promise<object>} projectValue, totalReceived, pendingReceivable,
 *   materialCost, workerCost, vendorCost, otherExpenses, totalInvestment,
 *   totalPaid, outstandingPayable, estimatedProfit, profitMargin, installments
 */
const calculateSiteFinancialSummary = async (siteOrId) => {
  const site = typeof siteOrId === 'object' && siteOrId !== null
    ? siteOrId
    : await Site.findById(siteOrId);

  if (!site) {
    throw new Error('Site not found');
  }

  const siteId = toObjectId(site._id);

  const [investment, receivables, installments] = await Promise.all([
    computeInvestment({ site: siteId }),
    computeReceivables({ site: siteId }),
    getInstallmentBreakdown({ site: siteId }),
  ]);

  const projectValue = round2(site.totalArea * site.ratePerArea);
  const totalReceived = receivables.totalReceived;
  const pendingReceivable = round2(Math.max(0, projectValue - totalReceived));
  const profit = computeProfit(projectValue, investment.committedTotal, investment.paidTotal, totalReceived);

  return {
    siteId: site._id,
    siteName: site.siteName,
    status: site.status,
    ownerName: site.ownerName,
    totalArea: round2(site.totalArea),
    ratePerArea: round2(site.ratePerArea),
    projectValue,
    totalReceived,
    pendingReceivable,
    // Investment breakdown (committed = obligation, paid = cash out)
    materialCost: investment.materials.committed,
    workerCost: investment.workers.committed,
    vendorCost: investment.vendors.committed,
    otherExpenses: investment.otherExpenses.committed,
    breakdown: {
      materials: investment.materials,
      workers: investment.workers,
      vendors: investment.vendors,
      otherExpenses: investment.otherExpenses,
    },
    totalInvestment: profit.totalInvestment,
    totalPaid: profit.totalPaid,
    outstandingPayable: investment.outstandingPayable,
    estimatedProfit: profit.estimatedProfit,
    profitMargin: profit.profitMargin,
    realizedProfit: profit.realizedProfit,
    installmentAgreed: receivables.installmentAgreed,
    installments,
    progress: {
      overall: site.overallProgress || 0,
      stages: site.progress,
    },
  };
};

/**
 * ---------------------------------------------------------------------------
 * calculateEngineerFinancialSummary - every engineer dashboard figure
 * ---------------------------------------------------------------------------
 * All sites belonging to ONE engineer (multi-tenant safe: matched by engineer).
 */
const calculateEngineerFinancialSummary = async (engineerId) => {
  const engineer = toObjectId(engineerId);

  // Same basis for income AND cost: only non-archived sites contribute, so an
  // archived project can never skew profit (its value is out, so its costs
  // must be out too).
  const sites = await Site.find({ engineer, isArchived: false })
    .select('siteName ownerName city status totalArea ratePerArea overallProgress startDate expectedCompletionDate')
    .sort({ createdAt: -1 })
    .lean();
  const activeIds = sites.map((s) => s._id);

  const [investment, receivables] = await Promise.all([
    computeInvestment({ engineer, site: { $in: activeIds } }),
    computeReceivables({ engineer, site: { $in: activeIds } }),
  ]);

  const projectValue = round2(
    sites.reduce((acc, site) => acc + (Number(site.totalArea) || 0) * (Number(site.ratePerArea) || 0), 0)
  );
  const profit = computeProfit(projectValue, investment.committedTotal, investment.paidTotal, receivables.totalReceived);

  return {
    projectValue,
    totalReceived: receivables.totalReceived,
    pendingReceivable: round2(Math.max(0, projectValue - receivables.totalReceived)),
    materialCost: investment.materials.committed,
    workerCost: investment.workers.committed,
    vendorCost: investment.vendors.committed,
    otherExpenses: investment.otherExpenses.committed,
    totalInvestment: profit.totalInvestment,
    totalPaid: profit.totalPaid,
    outstandingPayable: investment.outstandingPayable,
    estimatedProfit: profit.estimatedProfit,
    profitMargin: profit.profitMargin,
    realizedProfit: profit.realizedProfit,
    siteCount: sites.length,
    sites,
  };
};

/**
 * ---------------------------------------------------------------------------
 * calculateSystemFinancialSummary - Super Admin system-wide totals
 * ---------------------------------------------------------------------------
 * Aggregates across ALL engineers. Nobody may derive these numbers by summing
 * two engineers' private summaries on the client - compute them here.
 *
 * @param {object} siteMatch optional site filter ({ engineer }, { status },
 *   { createdAt }, { _id }) used by the admin Reports page. Record matching is
 *   always scoped to the SAME (non-archived) site set as project value so the
 *   two sides of the profit equation can never disagree.
 */
const calculateSystemFinancialSummary = async (siteMatch = {}) => {
  const match = { ...(siteMatch || {}), isArchived: false };
  const activeIds = await Site.distinct('_id', match);

  const [siteRows, investment, receivables] = await Promise.all([
    Site.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          projectValue: { $sum: { $multiply: ['$totalArea', '$ratePerArea'] } },
        },
      },
    ]),
    computeInvestment({ site: { $in: activeIds } }),
    computeReceivables({ site: { $in: activeIds } }),
  ]);

  const projectValue = round2(siteRows[0] && siteRows[0].projectValue);
  const totalSites = (siteRows[0] && siteRows[0].total) || 0;
  const profit = computeProfit(projectValue, investment.committedTotal, investment.paidTotal, receivables.totalReceived);

  return {
    totalSites,
    projectValue,
    totalReceived: receivables.totalReceived,
    pendingReceivable: round2(Math.max(0, projectValue - receivables.totalReceived)),
    materialCost: investment.materials.committed,
    workerCost: investment.workers.committed,
    vendorCost: investment.vendors.committed,
    otherExpenses: investment.otherExpenses.committed,
    totalInvestment: profit.totalInvestment,
    totalPaid: profit.totalPaid,
    outstandingPayable: investment.outstandingPayable,
    estimatedProfit: profit.estimatedProfit,
    profitMargin: profit.profitMargin,
    realizedProfit: profit.realizedProfit,
  };
};

module.exports = {
  round2,
  toObjectId,
  computeInvestment,
  computeProfit,
  computeReceivables,
  getInstallmentBreakdown,
  calculateSiteFinancialSummary,
  calculateEngineerFinancialSummary,
  calculateSystemFinancialSummary,
};

