const ExcelJS = require('exceljs');
const { toIsoDate, safeFileSlug } = require('../utils/format');

/**
 * ---------------------------------------------------------------------------
 * Excel workbook builder (.xlsx)
 * ---------------------------------------------------------------------------
 * Produces one workbook per site with a sheet per module, live column filters,
 * frozen header rows, real numeric cells (so the engineer can keep working in
 * Excel) and a TOTAL row on every money column.
 *
 * Currency cells use the `"Rs. "#,##0.00` number format instead of the rupee
 * glyph so the file opens correctly in every Excel/LibreOffice locale.
 */

const MONEY_FMT = '"Rs. "#,##0.00';
const DATE_FMT = 'dd-mmm-yyyy';
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const TOTAL_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

const setColumns = (sheet, columns) => {
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.font = HEADER_FONT;
  header.height = 20;
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF1E3A8A' } } };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
};

/** Adds a bold TOTAL row and returns the new row number. */
const addTotalRow = (sheet, columns, totalsByKey, label = 'TOTAL') => {
  const hasLabelColumn = columns.some((col) => col.key === 'label');
  const values = columns.map((col, index) => {
    if (hasLabelColumn) return col.key === 'label' ? label : totalsByKey[col.key] ?? '';
    // No dedicated label column - place the label in the first column.
    if (index === 0) return label;
    return totalsByKey[col.key] ?? '';
  });
  const row = sheet.addRow(values);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = TOTAL_FILL;
    cell.border = { top: { style: 'thin', color: { argb: 'FF94A3B8' } } };
  });
  return row.number;
};

/** Applies the money / date number formats to the given column keys. */
const applyFormats = (sheet, columns, moneyKeys, dateKeys) => {
  columns.forEach((col) => {
    if (!moneyKeys.includes(col.key) && !dateKeys.includes(col.key)) return;
    const numFmt = moneyKeys.includes(col.key) ? MONEY_FMT : DATE_FMT;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      row.getCell(col.key).numFmt = numFmt;
    });
  });
};

