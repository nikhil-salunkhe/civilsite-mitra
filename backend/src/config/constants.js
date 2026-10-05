// Account Status Constants
const ACCOUNT_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BLOCKED: 'BLOCKED',
  INACTIVE: 'INACTIVE',
};

// User Roles
const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ENGINEER: 'ENGINEER',
};

// Payment Modes
const PAYMENT_MODES = {
  CASH: 'Cash',
  UPI: 'UPI',
  BANK_TRANSFER: 'Bank Transfer',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

// Worker Types
const WORKER_TYPES = {
  MASON: 'Mason',
  HELPER: 'Helper',
  CARPENTER: 'Carpenter',
  ELECTRICIAN: 'Electrician',
  PLUMBER: 'Plumber',
  PAINTER: 'Painter',
  LABOUR: 'Labour',
  OTHER: 'Other',
};

// Material Categories
const MATERIAL_CATEGORIES = {
  CEMENT: 'Cement',
  STEEL: 'Steel',
  SAND: 'Sand',
  BRICKS: 'Bricks',
  TILES: 'Tiles',
  ELECTRICAL: 'Electrical',
  PLUMBING: 'Plumbing',
  PAINT: 'Paint',
  HARDWARE: 'Hardware',
  WOOD: 'Wood',
  OTHER: 'Other',
};

// Expense Categories
const EXPENSE_CATEGORIES = {
  TRANSPORTATION: 'Transportation',
  JCB: 'JCB',
  MACHINERY: 'Machinery',
  ELECTRICITY: 'Electricity',
  WATER: 'Water',
  GOVERNMENT_FEES: 'Government Fees',
  PERMISSIONS: 'Permissions',
  ARCHITECT: 'Architect',
  ENGINEER: 'Engineer',
  TRAVEL: 'Travel',
  MISCELLANEOUS: 'Miscellaneous',
};

// Installment Status
const INSTALLMENT_STATUS = {
  PAID: 'Paid',
  PARTIAL: 'Partial',
  PENDING: 'Pending',
  OVERDUE: 'Overdue',
};

// Site Status
const SITE_STATUS = {
  PLANNED: 'Planned',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
};

// Document Types
const DOCUMENT_TYPES = {
  AGREEMENT: 'Agreement',
  BILL: 'Bill',
  INVOICE: 'Invoice',
  MATERIAL_INVOICE: 'Material Invoice',
  SITE_PHOTO: 'Site Photo',
  OTHER: 'Other',
};

// Default Installment Names
const DEFAULT_INSTALLMENTS = [
  { name: 'Foundation', order: 1 },
  { name: 'Plinth', order: 2 },
  { name: 'Slab', order: 3 },
  { name: 'Finishing', order: 4 },
  { name: 'Final', order: 5 },
];

/**
 * Revision of the Terms & Conditions an engineer must accept.
 *
 * Bump this when the T&C text materially changes. Engineers who already
 * accepted an older revision are then re-prompted on next sign-in, which is
 * why the accepted revision is stored on the user rather than as a boolean.
 * Must stay in step with LAST_UPDATED in
 * frontend/src/pages/legal/termsContent.js
 */
const TERMS_VERSION = '2026-10';

module.exports = {
  ACCOUNT_STATUS,
  USER_ROLES,
  PAYMENT_MODES,
  WORKER_TYPES,
  MATERIAL_CATEGORIES,
  EXPENSE_CATEGORIES,
  INSTALLMENT_STATUS,
  SITE_STATUS,
  DOCUMENT_TYPES,
  DEFAULT_INSTALLMENTS,
  TERMS_VERSION,
};
