// Helpers for the report payload: attendance rollup + derived material stock.
// Attendance rollup for one site: distinct days recorded plus the count of
// each status token, so the report can state "47 days / 312 present".
// Honors the same from/to date filter as the other record lists.
const getAttendanceSummaryForSite = async (siteId, filters = {}) => {
  const { from, to } = filters || {};
  const match = { site: siteId };
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      if (String(to).length <= 10) end.setHours(23, 59, 59, 999);
      match.date.$lte = end;
    }
  }
  const rows = await WorkerAttendance.aggregate([
    { $match: match },
    { $group: { _id: { date: '$date', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const totals = { days: 0, Present: 0, Absent: 0, HalfDay: 0, Leave: 0 };
  const byDate = new Set();
  for (const row of rows) {
    byDate.add(new Date(row._id.date).toDateString());
    if (totals[row._id.status] !== undefined) totals[row._id.status] += row.count;
  }
  totals.days = byDate.size;
  return totals;
};

// Derived material stock for one site: purchased minus consumed per
// material name+unit, reusing the same lot-consumption order as the stock tab.
const getStockForSite = async (siteId) => {
  const purchases = await Material.find({ site: siteId }).sort({ purchaseDate: 1 }).lean();
  const usages = await MaterialUsage.find({ site: siteId }).sort({ date: 1 }).lean();
  const lots = {};
  for (const purchase of purchases) {
    const key = `${purchase.name}__${purchase.unit}`;
    if (!lots[key]) lots[key] = { name: purchase.name, unit: purchase.unit, purchased: 0, used: 0 };
    lots[key].purchased += Number(purchase.quantity) || 0;
  }
  for (const usage of usages) {
    const key = `${usage.materialName}__${usage.unit}`;
    if (!lots[key]) lots[key] = { name: usage.materialName, unit: usage.unit, purchased: 0, used: 0 };
    lots[key].used += Number(usage.quantity) || 0;
  }
  return Object.values(lots).map((lot) => ({
    ...lot,
    balance: Math.round((lot.purchased - lot.used) * 100) / 100,
  }));
};

module.exports = { getAttendanceSummaryForSite, getStockForSite };