const buildSiteWorkbook = async (data, engineerMeta = {}) => {
  const { site, summary, installments, payments, workers, workerPayments, materials, vendors, vendorPayments, expenses, activities } = data;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CivilSiteMitra';
  workbook.lastModifiedBy = engineerMeta.name || 'CivilSiteMitra';
  workbook.created = new Date();
  workbook.company = 'TechMitra Technology';

  // ------------------------------------------------------------ 1. SUMMARY
  const info = workbook.addWorksheet('Site Summary');
  info.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Value', key: 'value', width: 42 },
  ];
  [
    ['Site Name', site.siteName],
    ['Owner', site.ownerName],
    ['Owner Mobile', site.ownerMobile],
    ['Address', site.address],
    ['City', site.city],
    ['State', site.state],
    ['Area', `${site.totalArea} ${site.areaUnit || 'Sq.Ft'}`],
    ['Rate per Area', site.ratePerArea],
    ['Project Value', summary.projectValue],
    ['Status', site.status],
    ['Overall Progress (%)', site.overallProgress],
    ['Start Date', toIsoDate(site.startDate)],
    ['Expected Completion', toIsoDate(site.expectedCompletionDate)],
    ['', ''],
    ['Amount Received', summary.totalReceived],
    ['Pending Receivable', summary.pendingReceivable],
    ['Material Cost (committed)', summary.materialCost],
    ['Worker Cost (committed)', summary.workerCost],
    ['Vendor Cost (committed)', summary.vendorCost],
    ['Other Expenses (committed)', summary.otherExpenses],
    ['TOTAL INVESTMENT (committed)', summary.totalInvestment],
    ['Cash Actually Paid', summary.totalPaid],
    ['Outstanding Payable', summary.outstandingPayable],
    ['ESTIMATED PROFIT', summary.estimatedProfit],
    ['Profit Margin (%)', summary.profitMargin],
  ].forEach(([field, value]) => info.addRow({ field, value: value ?? '' }));
  setColumns(info, info.columns);
  info.getColumn(2).numFmt = 'General';
  info.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.getCell(2).alignment = { horizontal: 'right' };
    if (rowNumber > 1) row.getCell(1).font = { size: 10 };
  });

  // Money rows inside the key/value summary sheet.
  [9, 16, 17, 18, 19, 20, 21, 22, 23, 24].forEach((rowNumber) => {
    const cell = info.getRow(rowNumber).getCell(2);
    if (typeof cell.value === 'number') cell.numFmt = MONEY_FMT;
  });

  // ------------------------------------------------------- 2. INSTALLMENTS
  const inst = workbook.addWorksheet('Installments');
  const instCols = [
    { header: '#', key: 'order', width: 6 },
    { header: 'Installment', key: 'name', width: 22 },
    { header: 'Description', key: 'description', width: 32 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Paid', key: 'paidAmount', width: 16 },
    { header: 'Pending', key: 'pending', width: 16 },
    { header: 'Due Date', key: 'dueDate', width: 14 },
    { header: 'Payment Date', key: 'paymentDate', width: 14 },
    { header: 'Mode', key: 'paymentMode', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  inst.columns = instCols;
  installments.forEach((item) => {
    inst.addRow({
      order: item.order,
      name: item.name,
      description: item.description,
      amount: Number(item.amount) || 0,
      paidAmount: Number(item.paidAmount) || 0,
      pending: Math.max(0, (Number(item.amount) || 0) - (Number(item.paidAmount) || 0)),
      dueDate: item.dueDate ? new Date(item.dueDate) : null,
      paymentDate: item.paymentDate ? new Date(item.paymentDate) : null,
      paymentMode: item.paymentMode,
      status: item.status,
      notes: item.notes,
    });
  });
  setColumns(inst, instCols);
  applyFormats(inst, instCols, ['amount', 'paidAmount', 'pending'], ['dueDate', 'paymentDate']);
  addTotalRow(inst, instCols, {
    amount: summary.installmentTotal ?? installments.reduce((a, i) => a + (Number(i.amount) || 0), 0),
    paidAmount: summary.installmentPaid ?? installments.reduce((a, i) => a + (Number(i.paidAmount) || 0), 0),
    pending: installments.reduce((a, i) => a + Math.max(0, (Number(i.amount) || 0) - (Number(i.paidAmount) || 0)), 0),
  });
  applyFormats(inst, instCols, ['amount', 'paidAmount', 'pending'], []);

  // ----------------------------------------------------------- 3. PAYMENTS
  const pay = workbook.addWorksheet('Payments');
  const payCols = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Mode', key: 'paymentMode', width: 16 },
    { header: 'Reference', key: 'transactionRef', width: 24 },
    { header: 'Installment', key: 'installmentName', width: 22 },
    { header: 'Notes', key: 'notes', width: 36 },
  ];
  pay.columns = payCols;
  const installmentNameById = new Map(installments.map((i) => [String(i._id), i.name]));
  payments.forEach((p) => {
    pay.addRow({
      date: p.date ? new Date(p.date) : null,
      amount: Number(p.amount) || 0,
      paymentMode: p.paymentMode,
      transactionRef: p.transactionRef,
      installmentName: p.installment ? installmentNameById.get(String(p.installment)) || 'Linked' : '',
      notes: p.notes,
    });
  });
  setColumns(pay, payCols);
  applyFormats(pay, payCols, ['amount'], ['date']);
  addTotalRow(pay, payCols, { amount: payments.reduce((a, p) => a + (Number(p.amount) || 0), 0) });
  applyFormats(pay, payCols, ['amount'], []);

  // ------------------------------------------------------ 4. LABOUR (MEN)
  const wk = workbook.addWorksheet('Workers');
  const wkCols = [
    { header: 'Worker', key: 'name', width: 24 },
    { header: 'Mobile', key: 'mobile', width: 14 },
    { header: 'Type', key: 'workerType', width: 14 },
    { header: 'Contract?', key: 'isContractWorker', width: 11 },
    { header: 'Daily Wage', key: 'dailyWage', width: 14 },
    { header: 'Joining Date', key: 'joiningDate', width: 14 },
    { header: 'Days Worked', key: 'totalWorkDays', width: 13 },
    { header: 'Total Amount', key: 'totalAmount', width: 16 },
    { header: 'Paid', key: 'paidAmount', width: 16 },
    { header: 'Pending', key: 'pendingAmount', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  wk.columns = wkCols;
  workers.forEach((worker) => {
    wk.addRow({
      name: worker.name,
      mobile: worker.mobile,
      workerType: worker.workerType,
      isContractWorker: worker.isContractWorker ? 'Yes' : 'No',
      dailyWage: Number(worker.dailyWage) || 0,
      joiningDate: worker.joiningDate ? new Date(worker.joiningDate) : null,
      totalWorkDays: Number(worker.totalWorkDays) || 0,
      totalAmount: Number(worker.totalAmount) || 0,
      paidAmount: Number(worker.paidAmount) || 0,
      pendingAmount: Number(worker.pendingAmount) || 0,
      status: worker.status,
    });
  });
  setColumns(wk, wkCols);
  applyFormats(wk, wkCols, ['dailyWage', 'totalAmount', 'paidAmount', 'pendingAmount'], ['joiningDate']);
  addTotalRow(wk, wkCols, {
    totalWorkDays: workers.reduce((a, w) => a + (Number(w.totalWorkDays) || 0), 0),
    totalAmount: workers.reduce((a, w) => a + (Number(w.totalAmount) || 0), 0),
    paidAmount: workers.reduce((a, w) => a + (Number(w.paidAmount) || 0), 0),
    pendingAmount: workers.reduce((a, w) => a + (Number(w.pendingAmount) || 0), 0),
  });
  applyFormats(wk, wkCols, ['totalAmount', 'paidAmount', 'pendingAmount'], []);

  // ------------------------------------------------ 5. LABOUR PAYMENTS
  const wkp = workbook.addWorksheet('Worker Payments');
  const wkpCols = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Worker', key: 'workerName', width: 24 },
    { header: 'Days', key: 'workDays', width: 9 },
    { header: 'Daily Wage', key: 'dailyWage', width: 13 },
    { header: 'Total', key: 'totalAmount', width: 16 },
    { header: 'Paid', key: 'paidAmount', width: 16 },
    { header: 'Pending', key: 'pendingAmount', width: 16 },
    { header: 'Mode', key: 'paymentMode', width: 14 },
    { header: 'Payment Date', key: 'paymentDate', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  wkp.columns = wkpCols;
  workerPayments.forEach((row) => {
    wkp.addRow({
      date: row.date ? new Date(row.date) : null,
      workerName: row.worker?.name || row.workerName || '-',
      workDays: Number(row.workDays) || 0,
      dailyWage: Number(row.dailyWage) || 0,
      totalAmount: Number(row.totalAmount) || 0,
      paidAmount: Number(row.paidAmount) || 0,
      pendingAmount: Number(row.pendingAmount) || 0,
      paymentMode: row.paymentMode,
      paymentDate: row.paymentDate ? new Date(row.paymentDate) : null,
      status: row.status,
    });
  });
  setColumns(wkp, wkpCols);
  applyFormats(wkp, wkpCols, ['dailyWage', 'totalAmount', 'paidAmount', 'pendingAmount'], ['date', 'paymentDate']);
  addTotalRow(wkp, wkpCols, {
    workDays: workerPayments.reduce((a, r) => a + (Number(r.workDays) || 0), 0),
    totalAmount: workerPayments.reduce((a, r) => a + (Number(r.totalAmount) || 0), 0),
    paidAmount: workerPayments.reduce((a, r) => a + (Number(r.paidAmount) || 0), 0),
    pendingAmount: workerPayments.reduce((a, r) => a + (Number(r.pendingAmount) || 0), 0),
  });
  applyFormats(wkp, wkpCols, ['totalAmount', 'paidAmount', 'pendingAmount'], []);

  // ------------------------------------------------------- 6. MATERIALS
  const mt = workbook.addWorksheet('Materials');
  const mtCols = [
    { header: 'Purchase Date', key: 'purchaseDate', width: 14 },
    { header: 'Material', key: 'name', width: 26 },
    { header: 'Category', key: 'category', width: 14 },
    { header: 'Vendor', key: 'vendorName', width: 22 },
    { header: 'Quantity', key: 'quantity', width: 11 },
    { header: 'Unit', key: 'unit', width: 9 },
    { header: 'Rate', key: 'rate', width: 12 },
    { header: 'Total', key: 'totalAmount', width: 16 },
    { header: 'Paid', key: 'paidAmount', width: 16 },
    { header: 'Pending', key: 'pendingAmount', width: 16 },
    { header: 'Invoice No', key: 'invoiceNumber', width: 16 },
    { header: 'Status', key: 'paymentStatus', width: 12 },
  ];
  mt.columns = mtCols;
  materials.forEach((mat) => {
    mt.addRow({
      purchaseDate: mat.purchaseDate ? new Date(mat.purchaseDate) : null,
      name: mat.name,
      category: mat.category,
      vendorName: mat.vendor?.name || mat.vendorName || '-',
      quantity: Number(mat.quantity) || 0,
      unit: mat.unit,
      rate: Number(mat.rate) || 0,
      totalAmount: Number(mat.totalAmount) || 0,
      paidAmount: Number(mat.paidAmount) || 0,
      pendingAmount: Number(mat.pendingAmount) || 0,
      invoiceNumber: mat.invoiceNumber,
      paymentStatus: mat.paymentStatus,
    });
  });
  setColumns(mt, mtCols);
  applyFormats(mt, mtCols, ['rate', 'totalAmount', 'paidAmount', 'pendingAmount'], ['purchaseDate']);
  addTotalRow(mt, mtCols, {
    totalAmount: materials.reduce((a, m) => a + (Number(m.totalAmount) || 0), 0),
    paidAmount: materials.reduce((a, m) => a + (Number(m.paidAmount) || 0), 0),
    pendingAmount: materials.reduce((a, m) => a + (Number(m.pendingAmount) || 0), 0),
  });
  applyFormats(mt, mtCols, ['totalAmount', 'paidAmount', 'pendingAmount'], []);

  // --------------------------------------------------------- 7. VENDORS
  const vd = workbook.addWorksheet('Vendors');
  const vdCols = [
    { header: 'Vendor', key: 'name', width: 26 },
    { header: 'Mobile', key: 'mobile', width: 14 },
    { header: 'Email', key: 'email', width: 24 },
    { header: 'Category', key: 'materialCategory', width: 16 },
    { header: 'City', key: 'city', width: 14 },
    { header: 'Materials Supplied', key: 'materialCount', width: 16 },
    { header: 'Total Purchases', key: 'totalPurchases', width: 17 },
    { header: 'Paid', key: 'paidAmount', width: 16 },
    { header: 'Pending', key: 'pendingAmount', width: 16 },
  ];
  vd.columns = vdCols;
  vendors.forEach((vendor) => {
    vd.addRow({
      name: vendor.name,
      mobile: vendor.mobile,
      email: vendor.email,
      materialCategory: vendor.materialCategory,
      city: vendor.city,
      materialCount: Number(vendor.materialCount) || 0,
      totalPurchases: Number(vendor.totalPurchases) || 0,
      paidAmount: Number(vendor.paidAmount) || 0,
      pendingAmount: Number(vendor.pendingAmount) || 0,
    });
  });
  setColumns(vd, vdCols);
  applyFormats(vd, vdCols, ['totalPurchases', 'paidAmount', 'pendingAmount'], []);
  addTotalRow(vd, vdCols, {
    totalPurchases: vendors.reduce((a, v) => a + (Number(v.totalPurchases) || 0), 0),
    paidAmount: vendors.reduce((a, v) => a + (Number(v.paidAmount) || 0), 0),
    pendingAmount: vendors.reduce((a, v) => a + (Number(v.pendingAmount) || 0), 0),
  });
  applyFormats(vd, vdCols, ['totalPurchases', 'paidAmount', 'pendingAmount'], []);

  // -------------------------------------------------- 8. VENDOR PAYMENTS
  const vp = workbook.addWorksheet('Vendor Payments');
  const vpCols = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Vendor', key: 'vendorName', width: 24 },
    { header: 'Material', key: 'materialName', width: 24 },
    { header: 'Quantity', key: 'quantity', width: 11 },
    { header: 'Unit', key: 'unit', width: 9 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Mode', key: 'paymentMode', width: 14 },
    { header: 'Reference', key: 'transactionRef', width: 20 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  vp.columns = vpCols;
  vendorPayments.forEach((row) => {
    vp.addRow({
      date: row.date ? new Date(row.date) : null,
      vendorName: row.vendor?.name || row.vendorName || '-',
      materialName: row.material?.name || row.materialName || '-',
      quantity: Number(row.quantity) || 0,
      unit: row.unit || '',
      amount: Number(row.amount) || 0,
      paymentMode: row.paymentMode,
      transactionRef: row.transactionRef,
      notes: row.notes,
    });
  });
  setColumns(vp, vpCols);
  applyFormats(vp, vpCols, ['amount'], ['date']);
  addTotalRow(vp, vpCols, { amount: vendorPayments.reduce((a, r) => a + (Number(r.amount) || 0), 0) });
  applyFormats(vp, vpCols, ['amount'], []);

  // ------------------------------------------------------- 9. EXPENSES
  const ex = workbook.addWorksheet('Expenses');
  const exCols = [
    { header: 'Date', key: 'expenseDate', width: 14 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Description', key: 'description', width: 36 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Paid', key: 'paidAmount', width: 16 },
    { header: 'Pending', key: 'pendingAmount', width: 16 },
    { header: 'Mode', key: 'paymentMode', width: 14 },
    { header: 'Payment Date', key: 'paymentDate', width: 14 },
    { header: 'Status', key: 'paymentStatus', width: 12 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  ex.columns = exCols;
  expenses.forEach((row) => {
    ex.addRow({
      expenseDate: row.expenseDate ? new Date(row.expenseDate) : null,
      category: row.category,
      description: row.description,
      amount: Number(row.amount) || 0,
      paidAmount: Number(row.paidAmount) || 0,
      pendingAmount: Number(row.pendingAmount) || 0,
      paymentMode: row.paymentMode,
      paymentDate: row.paymentDate ? new Date(row.paymentDate) : null,
      paymentStatus: row.paymentStatus,
      notes: row.notes,
    });
  });
  setColumns(ex, exCols);
  applyFormats(ex, exCols, ['amount', 'paidAmount', 'pendingAmount'], ['expenseDate', 'paymentDate']);
  addTotalRow(ex, exCols, {
    amount: expenses.reduce((a, r) => a + (Number(r.amount) || 0), 0),
    paidAmount: expenses.reduce((a, r) => a + (Number(r.paidAmount) || 0), 0),
    pendingAmount: expenses.reduce((a, r) => a + (Number(r.pendingAmount) || 0), 0),
  });
  applyFormats(ex, exCols, ['amount', 'paidAmount', 'pendingAmount'], []);

  // ----------------------------------------------------- 10. ACTIVITIES
  const ac = workbook.addWorksheet('Activities');
  const acCols = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Workers Present', key: 'workersPresent', width: 15 },
    { header: 'Work Description', key: 'workDescription', width: 40 },
    { header: 'Work Completed', key: 'workCompleted', width: 30 },
    { header: 'Materials Received', key: 'materialsReceived', width: 30 },
    { header: 'Issues', key: 'issues', width: 26 },
    { header: "Today's Expense", key: 'todayExpense', width: 16 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  ac.columns = acCols;
  activities.forEach((row) => {
    ac.addRow({
      date: row.date ? new Date(row.date) : null,
      workersPresent: Number(row.workersPresent) || 0,
      workDescription: row.workDescription,
      workCompleted: row.workCompleted,
      materialsReceived: row.materialsReceived,
      issues: row.issues,
      todayExpense: Number(row.todayExpense) || 0,
      notes: row.notes,
    });
  });
  setColumns(ac, acCols);
  applyFormats(ac, acCols, ['todayExpense'], ['date']);
  addTotalRow(ac, acCols, {
    workersPresent: activities.reduce((a, r) => a + (Number(r.workersPresent) || 0), 0),
    todayExpense: activities.reduce((a, r) => a + (Number(r.todayExpense) || 0), 0),
  });
  applyFormats(ac, acCols, ['todayExpense'], []);

  // --------------------------------------------------- 11. INVESTMENT
  // Mirrors the central financial service: committed obligation vs cash paid.
  const cashPaidToVendors = vendorPayments.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const materialPaidOnRecords = materials.reduce((a, m) => a + (Number(m.paidAmount) || 0), 0);

  const inv = workbook.addWorksheet('Investment');
  const invCols = [
    { header: 'Cost Head', key: 'head', width: 34 },
    { header: 'Committed Amount', key: 'committed', width: 20 },
    { header: 'Cash Paid', key: 'paid', width: 18 },
    { header: 'Outstanding', key: 'pending', width: 18 },
  ];
  inv.columns = invCols;
  [
    {
      head: 'Materials',
      committed: summary.materialCost,
      // Same de-duplication rule as financialService: never count one outflow twice.
      paid: Math.min(
        summary.materialCost,
        Math.max(materialPaidOnRecords, cashPaidToVendors)
      ),
    },
    {
      head: 'Workers',
      committed: summary.workerCost,
      paid: workerPayments.reduce((a, r) => a + (Number(r.paidAmount) || 0), 0),
    },
    {
      head: 'Vendors (not linked to a material)',
      committed: summary.vendorCost,
      paid: summary.vendorCost,
    },
    {
      head: 'Other Expenses',
      committed: summary.otherExpenses,
      paid: expenses.reduce((a, r) => a + (Number(r.paidAmount) || 0), 0),
    },
  ].forEach((row) => {
    inv.addRow({
      head: row.head,
      committed: row.committed,
      paid: row.paid,
      pending: Math.max(0, row.committed - row.paid),
    });
  });
  inv.addRow({
    head: 'TOTAL INVESTMENT',
    committed: summary.totalInvestment,
    paid: summary.totalPaid,
    pending: summary.outstandingPayable,
  });
  setColumns(inv, invCols);
  applyFormats(inv, invCols, ['committed', 'paid', 'pending'], []);
  inv.getRow(inv.rowCount).font = { bold: true, size: 11 };
  inv.getRow(inv.rowCount).eachCell((cell) => {
    cell.fill = TOTAL_FILL;
  });

  // ------------------------------------------------------ 12. PROFIT
  const pf = workbook.addWorksheet('Profit');
  pf.columns = [
    { header: 'Particulars', key: 'field', width: 34 },
    { header: 'Amount', key: 'value', width: 22 },
  ];
  [
    ['Project Value (Area x Rate)', summary.projectValue],
    ['Total Investment (committed)', summary.totalInvestment],
    ['ESTIMATED PROFIT', summary.estimatedProfit],
    ['Profit Margin (%)', summary.profitMargin],
    ['Amount Received from Owner', summary.totalReceived],
    ['Pending Receivable', summary.pendingReceivable],
    ['Cash Paid Against Investment', summary.totalPaid],
    ['Outstanding Payable', summary.outstandingPayable],
    ['Profit Realised (Received - Paid)', summary.realizedProfit],
  ].forEach(([field, value]) => pf.addRow({ field, value: value ?? 0 }));
  setColumns(pf, pf.columns);
  pf.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    // Row 5 is the margin percentage, everything else is money.
    if (rowNumber === 5) {
      row.getCell(2).numFmt = '0.00"%"';
      return;
    }
    const cell = row.getCell(2);
    if (typeof cell.value === 'number') cell.numFmt = MONEY_FMT;
  });
  pf.getRow(4).font = { bold: true, size: 11 };

  return workbook;
};

module.exports = { buildSiteWorkbook, MONEY_FMT, DATE_FMT };





