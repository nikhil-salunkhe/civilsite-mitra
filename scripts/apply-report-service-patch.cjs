// One-shot codemod: extends reportService.js with attendance, material usage
// and document sections WITHOUT hand-editing the CRLF file (the editor tool
// cannot match its line endings). Run once:
//   node scripts/apply-report-service-patch.cjs
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'backend', 'src', 'services', 'reportService.js');
let text = fs.readFileSync(file, 'utf8');
const EOL = text.includes('\r\n') ? '\r\n' : '\n';
const N = (s) => s.replace(/\n/g, EOL);
let changed = 0;

const apply = (label, oldSnippet, newSnippet) => {
  const oldNorm = N(oldSnippet);
  if (!text.includes(oldNorm)) {
    console.log(`SKIP (not found): ${label}`);
    return;
  }
  text = text.replace(oldNorm, N(newSnippet));
  changed += 1;
  console.log(`OK: ${label}`);
};

// 1. Extra model imports + helpers.
apply(
  'imports',
  `const Activity = require('../models/Activity');
const { calculateSiteFinancialSummary } = require('./financialService');`,
  `const Activity = require('../models/Activity');
const Document = require('../models/Document');
const MaterialUsage = require('../models/MaterialUsage');
const { calculateSiteFinancialSummary } = require('./financialService');
const { getAttendanceSummaryForSite, getStockForSite } = require('./reportHelpers');`
);

// 2. Extra queries inside the Promise.all list.
apply(
  'queries',
  `    Expense.find({ site: siteId, ...range('expenseDate') }).sort({ expenseDate: -1 }).lean(),
    Activity.find({ site: siteId, ...range('date') }).sort({ date: -1 }).lean(),
  ]);`,
  `    Expense.find({ site: siteId, ...range('expenseDate') }).sort({ expenseDate: -1 }).lean(),
    Activity.find({ site: siteId, ...range('date') }).sort({ date: -1 }).lean(),
    Document.find({ site: siteId, isActive: { $ne: false } }).sort({ uploadedDate: -1 }).lean(),
    MaterialUsage.find({ site: siteId, ...range('date') }).populate('material', 'name unit').sort({ date: -1 }).lean(),
    getAttendanceSummaryForSite(siteId, filters),
    getStockForSite(siteId),
  ]);`
);
