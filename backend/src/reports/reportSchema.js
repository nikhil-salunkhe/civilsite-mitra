/**
 * ---------------------------------------------------------------------------
 * Standard Site Report dossier - single source of truth for section order,
 * titles and column headings.
 * ---------------------------------------------------------------------------
 * The SAME schema drives:
 *   1. the PDF dossier (reports/siteReport.js)
 *   2. the Excel workbook (exports/excelExport.js)
 *   3. the CSV bundle section order (controllers/reportController.js)
 *   4. the on-screen preview in the Reports tab (frontend)
 *
 * Every export lists the SAME sections in the SAME order with the SAME record
 * rows - only the rendering differs (PDF pages, Excel sheets, CSV blocks,
 * HTML tables). Update THIS file when a section or column must change and all
 * four outputs stay consistent.
 */

// The canonical numbered section list for a site dossier. [number, JSON key, title].
// Moved here from reportService.js so the service, the PDF renderer and the
// Reports tab all import the SAME spec - one list, one numbering, everywhere.
const SITE_REPORT_SECTIONS = [
  [1, 'site', 'Site Particulars'],
  [2, 'summary', 'Financial Summary'],
  [3, 'installments', 'Installment Schedule'],
  [4, 'payments', 'Owner Payments Received'],
  [5, 'workers', 'Labour Register & Payments'],
  [6, 'attendance', 'Attendance Register'],
  [7, 'materials', 'Material Purchases'],
  [8, 'materialUsage', 'Material Consumption'],
  [9, 'materialStock', 'Material Stock Position'],
  [10, 'vendors', 'Vendor Register'],
  [11, 'vendorPayments', 'Vendor Payments'],
  [12, 'expenses', 'Other Expenses'],
  [13, 'activities', 'Daily Work Diary'],
  [14, 'documents', 'Documents Register'],
];

// Column headings per register. PDF, Excel and CSV must use these verbatim so
// a printed dossier and a spreadsheet export read identically.
const REGISTER_COLUMNS = {
  installments: ['#', 'Installment', 'Amount', 'Paid', 'Balance', 'Status', 'Due Date'],
  payments: ['Receipt Date', 'Amount', 'Mode', 'Reference', 'Installment', 'Notes'],
  workers: ['Worker', 'Type', 'Daily Wage', 'Days Worked', 'Total Payable', 'Paid', 'Balance'],
  'worker-payments': ['Date', 'Worker', 'Work Days', 'Total Amount', 'Paid', 'Balance', 'Mode'],
  attendance: ['Worker', 'Present Days', 'Absent Days', 'Half Days', 'Total Days'],
  materials: ['Purchase Date', 'Material', 'Category', 'Vendor', 'Quantity', 'Unit', 'Rate', 'Total', 'Paid', 'Balance', 'Invoice', 'Status'],
  'material-usage': ['Date', 'Material', 'Quantity', 'Unit', 'Used For', 'Recorded By'],
  vendors: ['Vendor', 'Mobile', 'Category', 'Purchases', 'Paid', 'Balance'],
  'vendor-payments': ['Date', 'Vendor', 'Material', 'Quantity', 'Unit', 'Amount', 'Mode', 'Reference', 'Notes'],
  expenses: ['Date', 'Category', 'Description', 'Amount', 'Paid', 'Balance', 'Status', 'Mode'],
  activities: ['Date', 'Work Description', 'Workers Present', "Day's Expense"],
};

// As a permanent site record the dossier must be able to hold a full ledger,
// so register sections paginate instead of cutting rows off.
const REGISTER_PAGE_SIZE = 22;

const REPORT_DISCLAIMER =
  'Estimated figures are based on records entered in CivilSiteMitra and are provisional until the project is completed and all costs are finalized.';

module.exports = {
  SITE_REPORT_SECTIONS,
  REPORT_SECTIONS: SITE_REPORT_SECTIONS,
  REGISTER_COLUMNS,
  REGISTER_PAGE_SIZE,
  REPORT_DISCLAIMER,
};
